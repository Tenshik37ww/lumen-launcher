/* Расширения интерфейса: темы, живые обои, библиотека с папками, поиск игр, лента, друзья, статистика, инструменты, оверлей.
   Файл подключается после app.js и использует его глобальные функции (E, t, ctl, save, show, play, build, PAGES, NAV…). */

Object.assign(THEMES, {
  nord:            { bg: '#2e3440', panel: '#3b4252', line: '#4c566a', text: '#eceff4', mute: '#9aa5b8', accent: '#88c0d0', danger: '#bf616a' },
  dracula:         { bg: '#282a36', panel: '#343746', line: '#44475a', text: '#f8f8f2', mute: '#9aa0c0', accent: '#bd93f9', danger: '#ff5555' },
  'solarized-dark':  { bg: '#002b36', panel: '#073642', line: '#124a58', text: '#eee8d5', mute: '#93a1a1', accent: '#b58900', danger: '#dc322f' },
  'solarized-light': { bg: '#fdf6e3', panel: '#fffaf0', line: '#ddd6c1', text: '#073642', mute: '#657b83', accent: '#268bd2', danger: '#dc322f' },
  catppuccin:      { bg: '#1e1e2e', panel: '#313244', line: '#45475a', text: '#cdd6f4', mute: '#a6adc8', accent: '#cba6f7', danger: '#f38ba8' },
  'tokyo-night':   { bg: '#1a1b26', panel: '#24283b', line: '#343a55', text: '#c0caf5', mute: '#7a88b8', accent: '#7aa2f7', danger: '#f7768e' },
  gruvbox:         { bg: '#282828', panel: '#3c3836', line: '#504945', text: '#ebdbb2', mute: '#a89984', accent: '#fabd2f', danger: '#fb4934' },
  'rose-pine':     { bg: '#191724', panel: '#1f1d2e', line: '#302d41', text: '#e0def4', mute: '#908caa', accent: '#ebbcba', danger: '#eb6f92' },
  ocean:           { bg: '#06141f', panel: '#0b2233', line: '#153448', text: '#d7ecf7', mute: '#7fa4ba', accent: '#2ec4f1', danger: '#ff6b6b' },
  sunset:          { bg: '#1b1020', panel: '#2a1630', line: '#43244a', text: '#ffe8d6', mute: '#c79ab0', accent: '#ff7a59', danger: '#ff4d6d' },
  'mono-dark':     { bg: '#000000', panel: '#0d0d0d', line: '#262626', text: '#f2f2f2', mute: '#8a8a8a', accent: '#ffffff', danger: '#ff5c5c' },
  'mono-light':    { bg: '#ffffff', panel: '#f4f4f5', line: '#e4e4e7', text: '#09090b', mute: '#71717a', accent: '#18181b', danger: '#dc2626' },
  cyberpunk:       { bg: '#0a0014', panel: '#150028', line: '#2a0a4a', text: '#f5e9ff', mute: '#a98bd1', accent: '#00f0ff', danger: '#ff2a6d' },
  coffee:          { bg: '#1f1611', panel: '#2b1f18', line: '#43322a', text: '#f1e4d8', mute: '#b79d8a', accent: '#d9a066', danger: '#e5645a' },
  lavender:        { bg: '#f5f1fb', panel: '#ffffff', line: '#e3d9f4', text: '#2a2140', mute: '#7c6f9b', accent: '#8b5cf6', danger: '#d9435e' },
  mint:            { bg: '#effaf5', panel: '#ffffff', line: '#cfeadf', text: '#10302a', mute: '#5b8a7c', accent: '#10b981', danger: '#d9435e' },
});
const themeIds = () => ['system', ...Object.keys(THEMES), 'custom'];
NAV.splice(0, NAV.length, 'home', 'library', 'discover', 'news', 'friends', 'stats', 'accounts', 'tools', 'overlay', 'integr', 'launcher', 'mods', 'engine', 'look', 'links');

let newsBadge = 0, libFolder = 'all', itgEl = null;
const segState = {}, dq = { q: '', genre: '', minRating: 0, minPlayers: 0, updatedDays: 0, sort: 'players' };
const METRICS = ['fps', 'ping', 'cpu', 'ram', 'rcpu', 'rmem', 'clock', 'timer', 'game', 'loc'];
const SV = (tag, a = {}) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
const isId = v => /^\d+$/.test(String(v));
const startUri = (placeId, jobId) => `roblox://experiences/start?placeId=${placeId}` + (jobId ? `&gameInstanceId=${jobId}` : '');
const fdate = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(cfg.language); };
const ago = iso => {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (!(m >= 0)) return '';
  if (m < 1) return t('ago.now'); if (m < 60) return t('ago.m', { n: m });
  const h = Math.floor(m / 60); return h < 48 ? t('ago.h', { n: h }) : t('ago.d', { n: Math.floor(h / 24) });
};
const fieldOf = (lk, c) => { const L = E('label', 'fl'); L.append(E('small', null, t(lk)), c); return L; };
const thumb = (el, url) => { const u = safeImg(url); if (u) el.style.backgroundImage = `url("${u}")`; return el; };

