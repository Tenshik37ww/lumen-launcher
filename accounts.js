// Переключение аккаунтов Roblox.
// Вход выполняется на настоящей странице roblox.com в отдельном окне с изолированной сессией.
// Lumen никогда не читает, не показывает и не сохраняет cookie: сессия остаётся в хранилище Electron,
// а для запуска игры запрашивается одноразовый билет входа от имени этой сессии.
const { session, BrowserWindow } = require('electron');
const crypto = require('crypto');
const B = require('./bootstrapper');

const PART_RX = /^persist:acc-[0-9a-f]{16}$/;
const okHost = u => { try { const h = new URL(u).hostname; return h === 'roblox.com' || h.endsWith('.roblox.com'); } catch { return false; } };
const prep = ses => ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|lumen[\w-]*)\/\S+/gi, ''));
const wipe = p => { if (PART_RX.test(p || '')) session.fromPartition(p).clearStorageData().catch(() => {}); };

async function me(ses) {
  try { const r = await ses.fetch('https://users.roblox.com/v1/users/authenticated', { credentials: 'include' }); return r.ok ? await r.json() : null; }
  catch { return null; }
}
async function avatar(id) {
  try {
    const r = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=false`, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    return (j.data && j.data[0] && j.data[0].imageUrl) || null;
  } catch { return null; }
}

function login(parent) {
  const part = 'persist:acc-' + crypto.randomBytes(8).toString('hex'), ses = session.fromPartition(part);
  prep(ses);
  const w = new BrowserWindow({
    parent, modal: true, width: 520, height: 740, title: 'Roblox', autoHideMenuBar: true,
    webPreferences: { partition: part, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  w.webContents.setWindowOpenHandler(({ url }) => { if (okHost(url)) w.loadURL(url); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e, url) => { if (!okHost(url)) e.preventDefault(); });
  w.loadURL('https://www.roblox.com/login');
  return new Promise(resolve => {
    let done = false;
    const finish = acc => {
      if (done) return; done = true; clearInterval(iv);
      if (!w.isDestroyed()) w.close();
      if (!acc) wipe(part);
      resolve(acc);
    };
    const iv = setInterval(async () => {
      if (done) return;
      const c = await ses.cookies.get({ name: '.ROBLOSECURITY' });
      if (!c.length) return;
      const u = await me(ses);
      if (!u || !u.id) return;
      finish({ id: String(u.id), name: u.name, display: u.displayName || u.name, partition: part, avatar: await avatar(u.id), expired: false });
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

// Билет входа живёт около минуты, поэтому запрашивается непосредственно перед запуском
async function ticketUri(acc, placeId, jobId) {
  if (!PART_RX.test(acc.partition || '')) throw new Error('ticket');
  const ses = session.fromPartition(acc.partition);
  prep(ses);
  const H = { Referer: `https://www.roblox.com/games/${placeId}`, Origin: 'https://www.roblox.com', 'Content-Type': 'application/json' };
  let csrf = '';
  for (let i = 0; i < 2; i++) {
    const r = await ses.fetch('https://auth.roblox.com/v1/authentication-ticket', {
      method: 'POST', credentials: 'include', headers: csrf ? { ...H, 'x-csrf-token': csrf } : H,
    });
    if (r.status === 403 && r.headers.get('x-csrf-token')) { csrf = r.headers.get('x-csrf-token'); continue; }
    if (r.status === 401) throw new Error('expired');
    const ticket = r.headers.get('rbx-authentication-ticket');
    const uri = r.ok && ticket && B.buildTicketUri(ticket, placeId, jobId);
    if (uri) return uri;
    break;
  }
  throw new Error('ticket');
}

/* ---------- друзья: данные читаются от имени выбранного аккаунта ---------- */
async function authJson(acc, url, body) {
  if (!PART_RX.test(acc.partition || '')) throw new Error('net');
  const ses = session.fromPartition(acc.partition);
  prep(ses);
  const call = csrf => ses.fetch(url, {
    method: body ? 'POST' : 'GET', credentials: 'include', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', Origin: 'https://www.roblox.com', Referer: 'https://www.roblox.com/', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
  });
  let r = await call('');
  if (r.status === 403 && r.headers.get('x-csrf-token')) r = await call(r.headers.get('x-csrf-token'));
  if (r.status === 401) throw new Error('expired');
  if (!r.ok) throw new Error('net');
  return r.json();
}
const pub = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error('net'); return r.json(); };

async function friendsOverview(acc) {
  const list = ((await authJson(acc, `https://friends.roblox.com/v1/users/${encodeURIComponent(acc.id)}/friends`)).data || []).slice(0, 300);
  const ids = list.map(f => f.id).filter(x => Number.isInteger(x)), pres = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const r = await authJson(acc, 'https://presence.roblox.com/v1/presence/users', { userIds: ids.slice(i, i + 50) });
    for (const p of r.userPresences || []) pres.set(p.userId, p);
  }
  const uids = [...new Set([...pres.values()].map(p => p.universeId).filter(Number.isInteger))], games = {};
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
      const p = pres.get(f.id) || {};
      return { id: f.id, name: f.name, display: f.displayName || f.name, type: p.userPresenceType || 0, location: p.lastLocation || '',
        placeId: p.placeId || p.rootPlaceId || null, gameId: p.gameId || null, lastOnline: p.lastOnline || null, avatar: av[f.id] || null,
        game: p.universeId && games[p.universeId] ? games[p.universeId] : null };
    }),
  };
}
module.exports = { addAccount, removeAccount, ticketUri, friendsOverview };
