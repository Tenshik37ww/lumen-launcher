// Аккаунты Roblox. Вход выполняется на настоящей странице roblox.com в отдельном окне с изолированной сессией.
// Lumen не читает и не сохраняет cookie: сессия живёт в хранилище Electron, а для запуска игры от её имени
// запрашивается одноразовый билет входа.
const { session, BrowserWindow } = require('electron');
const crypto = require('crypto');
const B = require('./bootstrapper');
const { xfetch } = require('./http');

const PART_RX = /^persist:acc-[0-9a-f]{16}$/;
const okHost = u => { try { const h = new URL(u).hostname; return h === 'roblox.com' || h.endsWith('.roblox.com'); } catch { return false; } };
const wipe = p => { if (PART_RX.test(p || '')) session.fromPartition(p).clearStorageData().catch(() => {}); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function prep(ses) {
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|lumen[\w-]*)\/\S+/gi, ''));
  const proxy = B.loadConfig().proxy;
  try { await ses.setProxy(proxy ? { proxyRules: proxy } : { mode: 'system' }); } catch {}
}
const pub = async u => { const r = await xfetch(u, { signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error('net'); return r.json(); };

// { user } — сессия жива, { status: 401 } — сессия недействительна, { net: true } — сеть недоступна
async function me(ses) {
  try {
    const r = await ses.fetch('https://users.roblox.com/v1/users/authenticated', { credentials: 'include' });
    return r.ok ? { user: await r.json() } : { status: r.status };
  } catch { return { net: true }; }
}
async function avatar(id) {
  try { const j = await pub(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`); return (j.data && j.data[0] && j.data[0].imageUrl) || null; }
  catch { return null; }
}

function login(parent) {
  const part = 'persist:acc-' + crypto.randomBytes(8).toString('hex'), ses = session.fromPartition(part);
  const ready = prep(ses);
  const w = new BrowserWindow({
    parent, modal: true, width: 520, height: 740, title: 'Roblox', autoHideMenuBar: true,
    webPreferences: { partition: part, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  w.webContents.setWindowOpenHandler(({ url }) => { if (okHost(url)) w.loadURL(url); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e, url) => { if (!okHost(url)) e.preventDefault(); });
  ready.then(() => { if (!w.isDestroyed()) w.loadURL('https://www.roblox.com/login'); });
  return new Promise(resolve => {
    let done = false, busy = false;
    const finish = acc => {
      if (done) return; done = true; clearInterval(iv);
      if (!w.isDestroyed()) w.close();
      if (!acc) wipe(part);
      resolve(acc);
    };
    const iv = setInterval(async () => {
      if (done || busy) return;
      busy = true;
      try {
        if (!(await ses.cookies.get({ name: '.ROBLOSECURITY' })).length) return;
        const m = await me(ses);
        if (!m.user || !m.user.id) return;
        await ses.cookies.flushStore();            // без этого cookie может не успеть записаться на диск
        finish({ id: String(m.user.id), name: m.user.name, display: m.user.displayName || m.user.name, partition: part, avatar: await avatar(m.user.id), expired: false });
      } finally { busy = false; }
    }, 1500);
    w.on('closed', () => finish(null));
  });
}

async function addAccount(parent) {
  const acc = await login(parent), cfg = B.loadConfig();
  if (!acc) return cfg;
  const old = cfg.accounts.find(a => a.id === acc.id);
  if (old) wipe(old.partition);
  return B.saveConfig({ accounts: [...cfg.accounts.filter(a => a.id !== acc.id), acc], activeAccount: cfg.activeAccount || acc.id });
}
function removeAccount(id) {
  const cfg = B.loadConfig(), a = cfg.accounts.find(x => x.id === id);
  if (a) wipe(a.partition);
  return B.saveConfig({ accounts: cfg.accounts.filter(x => x.id !== id), activeAccount: cfg.activeAccount === id ? null : cfg.activeAccount });
}

// проверка всех аккаунтов: помечаем «нужен вход» только при ответе 401, при сбоях сети состояние не меняем
async function checkOne(acc) {
  if (!PART_RX.test(acc.partition || '')) return { state: 'expired' };
  const ses = session.fromPartition(acc.partition);
  await prep(ses);
  const m = await me(ses);
  return m.user ? { state: 'ok', user: m.user } : m.status === 401 ? { state: 'expired' } : { state: 'net' };
}
async function checkAll() {
  const cfg = B.loadConfig(), res = await Promise.all(cfg.accounts.map(async a => [a.id, await checkOne(a)]));
  const map = Object.fromEntries(res);
  return B.saveConfig({ accounts: B.loadConfig().accounts.map(a => {
    const r = map[a.id];
    if (!r || r.state === 'net') return a;
    return r.state === 'ok' ? { ...a, expired: false, name: r.user.name || a.name, display: r.user.displayName || r.user.name || a.display } : { ...a, expired: true };
  }) });
}
async function flushAll() {
  for (const a of B.loadConfig().accounts) {
    if (!PART_RX.test(a.partition || '')) continue;
    try { const s = session.fromPartition(a.partition); await s.cookies.flushStore(); s.flushStorageData(); } catch {}
  }
}

// запрос от имени аккаунта: повторы при сбоях сети, 429 и 5xx, обновление CSRF-токена
async function authRequest(acc, url, opt = {}) {
  if (!PART_RX.test(acc.partition || '')) throw new Error('net');
  const ses = session.fromPartition(acc.partition);
  await prep(ses);
  let csrf = '', lastErr = null;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await ses.fetch(url, {
        method: opt.method || (opt.body ? 'POST' : 'GET'), credentials: 'include', body: opt.body ? JSON.stringify(opt.body) : undefined,
        headers: { 'Content-Type': 'application/json', Origin: 'https://www.roblox.com', Referer: opt.referer || 'https://www.roblox.com/', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
      });
      const tok = r.headers.get('x-csrf-token');
      if (r.status === 403 && tok && tok !== csrf) { csrf = tok; continue; }
      if (r.status === 429) { await sleep(1500 * (i + 1)); continue; }
      if (r.status >= 500) { await sleep(800 * (i + 1)); continue; }
      return r;
    } catch (e) { lastErr = e; await sleep(600 * (i + 1)); }
  }
  throw lastErr || new Error('net');
}
async function json(acc, url, body) {
  const r = await authRequest(acc, url, { body });
  if (r.status === 401) throw new Error('expired');
  if (!r.ok) throw new Error('net');
  return r.json();
}

// запасной способ получить билет: запрос из страницы roblox.com, где Origin и Referer выставляет сам браузер
async function ticketViaPage(acc, placeId) {
  const w = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { partition: acc.partition, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await w.loadURL(`https://www.roblox.com/games/${placeId}`);
    return await w.webContents.executeJavaScript(`(async () => {
      let csrf = '';
      for (let i = 0; i < 2; i++) {
        const r = await fetch('https://auth.roblox.com/v1/authentication-ticket', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) } });
        if (r.status === 403 && r.headers.get('x-csrf-token')) { csrf = r.headers.get('x-csrf-token'); continue; }
        return { status: r.status, ticket: r.headers.get('rbx-authentication-ticket') };
      }
      return { status: 0 };
    })()`);
  } finally { if (!w.isDestroyed()) w.destroy(); }
}

// билет живёт около минуты, поэтому запрашивается непосредственно перед запуском
async function ticketUri(acc, placeId, jobId) {
  let expired = false;
  try {
    const r = await authRequest(acc, 'https://auth.roblox.com/v1/authentication-ticket', { method: 'POST', referer: `https://www.roblox.com/games/${placeId}` });
    if (r.status === 401) expired = true;
    else { const tk = r.headers.get('rbx-authentication-ticket'), uri = r.ok && tk && B.buildTicketUri(tk, placeId, jobId); if (uri) return uri; }
  } catch {}
  if (!expired) {
    try {
      const res = await ticketViaPage(acc, placeId);
      if (res.status === 401) expired = true;
      else if (res.ticket) { const uri = B.buildTicketUri(res.ticket, placeId, jobId); if (uri) return uri; }
    } catch {}
  }
  if (!expired && (await checkOne(acc)).state === 'expired') expired = true;
  throw new Error(expired ? 'expired' : 'ticket');
}

/* ---------- друзья ---------- */
// публичный список пользователей: настоящие имена и отображаемые ники
async function userInfo(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const r = await xfetch('https://users.roblox.com/v1/users', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: ids.slice(i, i + 100), excludeBannedUsers: false }), signal: AbortSignal.timeout(10000) });
      if (r.ok) for (const u of (await r.json()).data || []) out.set(u.id, u);
    } catch {}
  }
  return out;
}
async function friendsOverview(acc) {
  const list = ((await json(acc, `https://friends.roblox.com/v1/users/${encodeURIComponent(acc.id)}/friends`)).data || []).slice(0, 300);
  const ids = list.map(f => f.id).filter(Number.isInteger), pres = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const r = await json(acc, 'https://presence.roblox.com/v1/presence/users', { userIds: ids.slice(i, i + 50) });
    for (const p of r.userPresences || []) pres.set(p.userId, p);
  }
  const [info, uids] = [await userInfo(ids), [...new Set([...pres.values()].map(p => p.universeId).filter(Number.isInteger))]];
  const games = {};
  for (let i = 0; i < uids.length; i += 50) {
    try { for (const d of (await pub(`https://games.roblox.com/v1/games?universeIds=${uids.slice(i, i + 50).join(',')}`)).data || []) games[d.id] = d.name; } catch {}
  }
  const av = {};
  for (let i = 0; i < ids.length; i += 100) {
    try { for (const d of (await pub(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${ids.slice(i, i + 100).join(',')}&size=48x48&format=Png&isCircular=true`)).data || []) av[d.targetId] = d.imageUrl; } catch {}
  }
  return {
    total: list.length,
    friends: list.map(f => {
      const p = pres.get(f.id) || {}, u = info.get(f.id) || {}, name = u.name || f.name || '', display = u.displayName || f.displayName || name;
      return { id: f.id, name, display: display || ('#' + f.id), verified: !!(u.hasVerifiedBadge || f.hasVerifiedBadge), deleted: !name && !display,
        type: p.userPresenceType || 0, location: p.lastLocation || '', placeId: p.placeId || p.rootPlaceId || null, gameId: p.gameId || null,
        lastOnline: p.lastOnline || null, avatar: av[f.id] || null, game: p.universeId && games[p.universeId] ? games[p.universeId] : null };
    }),
  };
}

/* ---------- достижения (значки) в игре ---------- */
async function gameBadges(acc, universeId) {
  if (!/^\d+$/.test(String(universeId))) return { error: 'bad' };
  const list = [];
  let cursor = '';
  for (let p = 0; p < 3; p++) {
    let d;
    try { d = await pub(`https://badges.roblox.com/v1/universes/${universeId}/badges?limit=100&sortOrder=Asc${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`); }
    catch { if (!list.length) return { error: 'net' }; break; }
    list.push(...(d.data || [])); cursor = d.nextPageCursor;
    if (!cursor) break;
  }
  const ids = list.map(b => b.id).filter(Number.isInteger), earned = new Map(), icons = {};
  if (acc) {
    for (let i = 0; i < ids.length; i += 100) {
      try {
        const r = await authRequest(acc, `https://badges.roblox.com/v1/users/${encodeURIComponent(acc.id)}/badges/awarded-dates?badgeIds=${ids.slice(i, i + 100).join(',')}`);
        if (r.ok) for (const x of (await r.json()).data || []) earned.set(x.badgeId, x.awardedDate);
      } catch {}
    }
  }
  for (let i = 0; i < ids.length; i += 100) {
    try { for (const d of (await pub(`https://thumbnails.roblox.com/v1/badges/icons?badgeIds=${ids.slice(i, i + 100).join(',')}&size=150x150&format=Png&isCircular=false`)).data || []) icons[d.targetId] = d.imageUrl; } catch {}
  }
  const pct = v => (v == null ? null : Math.round((v <= 1 ? v * 100 : v) * 10) / 10);
  const badges = list.map(b => ({ id: b.id, name: b.name, description: b.description || '', icon: icons[b.id] || null,
    awarded: b.statistics && b.statistics.awardedCount, rate: pct(b.statistics && b.statistics.winRatePercentage), earned: earned.has(b.id), date: earned.get(b.id) || null }));
  return { badges, total: badges.length, earned: badges.filter(b => b.earned).length, noAccount: !acc };
}
module.exports = { addAccount, removeAccount, ticketUri, friendsOverview, checkAll, flushAll, gameBadges };