// сегментированный переключатель внутри страницы
function seg(id, opts) {
  const W = E('div'), bar = E('div', 'seg'), body = E('div'), btns = {};
  const draw = k => { segState[id] = k; for (const x in btns) btns[x].classList.toggle('on', x === k); body.replaceChildren(opts.find(o => o[0] === k)[2]()); };
  for (const [k, l] of opts) { const b = E('button', 'btn', t(l)); b.onclick = () => draw(k); btns[k] = b; bar.append(b); }
  W.append(bar, body);
  draw(opts.some(o => o[0] === segState[id]) ? segState[id] : opts[0][0]);
  return W;
}
function jumpServers(placeId) { pendingServer = placeId; segState.discover = 'servers'; show('discover'); build('discover'); }

/* ---------- библиотека с папками ---------- */
function card(p, big, refresh) {
  const c = E('div', 'card' + (big ? ' big' : '')), cv = E('div', 'cover'), img = safeImg(p.icon);
  if (img) cv.style.backgroundImage = `url("${img}")`; else cv.textContent = (p.name || '?').charAt(0).toUpperCase();
  const fav = E('button', 'fav' + (p.fav ? ' on' : ''), '★');
  fav.onclick = async e => { e.stopPropagation(); await api.libSet(p.placeId, { fav: !p.fav }); refresh(); };
  const ov = E('div', 'ov'), pl = E('button', 'btn primary', t('play')), sv = E('button', 'btn', t('lib.servers')), rm = E('button', 'btn', t('lib.remove')), fs_ = E('select');
  pl.onclick = () => { show('home'); play(startUri(p.placeId)); };
  sv.onclick = () => jumpServers(p.placeId);
  rm.onclick = async () => { await api.libRemove(p.placeId); refresh(); };
  for (const [v, l] of [['', t('lib.f.none')], ...cfg.folders.map(f => [f.id, f.name])]) { const o = E('option', null, l); o.value = v; fs_.append(o); }
  fs_.value = p.folder || '';
  fs_.onchange = async () => { await api.libSet(p.placeId, { folder: fs_.value || null }); refresh(); };
  ov.append(pl, sv, fs_, rm);
  const meta = E('div', 'meta');
  meta.append(E('b', null, p.name || p.placeId), E('small', null, p.totalMs ? fmtTime(p.totalMs) : t('lib.never')),
    E('small', null, p.last ? t('lib.last', { d: new Date(p.last).toLocaleDateString(cfg.language) }) : ''));
  c.append(cv, ov, fav, meta);
  return c;
}

