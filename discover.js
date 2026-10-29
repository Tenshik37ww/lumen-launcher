// Поиск игр (поиск Roblox + фильтры на нашей стороне) и лента обновлений избранных игр.
// Используются публичные API Roblox. omni-search не документирован и может измениться.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const B = require('./bootstrapper');

const j = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const num = v => (/^\d+$/.test(String(v)) ? String(v) : null);

async function enrich(uids) {
  const out = new Map();
  for (const c of chunk(uids.map(num).filter(Boolean), 50)) {
    const q = c.join(',');
    const [g, v, i] = await Promise.all([
      j(`https://games.roblox.com/v1/games?universeIds=${q}`),
      j(`https://games.roblox.com/v1/games/votes?universeIds=${q}`).catch(() => ({ data: [] })),
      j(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${q}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false`).catch(() => ({ data: [] })),
    ]);
    for (const d of g.data || []) out.set(String(d.id), { universeId: String(d.id), placeId: String(d.rootPlaceId), name: d.name, playing: d.playing || 0, visits: d.visits || 0,
      fav: d.favoritedCount || 0, max: d.maxPlayers, genre: d.genre_l1 || d.genre || '', updated: d.updated, created: d.created, creator: d.creator && d.creator.name });
    for (const x of v.data || []) { const e = out.get(String(x.id)); if (e) { e.up = x.upVotes; e.down = x.downVotes; } }
    for (const x of i.data || []) { const e = out.get(String(x.targetId)); if (e) e.icon = x.imageUrl; }
  }
  return out;
}

// формат ответа omni-search нестабилен, поэтому ищем идентификаторы игр по всему дереву
function collect(o, ids, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 8) return;
  if (Array.isArray(o)) { o.forEach(x => collect(x, ids, depth + 1)); return; }
  if (o.contentType === 'Game' && num(o.contentId)) ids.add(num(o.contentId));
  else if (num(o.universeId)) ids.add(num(o.universeId));
  for (const k in o) if (o[k] && typeof o[k] === 'object') collect(o[k], ids, depth + 1);
}

const DEFAULT_QS = ['simulator', 'obby', 'tycoon', 'rpg', 'horror'];
async function search(f = {}) {
  const q = String(f.q || '').trim().slice(0, 80), genre = String(f.genre || '').trim().slice(0, 30);
  const queries = q ? [genre ? `${q} ${genre}` : q] : genre ? [genre] : DEFAULT_QS;
  const ids = new Set();
  let failed = 0;
  await Promise.all(queries.map(async qq => {
    try { collect(await j(`https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(qq)}&sessionId=${crypto.randomUUID()}&pageType=all`), ids); }
    catch { failed++; }
  }));
  if (!ids.size) return { error: failed === queries.length ? 'net' : 'none' };
  let list;
  try { list = [...(await enrich([...ids].slice(0, 100))).values()]; } catch { return { error: 'net' }; }
  const now = Date.now();
  list = list.map(g => ({ ...g, rating: g.up != null && g.up + g.down > 0 ? Math.round(g.up / (g.up + g.down) * 100) : null }));
  const minR = +f.minRating || 0, minP = +f.minPlayers || 0, days = +f.updatedDays || 0;
  list = list.filter(g => (!minR || (g.rating != null && g.rating >= minR)) && g.playing >= minP &&
    (!days || (g.updated && now - Date.parse(g.updated) <= days * 864e5)));
  const by = {
    players: (a, b) => b.playing - a.playing, rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
    updated: (a, b) => (Date.parse(b.updated) || 0) - (Date.parse(a.updated) || 0), fav: (a, b) => b.fav - a.fav,
  };
  list.sort(by[f.sort] || by.players);
  return { games: list.slice(0, 60) };
}

/* ---------- лента обновлений ---------- */
const NEWSF = () => path.join(B.P.root, 'news.json');
function loadNews() { try { return JSON.parse(fs.readFileSync(NEWSF(), 'utf8')); } catch { return { items: [], snap: {} }; } }
function saveNews(n) { fs.mkdirSync(B.P.root, { recursive: true }); fs.writeFileSync(NEWSF(), JSON.stringify(n)); }
const followed = p => p && !p.hidden && (p.news === true || (p.fav && p.news !== false));

async function checkNews() {
  const lib = B.loadLibrary(), follow = Object.values(lib).filter(followed);
  for (const p of follow) {
    if (p.universeId) continue;
    try { const u = await j(`https://apis.roblox.com/universes/v1/places/${num(p.placeId)}/universe`); if (num(u.universeId)) { p.universeId = String(u.universeId); B.libSet(p.placeId, { universeId: p.universeId }); } } catch {}
  }
  const data = await enrich(follow.map(p => p.universeId).filter(Boolean));
  const n = loadNews(), fresh = [];
  for (const p of follow) {
    const g = data.get(String(p.universeId));
    if (!g || !g.updated) continue;
    const prev = n.snap[p.universeId];
    if (!prev || Date.parse(g.updated) > Date.parse(prev.updated)) {
      const item = { id: `${p.universeId}:${g.updated}`, placeId: p.placeId, name: g.name, icon: g.icon, at: g.updated, playing: g.playing, unread: !!prev };
      if (!n.items.some(i => i.id === item.id)) { n.items.unshift(item); if (prev) fresh.push(item); }
    }
    n.snap[p.universeId] = { updated: g.updated, playing: g.playing };
    const it = n.items.find(i => i.placeId === p.placeId); if (it && g.playing != null) { /* актуальный онлайн для самой свежей записи */ n.items.filter(i => i.placeId === p.placeId).forEach((x, k) => { if (k === 0) x.playing = g.playing; }); }
  }
  n.items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  n.items = n.items.slice(0, 300);
  saveNews(n);
  return { fresh };
}
function getFeed() {
  const lib = B.loadLibrary(), n = loadNews();
  const items = n.items.filter(i => followed(lib[i.placeId]));
  return { items, unread: items.filter(i => i.unread).length };
}
function markRead() { const n = loadNews(); n.items.forEach(i => { i.unread = false; }); saveNews(n); }
module.exports = { search, enrich, collect, checkNews, getFeed, markRead };