function library() {
  const W = E('div'), bar = E('div', 'libbar'), chips = E('div', 'chips'), body = E('div');
  const q = E('input'), srt = E('select'), ai = E('input'), ab = E('button', 'btn', t('lib.addBtn'));
  q.placeholder = t('lib.search'); q.value = libQ; ai.placeholder = t('lib.addPh');
  for (const [v, k] of [['recent', 'lib.s.recent'], ['time', 'lib.s.time'], ['name', 'lib.s.name']]) { const o = E('option', null, t(k)); o.value = v; srt.append(o); }
  srt.value = libSort;
  bar.append(q, srt, ai, ab); W.append(bar, chips, body);
  if (libFolder !== 'all' && libFolder !== 'fav' && !cfg.folders.some(f => f.id === libFolder)) libFolder = 'all';

  const drawChips = () => {
    chips.replaceChildren();
    const chip = (label, key) => { const b = E('button', 'chip' + (libFolder === key ? ' on' : ''), label); b.onclick = () => { libFolder = key; drawChips(); draw(); }; chips.append(b); };
    chip(t('lib.f.all'), 'all'); chip(t('lib.f.fav'), 'fav');
    cfg.folders.forEach(f => chip('▸ ' + f.name, f.id));
    const ni = E('input'), nb = E('button', 'chip', '+');
    ni.placeholder = t('lib.f.new');
    nb.onclick = () => {
      const name = ni.value.trim().slice(0, 30); if (!name) return;
      const f = { id: 'f' + Date.now().toString(36), name }; save({ folders: [...cfg.folders, f] }); libFolder = f.id; drawChips(); draw();
    };
    chips.append(ni, nb);
    const cur = cfg.folders.find(f => f.id === libFolder);
    if (cur) {
      const ri = E('input'), rb = E('button', 'chip', t('lib.f.rename')), db = E('button', 'chip', t('lib.f.del'));
      ri.value = cur.name;
      rb.onclick = () => { save({ folders: cfg.folders.map(f => f.id === cur.id ? { ...f, name: ri.value.trim().slice(0, 30) || f.name } : f) }); drawChips(); draw(); };
      db.onclick = async () => {
        for (const p of await api.libGet()) if (p.folder === cur.id) await api.libSet(p.placeId, { folder: null });
        save({ folders: cfg.folders.filter(f => f.id !== cur.id) }); libFolder = 'all'; drawChips(); draw();
      };
      chips.append(ri, rb, db);
    }
  };

  const draw = async () => {
    const all = await api.libGet(), total = all.reduce((a, p) => a + (p.totalMs || 0), 0), needle = libQ.trim().toLowerCase();
    const list = all.filter(p => (libFolder === 'all' || (libFolder === 'fav' ? p.fav : p.folder === libFolder)) && (!needle || (p.name || '').toLowerCase().includes(needle)));
    const by = { recent: (a, b) => (b.last || 0) - (a.last || 0), time: (a, b) => (b.totalMs || 0) - (a.totalMs || 0), name: (a, b) => (a.name || '').localeCompare(b.name || '') };
    list.sort(by[libSort]);
    body.replaceChildren(E('p', 'hint', t('lib.sum', { n: all.length, t: fmtTime(total) })));
    if (!cfg.activityTracking) body.append(E('p', 'hint', t('lib.notrack')));
    if (!all.length) return body.append(E('p', 'hint', t('lib.empty')));
    if (libSort === 'recent' && !needle && libFolder === 'all') {
      const shelf = E('div', 'shelf');
      list.filter(p => p.last).slice(0, 6).forEach(p => shelf.append(card(p, true, draw)));
      if (shelf.children.length) body.append(E('h3', null, t('lib.recent')), shelf);
    }
    const grid = E('div', 'grid');
    list.forEach(p => grid.append(card(p, false, draw)));
    body.append(E('h3', null, t('lib.all')), grid);
  };
  q.oninput = () => { libQ = q.value; draw(); };
  srt.onchange = () => { libSort = srt.value; draw(); };
  ab.onclick = async () => {
    const r = await api.libAdd(ai.value);
    if (r.error) { ab.textContent = t('lib.err.' + r.error); setTimeout(() => { ab.textContent = t('lib.addBtn'); }, 2500); } else { ai.value = ''; draw(); }
  };
  drawChips(); draw(); return W;
}

/* ---------- поиск игр ---------- */
function gameCard(g) {
  const c = E('div', 'card'), cv = thumb(E('div', 'cover'), g.icon);
  if (!safeImg(g.icon)) cv.textContent = (g.name || '?').charAt(0).toUpperCase();
  const ov = E('div', 'ov'), pl = E('button', 'btn primary', t('play')), sv = E('button', 'btn', t('lib.servers')), fv = E('button', 'btn', t('d.lib'));
  if (isId(g.placeId)) {
    pl.onclick = () => { show('home'); play(startUri(g.placeId)); };
    sv.onclick = () => jumpServers(g.placeId);
    fv.onclick = async () => { const r = await api.libAdd(String(g.placeId)); if (!r.error) { await api.libSet(String(g.placeId), { fav: true }); fv.textContent = t('d.in'); fv.disabled = true; } };
  }
  ov.append(pl, sv, fv);
  const meta = E('div', 'meta');
  meta.append(E('b', null, g.name),
    E('small', null, [t('d.card.p', { n: (g.playing || 0).toLocaleString(cfg.language) }), g.rating != null ? t('d.card.r', { r: g.rating }) : ''].filter(Boolean).join('  ·  ')),
    E('small', null, [g.genre, g.updated ? t('d.card.u', { d: fdate(g.updated) }) : ''].filter(Boolean).join('  ·  ')));
  c.append(cv, ov, meta);
  return c;
}
function discoverGames() {
  const W = E('div'), bar = E('div', 'libbar'), out = E('div'), q = E('input'), go = E('button', 'btn primary', t('d.search'));
  q.placeholder = t('d.q'); q.value = dq.q;
  const mk = (key, opts) => {
    const s = E('select');
    for (const [v, l] of opts) { const o = E('option', null, tx(l)); o.value = v; s.append(o); }
    s.value = String(dq[key]); s.onchange = () => { dq[key] = s.value; }; return s;
  };
  const GENRES = ['Obby', 'Tycoon', 'Simulator', 'RPG', 'Shooter', 'Horror', 'Racing', 'Fighting', 'Roleplay', 'Survival', 'Sports', 'Puzzle', 'Strategy', 'Adventure'];
  bar.append(q,
    fieldOf('d.genre', mk('genre', [['', 'd.any'], ...GENRES.map(g => [g, g])])),
    fieldOf('d.rating', mk('minRating', [['0', 'd.any'], ['50', '50%+'], ['70', '70%+'], ['80', '80%+'], ['90', '90%+']])),
    fieldOf('d.players', mk('minPlayers', [['0', 'd.any'], ['10', '10+'], ['100', '100+'], ['1000', '1000+'], ['10000', '10000+']])),
    fieldOf('d.updated', mk('updatedDays', [['0', 'd.upd.any'], ['7', 'd.upd.7'], ['30', 'd.upd.30'], ['90', 'd.upd.90'], ['365', 'd.upd.365']])),
    fieldOf('d.sort', mk('sort', [['players', 'd.s.players'], ['rating', 'd.s.rating'], ['updated', 'd.s.updated'], ['fav', 'd.s.fav']])), go);
  W.append(bar, E('p', 'hint', t('d.hint')), out);
  const run = async () => {
    dq.q = q.value; out.replaceChildren(E('p', 'hint', t('sv.loading')));
    const r = await api.discover({ ...dq });
    if (r.error) return out.replaceChildren(E('p', 'hint', r.error === 'none' ? t('d.none') : t('d.err')));
    if (!r.games.length) return out.replaceChildren(E('p', 'hint', t('d.none')));
    const grid = E('div', 'grid'); r.games.forEach(g => grid.append(gameCard(g))); out.replaceChildren(grid);
  };
  go.onclick = run; q.onkeydown = e => { if (e.key === 'Enter') run(); };
  return W;
}

/* ---------- лента обновлений ---------- */
function newsPage() {
  const W = E('div'), top = E('div', 'libbar'), feed = E('div'), src = E('details', 'src');
  const rf = E('button', 'btn', t('n.refresh')), rd = E('button', 'btn', t('n.read')), fl = E('select');
  for (const [v, l] of [['', t('n.all')], ...cfg.folders.map(f => [f.id, '▸ ' + f.name])]) { const o = E('option', null, l); o.value = v; fl.append(o); }
  top.append(rf, rd, fl);
  W.append(top, el({ t: 'toggle', k: 'newsNotify', l: 'n.notify' }), src, feed);

  const drawFeed = async () => {
    const [{ items, unread }, lib] = await Promise.all([api.newsGet(), api.libGet()]);
    newsBadge = unread; renderNav();
    const byId = Object.fromEntries(lib.map(p => [p.placeId, p]));
    const list = items.filter(i => !fl.value || (byId[i.placeId] && byId[i.placeId].folder === fl.value));
    feed.replaceChildren();
    if (!list.length) feed.append(E('p', 'hint', t('n.empty')));
    for (const i of list) {
      const r = E('div', 'frow'), th = thumb(E('div', 'thumb'), i.icon), info = E('div', 'grow'), pl = E('button', 'btn', t('play'));
      info.append(E('b', null, i.name), E('small', null, [t('n.upd', { d: fdate(i.at) }), ago(i.at), i.playing != null ? t('n.playing', { n: i.playing.toLocaleString(cfg.language) }) : ''].filter(Boolean).join('  ·  ')));
      pl.onclick = () => { show('home'); play(startUri(i.placeId)); };
      r.append(th, info);
      if (i.unread) r.append(E('span', 'tag ok', t('n.new')));
      r.append(pl); feed.append(r);
    }
  };
  const drawSources = async () => {
    src.replaceChildren(E('summary', null, t('n.sources')), E('p', 'hint', t('n.sources.d')));
    for (const p of await api.libGet()) {
      const on = p.news === true || (p.fav && p.news !== false), L = E('label', 'sw mini'), cb = E('input'), r = E('div', 'row');
      cb.type = 'checkbox'; cb.checked = on;
      cb.onchange = async () => { await api.libSet(p.placeId, { news: cb.checked }); drawFeed(); };
      L.append(cb, E('i')); r.append(E('span', null, (p.fav ? '★ ' : '') + (p.name || p.placeId)), ctl(L)); src.append(r);
    }
  };
  rf.onclick = async () => { rf.disabled = true; rf.textContent = t('n.checking'); await api.newsCheck(); rf.disabled = false; rf.textContent = t('n.refresh'); drawFeed(); };
  rd.onclick = async () => { await api.newsSeen(); drawFeed(); };
  fl.onchange = drawFeed;
  drawSources(); drawFeed(); return W;
}

/* ---------- друзья ---------- */
function friendsPage() {
  const W = E('div'), top = E('div', 'libbar'), body = E('div'), rf = E('button', 'btn', t('f.refresh'));
  top.append(rf); W.append(top, body);
  const row = (f, extra) => {
    const r = E('div', 'frow'), img = E('img'), info = E('div', 'grow'), u = safeImg(f.avatar);
    if (u) img.src = u;
    info.append(E('b', null, f.display), E('small', null, '@' + f.name + (extra ? '  ·  ' + extra : '')));
    r.append(img, info); return r;
  };
  const tile = (label, v) => { const x = E('div', 'tile'); x.append(E('b', null, String(v)), E('small', null, label)); return x; };
  const load = async () => {
    body.replaceChildren(E('p', 'hint', t('f.loading')));
    const r = await api.friends();
    if (r.error) return body.replaceChildren(E('p', 'hint', t(r.error === 'noacc' ? 'f.noacc' : 'f.err.' + r.error)));
    const fr = r.friends, inGame = fr.filter(f => f.type === 2), studio = fr.filter(f => f.type === 3), online = fr.filter(f => f.type === 1);
    const tiles = E('div', 'tiles');
    tiles.append(tile(t('f.total'), r.total), tile(t('f.online'), fr.filter(f => f.type > 0).length), tile(t('f.ingame'), inGame.length), tile(t('f.studio'), studio.length));
    body.replaceChildren(tiles);
    const { stats } = await api.stats(), s = (stats.friends || []).slice(-60);
    if (s.length > 1) {
      const w = 600, h = 60, max = Math.max(1, ...s.map(x => x.online)), svg = SV('svg', { viewBox: `0 0 ${w} ${h + 6}`, class: 'chart' });
      svg.append(SV('polyline', { class: 'line', points: s.map((x, i) => `${(i / (s.length - 1) * w).toFixed(1)},${(h - x.online / max * h + 3).toFixed(1)}`).join(' ') }));
      body.append(E('h3', null, t('f.chart')), svg);
    }
    const groups = new Map();
    for (const f of inGame) { const k = f.game || f.location || String(f.placeId); (groups.get(k) || groups.set(k, []).get(k)).push(f); }
    if (groups.size) body.append(E('h3', null, t('f.now')));
    [...groups.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([name, list]) => {
      body.append(E('p', 'hint', `${name} (${list.length})`));
      for (const f of list) {
        const rw = row(f, f.placeId ? '' : t('f.hidden'));
        if (isId(f.placeId)) {
          const jb = E('button', 'btn', t('f.join'));
          jb.onclick = () => { show('home'); play(startUri(f.placeId, /^[0-9a-f-]{36}$/i.test(f.gameId || '') ? f.gameId : null)); };
          rw.append(jb);
        }
        body.append(rw);
      }
    });
    if (online.length) { body.append(E('h3', null, t('f.online.l'))); online.forEach(f => body.append(row(f, f.location))); }
    const recent = fr.filter(f => f.type === 0 && f.lastOnline).sort((a, b) => Date.parse(b.lastOnline) - Date.parse(a.lastOnline)).slice(0, 15);
    if (recent.length) { body.append(E('h3', null, t('f.recent'))); recent.forEach(f => body.append(row(f, ago(f.lastOnline)))); }
  };
  rf.onclick = load; load(); return W;
}

/* ---------- графики активности ---------- */
function bars(vals, labels, fmt = fmtTime) {
  const w = 600, h = 140, n = vals.length, max = Math.max(1, ...vals), bw = w / n, svg = SV('svg', { viewBox: `0 0 ${w} ${h + 18}`, class: 'chart' });
  vals.forEach((v, i) => {
    const bh = v / max * h, r = SV('rect', { x: i * bw + 2, y: h - bh, width: Math.max(1, bw - 4), height: v ? Math.max(1, bh) : 0, rx: 3, class: 'cbar' }), ti = SV('title');
    ti.textContent = `${labels[i]}: ${fmt(v)}`; r.append(ti); svg.append(r);
    if (n <= 14 || i % Math.ceil(n / 12) === 0) { const x = SV('text', { x: i * bw + bw / 2, y: h + 13, 'text-anchor': 'middle', class: 'lbl' }); x.textContent = labels[i]; svg.append(x); }
  });
  return svg;
}
let statRange = 14;
function statsCharts() {
  const W = E('div');
  (async () => {
    const { stats: s, names } = await api.stats();
    const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const sum = n => { let a = 0; for (let i = 0; i < n; i++) { const d = new Date(); d.setDate(d.getDate() - i); a += s.days[key(d)] || 0; } return a; };
    const total = Object.values(s.byPlace).reduce((a, b) => a + b, 0);
    if (!total) return W.append(E('p', 'hint', t('sa.empty')));
    const tiles = E('div', 'tiles');
    for (const [l, v] of [[t('sa.today'), sum(1)], [t('sa.d7'), sum(7)], [t('sa.d30'), sum(30)], [t('sa.all'), total]]) { const x = E('div', 'tile'); x.append(E('b', null, fmtTime(v)), E('small', null, l)); tiles.append(x); }
    const rs = E('select'); for (const n of [7, 14, 30, 90]) { const o = E('option', null, String(n)); o.value = n; rs.append(o); }
    rs.value = statRange;
    const daily = E('div'), drawDaily = () => {
      const vals = [], labels = [];
      for (let i = statRange - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); vals.push(s.days[key(d)] || 0); labels.push(String(d.getDate())); }
      daily.replaceChildren(bars(vals, labels));
    };
    rs.onchange = () => { statRange = +rs.value; drawDaily(); };
    const head = E('div', 'row'); head.append(E('h3', null, t('sa.daily')), ctl(fieldOf('sa.range', rs)));
    drawDaily();
    const order = [1, 2, 3, 4, 5, 6, 0], wd = i => new Date(2024, 0, 7 + i).toLocaleDateString(cfg.language, { weekday: 'short' });
    const top = Object.entries(s.byPlace).sort((a, b) => b[1] - a[1]).slice(0, 8), mx = top.length ? top[0][1] : 1, tb = E('div');
    for (const [id, ms] of top) { const r = E('div', 'hbar'), i = E('i'); i.style.width = Math.max(2, ms / mx * 100) + '%'; const wrap = E('div'); wrap.append(i); r.append(E('span', null, names[id] || id), wrap, E('span', null, fmtTime(ms))); tb.append(r); }
    W.append(tiles, head, daily,
      E('h3', null, t('sa.hours')), bars(s.hours, s.hours.map((_, i) => String(i))),
      E('h3', null, t('sa.dow')), bars(order.map(i => s.dow[i]), order.map(wd)),
      E('h3', null, t('sa.top')), tb);
  })();
  return W;
}

/* ---------- инструменты: Studio и целостность файлов ---------- */
function studioBox() {
  const W = E('div');
  (async () => {
    const p = await api.studioFind(), r = E('div', 'row'), c = ctl();
    const launch = E('button', 'btn primary', t('tl.launch')), open = E('button', 'btn', t('tl.open')), path_ = E('button', 'btn', t('tl.path')), dl = E('button', 'btn', t('tl.dl'));
    launch.disabled = open.disabled = !p;
    launch.onclick = () => api.studioLaunch(false);
    open.onclick = () => api.studioLaunch(true);
    path_.onclick = async () => { cfg = await api.studioPath(); build('tools'); };
    dl.onclick = () => api.studioDownload();
    c.append(launch, open, path_); if (!p) c.append(dl);
    r.append(E('span', 'fname', p ? t('tl.found', { p }) : t('tl.nf')), c); W.append(r);
  })();
  return W;
}
function integrityBox() {
  const W = E('div'), res = E('p', 'hint pre'), row = E('div', 'row'), c = ctl(), btns = [];
  itgEl = res;
  const run = async mode => {
    btns.forEach(b => { b.disabled = true; }); res.textContent = '';
    const r = await api.integrity(mode);
    btns.forEach(b => { b.disabled = false; });
    if (r.error) return (res.textContent = r.error === 'fail' ? r.message : t('itg.' + r.error));
    res.textContent = (r.bad ? t('itg.bad', { n: r.checked, b: r.bad }) : t('itg.ok', { n: r.checked })) + (r.fixed ? '\n' + t('itg.fixed', { b: r.fixed }) : '') + (r.files.length ? '\n' + r.files.join('\n') : '');
  };
  for (const [m, k, cls] of [['quick', 'tl.quick', ''], ['full', 'tl.full', ''], ['repair', 'tl.repair', 'primary']]) { const b = E('button', 'btn ' + cls, t(k)); b.onclick = () => run(m); btns.push(b); c.append(b); }
  row.append(E('span'), c); W.append(row, res); return W;
}

PAGES.discover = () => [{ t: 'node', make: () => seg('discover', [['games', 'sg.games', discoverGames], ['servers', 'sg.servers', servers]]) }];
PAGES.news = () => [{ t: 'node', make: newsPage }];
PAGES.friends = () => [{ t: 'node', make: friendsPage }];
PAGES.stats = () => [{ t: 'node', make: () => seg('stats', [['charts', 'sg.charts', statsCharts], ['history', 'sg.history', history]]) }];
PAGES.tools = () => [
  { h: 'tl.studio' }, { p: 'tl.studio.d' }, { t: 'node', make: studioBox },
  { h: 'tl.itg' }, { p: 'tl.itg.d' }, { t: 'node', make: integrityBox }, tog('verifyOnLaunch', 'tl.vol'),
];
PAGES.overlay = () => [
  tog('overlay.enabled', 'ov.on'),
  sel_('overlay.corner', 'ov.corner', [['tl', 'c.tl'], ['tr', 'c.tr'], ['bl', 'c.bl'], ['br', 'c.br']]),
  rng('overlay.x', 'ov.x', 0, 400, 2, { u: 'px' }), rng('overlay.y', 'ov.y', 0, 400, 2, { u: 'px' }),
  rng('overlay.scale', 'ov.scale', 60, 200, 5, { u: '%' }), rng('overlay.opacity', 'ov.opacity', 0, 100, 5, { u: '%' }),
  sel_('overlay.layout', 'ov.layout', [['column', 'lay.column'], ['row', 'lay.row']]), tog('overlay.labels', 'ov.labels'),
  sel_(null, 'ov.interval', [['500', '0.5 s'], ['1000', '1 s'], ['2000', '2 s']], { get: () => String(cfg.overlay.interval), set: v => save({ overlay: { interval: +v } }) }),
  col('overlay.bg', 'ov.bg'), col('overlay.text', 'ov.text'), col('overlay.accent', 'ov.accent'),
  { h: 'ov.metrics' },
  ...METRICS.map(m => ({ t: 'toggle', l: 'ov.m.' + m, get: () => cfg.overlay.metrics.includes(m),
    set: v => save({ overlay: { metrics: METRICS.filter(x => (x === m ? v : cfg.overlay.metrics.includes(x))) } }) })),
  { t: 'text', k: 'overlay.hotkey', l: 'ov.hotkey', ph: 'Control+Shift+O' },
  { t: 'text', k: 'overlay.presentMon', l: 'ov.pm', ph: 'C:\\Tools\\PresentMon.exe' },
  { t: 'text', k: 'overlay.pmArgs', l: 'ov.pmArgs' },
  { t: 'area', l: 'ov.css', live: true, get: () => cfg.overlay.css || '', set: v => save({ overlay: { css: v } }) },
  { t: 'btns', l: 'ov.preview', b: [{ l: 'ov.preview.b', fn: () => api.overlayPreview() }] },
];

/* ---------- живые обои ---------- */
const LIVE = {
  stars: (W, H, d, p) => {
    const s = Array.from({ length: Math.round(260 * d) + 20 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * .9 + .1 }));
    return (c, dt) => { c.fillStyle = p.text; for (const o of s) { o.x -= o.z * 60 * dt; if (o.x < 0) { o.x = W; o.y = Math.random() * H; } c.globalAlpha = .25 + o.z * .6; c.beginPath(); c.arc(o.x, o.y, o.z * 1.8, 0, 6.283); c.fill(); } c.globalAlpha = 1; };
  },
  rain: (W, H, d, p) => {
    const r = Array.from({ length: Math.round(180 * d) + 20 }, () => ({ x: Math.random() * W, y: Math.random() * H, l: 10 + Math.random() * 18, v: 500 + Math.random() * 500 }));
    return (c, dt) => { c.strokeStyle = p.accent; c.globalAlpha = .35; c.lineWidth = 1.2; c.beginPath(); for (const o of r) { o.y += o.v * dt; o.x -= o.v * .12 * dt; if (o.y > H) { o.y = -o.l; o.x = Math.random() * W * 1.2; } c.moveTo(o.x, o.y); c.lineTo(o.x - o.l * .12, o.y - o.l); } c.stroke(); c.globalAlpha = 1; };
  },
  snow: (W, H, d, p) => {
    const s = Array.from({ length: Math.round(140 * d) + 15 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2.5, v: 25 + Math.random() * 50, ph: Math.random() * 6 }));
    return (c, dt) => { c.fillStyle = p.text; c.globalAlpha = .7; for (const o of s) { o.y += o.v * dt; o.ph += dt; o.x += Math.sin(o.ph) * 18 * dt; if (o.y > H + 5) { o.y = -5; o.x = Math.random() * W; } c.beginPath(); c.arc(o.x, o.y, o.r, 0, 6.283); c.fill(); } c.globalAlpha = 1; };
  },
  particles: (W, H, d, p) => {
    const s = Array.from({ length: Math.round(70 * d) + 10 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * 40, vy: (Math.random() - .5) * 40 }));
    return (c, dt) => {
      c.fillStyle = p.accent; c.strokeStyle = p.accent; c.lineWidth = 1;
      for (const o of s) { o.x += o.vx * dt; o.y += o.vy * dt; if (o.x < 0 || o.x > W) o.vx *= -1; if (o.y < 0 || o.y > H) o.vy *= -1; c.globalAlpha = .7; c.beginPath(); c.arc(o.x, o.y, 2, 0, 6.283); c.fill(); }
      for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) { const dd = Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y); if (dd < 110) { c.globalAlpha = (1 - dd / 110) * .35; c.beginPath(); c.moveTo(s[i].x, s[i].y); c.lineTo(s[j].x, s[j].y); c.stroke(); } }
      c.globalAlpha = 1;
    };
  },
  matrix: (W, H, d, p) => {
    const sz = 15, cols = Math.floor(W / sz), chars = 'アイウエオカキクケコサシスセソ0123456789', act = [];
    for (let i = 0; i < cols; i++) if (Math.random() < .25 + d * .75) act.push({ i, y: Math.random() * H, v: 40 + Math.random() * 90 });
    return (c, dt) => { c.font = sz + 'px monospace'; c.fillStyle = p.accent; for (const o of act) { o.y += o.v * dt; if (o.y > H + 14 * sz) o.y = -Math.random() * H * .5; for (let k = 0; k < 14; k++) { c.globalAlpha = (1 - k / 14) * .6; c.fillText(chars[(o.i * 7 + k * 3 + Math.floor(o.y / sz)) % chars.length], o.i * sz, o.y - k * sz); } } c.globalAlpha = 1; };
  },
  bubbles: (W, H, d, p) => {
    const b = Array.from({ length: Math.round(40 * d) + 8 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 4 + Math.random() * 22, v: 15 + Math.random() * 40, ph: Math.random() * 6 }));
    return (c, dt) => { c.strokeStyle = p.accent; c.lineWidth = 1.5; for (const o of b) { o.y -= o.v * dt; o.ph += dt; o.x += Math.sin(o.ph) * 10 * dt; if (o.y < -30) { o.y = H + 30; o.x = Math.random() * W; } c.globalAlpha = .12 + o.r / 80; c.beginPath(); c.arc(o.x, o.y, o.r, 0, 6.283); c.stroke(); } c.globalAlpha = 1; };
  },
};
let liveRaf = 0, liveSig = '', vidUrl = null;
async function loadVideo(u) {
  const vid = $('#bgvid');
  if (!u.bgVideo) { vid.removeAttribute('src'); return; }
  const r = await api.getBgVideo();
  if (!r) return;
  if (vidUrl) URL.revokeObjectURL(vidUrl);
  vidUrl = URL.createObjectURL(new Blob([r.data], { type: r.type }));
  vid.src = vidUrl; vid.muted = true; vid.loop = true; vid.play().catch(() => {});
}
function liveBg() {
  const u = cfg.ui, p = palette(), sig = [u.bgMode, u.live, u.liveSpeed, u.liveDensity, u.bgVideo, u.animations, p.accent, p.text].join('|');
  if (sig === liveSig) return;
  liveSig = sig; cancelAnimationFrame(liveRaf); liveRaf = 0;
  const cv = $('#live'), vid = $('#bgvid');
  if (u.bgMode === 'video') loadVideo(u); else vid.pause();
  if (u.bgMode !== 'live') return;
  const ctx = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight;
  const sim = (LIVE[u.live] || LIVE.stars)(cv.width, cv.height, u.liveDensity / 100, p), spd = u.liveSpeed;
  let last = 0;
  const frame = ts => {
    liveRaf = requestAnimationFrame(frame);
    if (document.hidden || ts - last < 33) return;
    const dt = Math.min(.1, (ts - last) / 1000 || .033) * spd; last = ts;
    ctx.clearRect(0, 0, cv.width, cv.height); sim(ctx, dt);
  };
  if (!u.animations) { sim(ctx, .5); return; }   // без анимаций показываем один кадр
  liveRaf = requestAnimationFrame(frame);
}

api.onNews(n => { newsBadge = n; renderNav(); });
api.onItg(d => { if (itgEl) itgEl.textContent = `${Math.round(d.percent)}%  ${d.text}`; });
setTimeout(async () => { try { newsBadge = (await api.newsGet()).unread; renderNav(); } catch {} }, 2000);
