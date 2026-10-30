const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const CIRC = 553;
const NAV = ['home', 'library', 'discover', 'news', 'people', 'stats', 'tools', 'settings'];
const subSlots = {};   // подстраницы внутри вкладок (настройки, инструменты…), которые перерисовываются по месту
const THEMES = {
  'lumen-dark':  { bg: '#0b0e19', panel: '#121829', line: '#232b45', text: '#e9edff', mute: '#8d97b8', accent: '#ffb23e', danger: '#ff6b6b' },
  'lumen-light': { bg: '#f3f5fb', panel: '#ffffff', line: '#dbe0f0', text: '#161a2b', mute: '#626b8a', accent: '#e08a00', danger: '#d93f3f' },
  midnight:      { bg: '#070a12', panel: '#0e1424', line: '#1b2440', text: '#dfe7ff', mute: '#7b88b0', accent: '#6f8cff', danger: '#ff6b6b' },
  forest:        { bg: '#0d1511', panel: '#14201a', line: '#223429', text: '#e3f1e6', mute: '#86a28f', accent: '#4fd1a5', danger: '#ff7a7a' },
  sakura:        { bg: '#1a1018', panel: '#261622', line: '#3a2434', text: '#ffe9f3', mute: '#b98aa5', accent: '#f472b6', danger: '#ff6b6b' },
  terminal:      { bg: '#000000', panel: '#0a0f0a', line: '#143014', text: '#b6ffb6', mute: '#5fa35f', accent: '#39ff14', danger: '#ff4d4d' },
  paper:         { bg: '#f4efe6', panel: '#fffaf0', line: '#e0d6c3', text: '#2b2417', mute: '#7a6e58', accent: '#c2571a', danger: '#c0392b' },
};
const FONTS = {
  system: '"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif',
  mono: 'Consolas,"Cascadia Mono",monospace',
  serif: 'Georgia,"Times New Roman",serif',
  cond: '"Bahnschrift SemiCondensed","Arial Narrow",sans-serif',
};
const ACCENTS = ['#ffb23e', '#ff6b6b', '#6f8cff', '#4fd1a5', '#c084fc', '#f472b6'];
const PRESETS = [
  { id: 'e.fx', key: 'FFlagDisablePostFx', val: 'True' },
  { id: 'e.sky', key: 'FFlagDebugSkyGray', val: 'True' },
];

let cfg, links = {}, running = false, current = 'home', sel = -1, vlist = [], verState = null, cssTimer, lookTimer, pendingServer = null, libQ = '', libSort = 'recent', libFav = false;
const dark = matchMedia('(prefers-color-scheme: dark)');
const t = (k, p) => LANG.t(cfg ? cfg.language : 'ru', k, p);
const tx = s => (s in LANG.D.ru ? t(s) : s);
const E = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const deep = (a, b) => { const o = { ...a }; for (const k in b) o[k] = isObj(b[k]) && isObj(a[k]) ? deep(a[k], b[k]) : b[k]; return o; };
const nest = (k, v) => k.split('.').reduceRight((acc, key, i, arr) => ({ [key]: i === arr.length - 1 ? v : acc }), null);
const pget = k => k.split('.').reduce((o, x) => (o == null ? o : o[x]), cfg);
const lum = h => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

/* ---------- внешний вид ---------- */
function palette() {
  const u = cfg.ui;
  let id = u.theme === 'system' ? (dark.matches ? 'lumen-dark' : 'lumen-light') : u.theme;
  const p = id === 'custom' ? { ...THEMES['lumen-dark'], ...u.colors } : THEMES[id];
  return { ...p, accent: u.accent || p.accent };
}
function applyLook() {
  const u = cfg.ui, p = palette(), r = document.documentElement.style;
  for (const k of ['bg', 'panel', 'line', 'text', 'mute']) r.setProperty('--' + k, p[k]);
  r.setProperty('--accent', p.accent); r.setProperty('--bad', p.danger);
  r.setProperty('--on-accent', lum(p.accent) > 0.55 ? '#111' : '#fff');
  document.documentElement.dataset.scheme = lum(p.bg) > 0.55 ? 'light' : 'dark';
  r.setProperty('--radius', u.radius + 'px'); r.setProperty('--fs', u.fs + 'px');
  r.setProperty('--ui-font', FONTS[u.font] || FONTS.system);
  r.setProperty('--glow', u.glow / 100); r.setProperty('--spd', 1 / (u.animSpeed || 1));
  r.setProperty('--blur', u.bgBlur + 'px'); r.setProperty('--dim', u.bgDim);
  u.bgMode === 'gradient' ? r.setProperty('--bgfill', `linear-gradient(${u.bgAngle}deg, ${p.bg}, ${u.bgColor2})`) : r.removeProperty('--bgfill');
  const b = document.body;
  b.dataset.style = u.launcherStyle; b.dataset.nav = u.navPos; b.dataset.bg = u.bgMode;
  b.classList.toggle('noanim', !u.animations);
  b.classList.toggle('glass', u.material !== 'none');
  const title = u.title || 'Lumen';
  $('#brand').textContent = title; document.title = title;
  clearTimeout(lookTimer);
  lookTimer = setTimeout(() => { api.winLook({ opacity: u.opacity, material: u.material, bg: p.bg }); moveIndicator(); }, 120);
  if (typeof liveBg === 'function') liveBg();
}
async function loadBg() {
  const url = cfg.ui.bgImage ? await api.getBg() : null;
  document.documentElement.style.setProperty('--bg-img', url ? `url("${url}")` : 'none');
}
function setIcon(url) { const i = $('#brandIcon'); i.hidden = !url; if (url) i.src = url; }

function save(patch) {
  const prev = cfg;
  cfg = { ...cfg, ...patch };
  if (patch.ui) cfg.ui = deep(prev.ui, patch.ui);
  if (patch.compat) cfg.compat = { ...prev.compat, ...patch.compat };
  if (patch.overlay) cfg.overlay = { ...prev.overlay, ...patch.overlay };
  api.cfg.set(patch);
  applyLook(); vis();
}
dark.addEventListener('change', () => cfg && applyLook());

/* ---------- навигация ---------- */
function moveIndicator() {
  const tab = $(`.tab[data-view="${current}"]`), ind = $('.indicator');
  if (!tab) return;
  ind.style.width = tab.offsetWidth + 'px'; ind.style.height = tab.offsetHeight + 'px';
  ind.style.transform = `translate(${tab.offsetLeft}px,${tab.offsetTop}px)`;
}
const ICONS = {
  home: '<path d="M8 5.5v13l11-6.5z"/>',
  library: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  discover: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  news: '<rect x="4" y="4.5" width="16" height="15" rx="2.2"/><path d="M8 9h8M8 12.5h8M8 16h5"/>',
  people: '<circle cx="9" cy="8.5" r="3.4"/><path d="M2.8 19.5c0-3.4 2.8-5.7 6.2-5.7s6.2 2.3 6.2 5.7"/><circle cx="17" cy="9.5" r="2.5"/><path d="M17.2 14.2c2.6 0 4.2 1.8 4.2 4.8"/>',
  stats: '<path d="M5 20v-8M12 20V5M19 20v-5"/>',
  tools: '<rect x="3.5" y="8" width="17" height="11.5" rx="2.2"/><path d="M9 8V6.6A1.6 1.6 0 0 1 10.6 5h2.8A1.6 1.6 0 0 1 15 6.6V8M3.5 13.5h17"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.1"/><circle cx="9" cy="17" r="2.1"/>',
};
function show(id) {
  current = id;
  if ($('#' + id) && (['library', 'news', 'people', 'stats'].includes(id) || (id === 'discover' && pendingServer))) build(id);
  $$('.tab').forEach(x => x.classList.toggle('on', x.dataset.view === id));
  $$('.view').forEach(v => v.classList.toggle('on', v.id === id));
  moveIndicator();
}
function renderNav() {
  const list = $('#navlist');
  if (!$$('.tab').length) for (const id of NAV) {
    const b = E('button', 'tab' + (id === 'people' ? ' sep' : '') + (id === 'settings' ? ' bottom' : ''));
    b.dataset.view = id; b.onclick = () => show(id);
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id] || ''}</svg>`;
    b.append(E('span', 'tl'));
    list.append(b);
  }
  $$('.tab').forEach(b => { b.querySelector('.tl').textContent = t('nav.' + b.dataset.view) + (b.dataset.view === 'news' && newsBadge ? ` (${newsBadge})` : ''); });
}

/* ---------- запуск ---------- */
function setProgress(pct, text) {
  const arc = $('#arc');
  arc.classList.remove('intro');
  arc.style.strokeDashoffset = CIRC * (1 - pct / 100);
  $('#barfill').style.width = pct + '%';
  if (text) $('#status').textContent = text;
}
function idle() { running = false; document.body.classList.remove('busy'); $('#playLabel').textContent = t('play'); }
async function play(uri) {
  if (running) return;
  running = true;
  document.body.classList.remove('fail'); document.body.classList.add('busy');
  $('#playLabel').textContent = t('launching');
  setProgress(0, t('prep'));
  const r = await api.launch(uri || null);
  idle();
  if (r && r.ok) setTimeout(() => setProgress(0, t('started')), 1200);
  else if (r && r.cancelled) setProgress(0, t('cancelled'));
  else {
    document.body.classList.add('fail');
    $('#playLabel').textContent = t('retry');
    setProgress(100, (r && r.error) || t('failed'));
  }
}
function preview() {
  if (running) return;
  show('home'); running = true;
  document.body.classList.remove('fail'); document.body.classList.add('busy');
  $('#playLabel').textContent = t('launching');
  const steps = [[0, t('checking')], [35, t('dl', { a: 120, b: 340 })], [70, t('dl', { a: 240, b: 340 })], [98, t('applying')], [100, t('starting')]];
  let i = 0;
  const tick = () => {
    if (i < steps.length) { setProgress(...steps[i++]); return setTimeout(tick, 800); }
    setTimeout(() => { idle(); setProgress(0, t('ready')); }, 1000);
  };
  tick();
}
function showActivity(a) {
  $('#act').hidden = !a;
  if (!a) return;
  $('#actName').textContent = a.name || t('nowIn');
  $('#actInfo').textContent = [a.creator && t('by', { c: a.creator }), a.location && t('srv', { l: a.location })].filter(Boolean).join(' / ');
  $('#actIcon').hidden = !a.icon; if (a.icon) $('#actIcon').src = a.icon;
}
function setVer() {
  $('#ver').textContent = !verState ? '' : verState.error ? t('noNet') : t('ver', { v: verState.version }) + (cfg.installed === verState.guid ? t('verInst') : '');
}

/* ---------- декларативные страницы настроек ---------- */
const sel_ = (k, l, o, x = {}) => ({ t: 'select', k, l, o, ...x });
const tog = (k, l, x = {}) => ({ t: 'toggle', k, l, ...x });
const rng = (k, l, min, max, step, x = {}) => ({ t: 'range', k, l, min, max, step, ...x });
const col = (k, l, x = {}) => ({ t: 'color', k, l, ...x });

function setFlags(set, del = []) {
  const f = { ...cfg.fastFlags }; del.forEach(k => delete f[k]); Object.assign(f, set);
  save({ fastFlags: f }); build('engine');
}
const flagToggle = (p) => ({ t: 'toggle', l: p.id, get: () => cfg.fastFlags[p.key] === p.val, set: v => v ? setFlags({ [p.key]: p.val }) : setFlags({}, [p.key]) });
const slot = (id, l, x = {}) => ({
  t: 'file', l, ...x, get: () => cfg.slots && cfg.slots[id] && cfg.slots[id].name,
  pick: async () => { cfg = await api.pickSlot(id); build('mods'); }, clear: async () => { cfg = await api.clearSlot(id); build('mods'); },
});
const uiOnly = o => { const { icon, bgImage, ...rest } = o; return rest; };
const MSAA = 'FIntDebugForceMSAASamples', TEXON = 'DFFlagTextureQualityOverrideEnabled', TEX = 'DFIntTextureQualityOverride';

const API_FLAGS = { d3d11: 'FFlagDebugGraphicsPreferD3D11', vulkan: 'FFlagDebugGraphicsPreferVulkan', opengl: 'FFlagDebugGraphicsPreferOpenGL' };
const LIGHT_FLAGS = { voxel: 'DFFlagDebugRenderForceTechnologyVoxel', shadow: 'FFlagDebugForceFutureIsBrightPhase2', future: 'FFlagDebugForceFutureIsBrightPhase3' };
const GRASS = ['FIntFRMMinGrassDistance', 'FIntFRMMaxGrassDistance', 'FIntRenderGrassDetailStrands'];
const exclusive = (map, l, labels) => ({
  t: 'select', l, o: [['auto', 'auto'], ...Object.keys(map).map(k => [k, labels[k]])],
  get: () => Object.keys(map).find(k => cfg.fastFlags[map[k]] === 'True') || 'auto',
  set: v => setFlags(v === 'auto' ? {} : { [map[v]]: 'True' }, Object.values(map).filter(k => k !== map[v])),
});

const PAGES = {
  library: () => [{ t: 'library', raw: true }],
  integr: () => [
    { h: 'i.act' },
    tog('activityTracking', 'i.track'),
    tog('queryLocation', 'i.loc', { show: () => cfg.activityTracking }),
    tog('notifyServer', 'i.notify', { show: () => cfg.activityTracking }),
    tog('closeOnLeave', 'i.leave', { show: () => cfg.activityTracking }),
    { h: 'i.dc' }, { p: 'i.dc.hint' },
    tog('discordRpc', 'i.rpc', { show: () => cfg.activityTracking }),
    tog('discordAllowJoin', 'i.join', { show: () => cfg.activityTracking && cfg.discordRpc }),
    { t: 'text', k: 'discordAppId', l: 'i.appid', ph: '123456789012345678', show: () => cfg.activityTracking && cfg.discordRpc },
    { h: 'i.custom' }, { p: 'i.custom.hint' }, { t: 'integ' },
  ],
  launcher: () => [
    { h: 'g.main' },
    sel_('language', 'l.lang', [['ru', 'Русский'], ['en', 'English']], { set: v => { save({ language: v }); applyLang(); } }),
    { t: 'text', k: 'channel', l: 'l.channel', ph: 'LIVE', set: v => save({ channel: v.trim() || 'LIVE' }) },
    tog('autoClose', 'l.auto'), tog('confirmSecond', 'l.confirm'), tog('multiInstance', 'l.multi'),
    { h: 'g.rbx' }, tog('backgroundUpdates', 'l.bg'), rng('dlConcurrency', 'l.conc', 1, 8, 1), tog('segmented', 'l.seg'),
    { h: 'l.perf' }, sel_('priority', 'l.prio', [['normal', 'pr.normal'], ['above', 'pr.above'], ['high', 'pr.high']]),
    { h: 'l.compat' }, tog('compat.fso', 'l.fso'), tog('compat.dpi', 'l.dpi'),
    { h: 'g.maint' }, rng('cleanLogsDays', 'l.logs', 0, 30, 1),
    { t: 'btns', l: 'l.cleanNow', b: [{ l: 'l.cleanNow.b', fn: async e => { const b = e.target, mb = await api.cleanCache(); b.textContent = t('cleaned', { s: mb }); setTimeout(() => { b.textContent = t('l.cleanNow.b'); }, 3000); } }] },
    { t: 'btns', l: 'l.re', b: [{ l: 'l.re.b', cls: 'danger', fn: async () => { await api.reset(); show('home'); play(); } }] },
  ],
  mods: () => [
    { h: 'g.mods' },
    { t: 'btns', l: 'm.open', b: [{ l: 'm.open.b', fn: () => api.openMods() }] },
    tog('applyMods', 'm.apply'),
    { h: 'm.packs' }, { p: 'm.packs.hint' }, { t: 'packs' },
    { h: 'm.presets' }, { p: 'm.hint' },
    sel_('cursor', 'm.cursor', [['default', 'cur.default'], ['classic', 'cur.classic'], ['inverted', 'cur.inverted']]),
    sel_('emoji', 'm.emoji', [['default', 'em.default'], ['system', 'em.system'], ['custom', 'em.custom']], { set: v => { save({ emoji: v }); build('mods'); } }),
    slot('emoji', 'm.emojiFile', { show: () => cfg.emoji === 'custom' }),
    slot('deathSound', 'm.death'), slot('avatarBg', 'm.avatar'),
    { h: 'm.font' }, slot('font', 'm.font.l', { clearKey: 'm.font.clear' }),
  ],
  engine: () => [
    { h: 'g.engine' }, tog('manageFlags', 'e.manage'),
    { h: 'e.gfx' },
    sel_(null, 'e.msaa', [['auto', 'auto'], ['1', '1x'], ['2', '2x'], ['4', '4x'], ['8', '8x']], {
      get: () => String(cfg.fastFlags[MSAA] ?? 'auto'), set: v => v === 'auto' ? setFlags({}, [MSAA]) : setFlags({ [MSAA]: +v }) }),
    { t: 'toggle', l: 'e.dpi', get: () => cfg.fastFlags.DFFlagDisableDPIScale === 'True',
      set: v => v ? setFlags({ DFFlagDisableDPIScale: 'True' }) : setFlags({}, ['DFFlagDisableDPIScale']) },
    sel_(null, 'e.tex', [['auto', 'auto'], ['0', 'tex.0'], ['1', 'tex.1'], ['2', 'tex.2'], ['3', 'tex.3']], {
      get: () => cfg.fastFlags[TEXON] === 'True' ? String(cfg.fastFlags[TEX]) : 'auto',
      set: v => v === 'auto' ? setFlags({}, [TEXON, TEX]) : setFlags({ [TEXON]: 'True', [TEX]: +v }) }),
    { t: 'num', l: 'e.fps', min: 0, max: 9999, get: () => cfg.fastFlags.DFIntTaskSchedulerTargetFps ?? '',
      set: v => v > 0 ? setFlags({ DFIntTaskSchedulerTargetFps: v }) : setFlags({}, ['DFIntTaskSchedulerTargetFps']) },
    exclusive(API_FLAGS, 'e.api', { d3d11: 'Direct3D 11', vulkan: 'Vulkan', opengl: 'OpenGL' }),
    exclusive(LIGHT_FLAGS, 'e.light', { voxel: 'Voxel', shadow: 'ShadowMap', future: 'Future' }),
    { t: 'toggle', l: 'e.grass', get: () => GRASS.every(k => cfg.fastFlags[k] === 0),
      set: v => v ? setFlags(Object.fromEntries(GRASS.map(k => [k, 0]))) : setFlags({}, GRASS) },
    { h: 'e.pre' }, ...PRESETS.map(flagToggle),
    { h: 'e.prof' }, { t: 'prof' },
    { h: 'k.adv' },
    { t: 'area', l: 'e.json', get: () => JSON.stringify(cfg.fastFlags, null, 2),
      set: v => { const o = JSON.parse(v || '{}'); if (!isObj(o)) throw 0; save({ fastFlags: o }); build('engine'); } },
    { t: 'btns', l: 'e.reset', b: [{ l: 'e.reset.b', cls: 'danger', fn: () => { save({ fastFlags: {} }); build('engine'); } }] },
  ],
  look: () => [
    { h: 'g.theme' },
    { t: 'node', make: themeGallery },
    ...['bg', 'panel', 'line', 'text', 'mute', 'danger'].map(c => col('ui.colors.' + c, 'c.' + c, { show: () => cfg.ui.theme === 'custom' })),
    { t: 'accent', l: 'k.accent' },
    { h: 'k.l' }, { p: 'k.l.hint' },
    { t: 'btns', l: 'k.style', sel: sel_('ui.launcherStyle', 'k.style', [['ring', 'st.ring'], ['bar', 'st.bar'], ['minimal', 'st.minimal']]), b: [{ l: 'k.preview', fn: preview }] },
    sel_('ui.navPos', 'k.nav', [['left', 'nav.left'], ['right', 'nav.right'], ['top', 'nav.top']]),
    rng('ui.radius', 'k.radius', 0, 28, 1, { u: 'px' }), rng('ui.fs', 'k.fs', 12, 17, 1, { u: 'px' }),
    sel_('ui.font', 'k.font', [['system', 'f.system'], ['mono', 'f.mono'], ['serif', 'f.serif'], ['cond', 'f.cond']]),
    rng('ui.glow', 'k.glow', 0, 100, 5, { u: '%' }),
    tog('ui.animations', 'k.anim'),
    rng('ui.animSpeed', 'k.speed', 0.25, 3, 0.25, { u: 'x', show: () => cfg.ui.animations }),
    { h: 'k.bgt' },
    sel_('ui.bgMode', 'k.bgt', [['solid', 'bg.solid'], ['gradient', 'bg.gradient'], ['aurora', 'bg.aurora'], ['image', 'bg.image'], ['live', 'bg.live'], ['video', 'bg.video']], { set: v => { save({ ui: { bgMode: v } }); } }),
    col('ui.bgColor2', 'k.bg2', { show: () => cfg.ui.bgMode === 'gradient' }),
    rng('ui.bgAngle', 'k.angle', 0, 360, 5, { u: '°', show: () => cfg.ui.bgMode === 'gradient' }),
    { t: 'file', l: 'k.bgimg', show: () => cfg.ui.bgMode === 'image', get: () => cfg.ui.bgImage,
      pick: async () => { const r = await api.pickBg(); cfg = r.cfg; await loadBg(); applyLook(); build('look'); },
      clear: async () => { const r = await api.clearBg(); cfg = r.cfg; await loadBg(); applyLook(); build('look'); } },
    rng('ui.bgBlur', 'k.blur', 0, 30, 1, { u: 'px', show: () => ['image', 'video'].includes(cfg.ui.bgMode) }),
    rng('ui.bgDim', 'k.dim', 0, 90, 5, { u: '%', show: () => ['image', 'video'].includes(cfg.ui.bgMode) }),
    sel_('ui.live', 'k.live', ['stars', 'rain', 'snow', 'particles', 'matrix', 'bubbles'].map(x => [x, 'lv.' + x]), { show: () => cfg.ui.bgMode === 'live' }),
    rng('ui.liveSpeed', 'k.liveSpeed', 0.25, 3, 0.25, { u: 'x', show: () => cfg.ui.bgMode === 'live' }),
    rng('ui.liveDensity', 'k.liveDen', 10, 100, 5, { u: '%', show: () => cfg.ui.bgMode === 'live' }),
    { t: 'file', l: 'k.video', show: () => cfg.ui.bgMode === 'video', get: () => cfg.ui.bgVideo,
      pick: async () => { cfg = await api.pickBgVideo(); applyLook(); build('look'); },
      clear: async () => { cfg = await api.clearBgVideo(); applyLook(); build('look'); } },
    { h: 'k.win' },
    rng('ui.opacity', 'k.opacity', 60, 100, 5, { u: '%' }),
    sel_('ui.material', 'k.mat', [['none', 'mat.none'], ['mica', 'mat.mica'], ['acrylic', 'mat.acrylic']]),
    { t: 'text', k: 'ui.title', l: 'k.title', ph: 'Lumen', live: true, set: v => save({ ui: { title: v || 'Lumen' } }) },
    { t: 'file', l: 'k.icon', get: () => cfg.ui.icon,
      pick: async () => { const r = await api.pickIcon(); cfg = r.cfg; setIcon(r.icon); build('look'); },
      clear: async () => { const r = await api.clearIcon(); cfg = r.cfg; setIcon(null); build('look'); } },
    { h: 'k.adv' },
    { t: 'area', l: 'k.css', live: true, get: () => cfg.ui.customCss || '',
      set: v => { save({ ui: { customCss: v } }); clearTimeout(cssTimer); cssTimer = setTimeout(() => api.applyCss(v), 400); } },
    { t: 'area', l: 'k.json', get: () => JSON.stringify(uiOnly(cfg.ui), null, 1),
      set: v => { const o = JSON.parse(v); if (!isObj(o)) throw 0; const ok = {}; for (const k of Object.keys(uiOnly(cfg.ui))) if (k in o) ok[k] = o[k]; save({ ui: ok }); build('look'); } },
  ],
  links: () => [{ h: 'g.links' }, ...['desktop', 'start', 'play', 'studio'].map(id => ({
    t: 'toggle', l: 's.' + id, get: () => !!links[id], set: async v => { await api.setLink(id, v); links = await api.links(); build('links'); },
  }))],
};

function lab(it) {
  const s = E('span'); s.append(E('span', null, tx(it.l)));
  if (it.l + '.d' in LANG.D.ru) s.append(E('small', null, t(it.l + '.d')));
  return s;
}

function el(it) {
  if (it.h) return E('h3', null, t(it.h));
  if (it.p) return E('p', 'hint', t(it.p));
  if (it.t === 'integ') return integ();
  if (it.t === 'servers') return servers();
  if (it.t === 'library') return library();
  if (it.t === 'accounts') return accounts();
  if (it.t === 'history') return history();
  if (it.t === 'packs') return packs();
  if (it.t === 'prof') return prof();
  if (it.t === 'node') return it.make();
  const get = it.get || (() => pget(it.k)), set = it.set || (v => save(nest(it.k, v)));
  if (it.t === 'toggle') {
    const L = E('label', 'sw'), i = E('input'); i.type = 'checkbox'; i.checked = !!get(); i.onchange = () => set(i.checked);
    L.append(i, E('i'), lab(it)); return L;
  }
  if (it.t === 'area') {
    const R = E('div', 'col'), ta = E('textarea'); ta.value = get(); ta.spellcheck = false;
    const run = () => { try { set(ta.value); } catch { ta.classList.add('bad'); setTimeout(() => ta.classList.remove('bad'), 700); } };
    ta[it.live ? 'oninput' : 'onchange'] = run;
    R.append(lab(it), ta); return R;
  }
  const R = E('div', 'row'), C = E('span', 'ctl'); R.append(lab(it), C);
  switch (it.t) {
    case 'select': {
      const s = E('select');
      for (const [v, l] of it.o) { const o = E('option', null, tx(l)); o.value = v; s.append(o); }
      s.value = String(get()); s.onchange = () => set(s.value); C.append(s); break;
    }
    case 'text': { const i = E('input'); i.value = get() || ''; i.placeholder = it.ph || ''; i[it.live ? 'oninput' : 'onchange'] = () => set(i.value); C.append(i); break; }
    case 'num': { const i = E('input'); i.type = 'number'; i.min = it.min; i.max = it.max; i.value = get(); i.onchange = () => set(parseInt(i.value, 10) || 0); C.append(i); break; }
    case 'range': {
      const r = E('input'), v = E('span', 'val', get() + (it.u || ''));
      r.type = 'range'; r.min = it.min; r.max = it.max; r.step = it.step; r.value = get();
      r.oninput = () => { v.textContent = r.value + (it.u || ''); set(+r.value); }; C.append(r, v); break;
    }
    case 'color': { const c = E('input'); c.type = 'color'; c.value = get() || '#000000'; c.oninput = () => set(c.value); C.append(c); break; }
    case 'btns': {
      if (it.sel) { const s = el(it.sel); C.append(...s.querySelector('.ctl').children); }
      for (const b of it.b) { const x = E('button', 'btn ' + (b.cls || ''), t(b.l)); x.onclick = b.fn; C.append(x); } break;
    }
    case 'file': {
      const name = get();
      C.append(E('span', 'fname', name || t('none')));
      const p = E('button', 'btn', t(name ? 'replace' : 'pick')); p.onclick = it.pick; C.append(p);
      if (name) { const c = E('button', 'btn ' + (it.clearKey ? 'red' : ''), t(it.clearKey || 'clear')); c.onclick = it.clear; C.append(c); }
      break;
    }
    case 'accent': {
      const S = E('span', 'swatches'), a = cfg.ui.accent;
      const add = c => { const b = E('button', 'swatch' + (c ? '' : ' none') + (a === c ? ' on' : '')); if (c) b.style.background = c; b.onclick = () => { save({ ui: { accent: c } }); build('look'); }; S.append(b); };
      add(''); ACCENTS.forEach(add);
      const c = E('input'); c.type = 'color'; c.value = a || palette().accent; c.oninput = () => save({ ui: { accent: c.value } });
      S.append(c); C.append(S); R.querySelector('span').append(); break;
    }
  }
  return R;
}

function integ() {
  const W = E('div', 'integ'), L = E('div', 'ilist'), F = E('div', 'iform'); W.append(L, F);
  const commit = () => save({ integrations: [...cfg.integrations] });
  const draw = () => {
    L.innerHTML = '';
    cfg.integrations.forEach((x, i) => { const b = E('button', 'item' + (i === sel ? ' on' : ''), x.name || t('i.name')); b.onclick = () => { sel = i; draw(); }; L.append(b); });
    const bt = E('div', 'ibtns'), add = E('button', 'btn', t('i.new')), del = E('button', 'btn', t('i.del'));
    add.onclick = () => { cfg.integrations.push({ name: '', path: '', args: '', autoClose: true }); sel = cfg.integrations.length - 1; commit(); draw(); };
    del.disabled = !cfg.integrations[sel];
    del.onclick = () => { cfg.integrations.splice(sel, 1); sel = -1; commit(); draw(); };
    bt.append(add, del); L.append(bt);
    F.innerHTML = '';
    const x = cfg.integrations[sel];
    if (!x) return F.append(E('p', 'hint', t('i.empty')));
    const field = (key, label, browse) => {
      const r = E('label', 'row'), i = E('input'); i.value = x[key] || '';
      i.onchange = () => { x[key] = i.value; commit(); if (key === 'name') draw(); };
      const c = E('span', 'ctl'); c.append(i);
      if (browse) { const b = E('button', 'btn', t('browse')); b.onclick = async e => { e.preventDefault(); const p = await api.pickExe(); if (p) { x.path = p; i.value = p; commit(); } }; c.append(b); }
      r.append(E('span', null, t(label)), c); return r;
    };
    const sw = E('label', 'sw'), cb = E('input'); cb.type = 'checkbox'; cb.checked = !!x.autoClose; cb.onchange = () => { x.autoClose = cb.checked; commit(); };
    sw.append(cb, E('i'), E('span', null, t('i.close')));
    F.append(field('name', 'i.name'), field('path', 'i.path', true), field('args', 'i.args'), sw);
  };
  draw(); return W;
}

const ctl = (...xs) => { const c = E('span', 'ctl'); c.append(...xs); return c; };

// Подбор сервера (аналог Voidstrap Matchmaker): список серверов игры по пингу
function servers() {
  const W = E('div'), bar = E('div', 'toolbar'), i = E('input'), go = E('button', 'btn primary', t('sv.find')), out = E('div');
  i.placeholder = t('sv.ph');
  bar.append(i, go); W.append(E('p', 'hint', t('sv.l.d')), bar, out);
  const run = async () => {
    out.replaceChildren(E('p', 'hint', t('sv.loading')));
    const r = await api.findServers(i.value);
    if (r.error) return out.replaceChildren(E('p', 'hint', t('sv.err.' + r.error)));
    if (!r.servers.length) return out.replaceChildren(E('p', 'hint', t('sv.none')));
    const G = grp(r.name || r.placeId); out.replaceChildren(G);
    r.servers.forEach((s, n) => {
      const row = E('div', 'row'), info = E('span'), b = E('button', 'btn' + (n === 0 ? ' primary' : ''), t('sv.join'));
      info.append(E('span', null, (s.ping != null ? t('sv.ping', { p: s.ping }) : '—') + (n === 0 ? '  ·  ' + t('sv.best') : '')),
        E('small', null, t('sv.players', { a: s.playing, b: s.max }) + (s.fps ? `  ·  ${Math.round(s.fps)} FPS` : '')));
      b.onclick = () => { show('home'); play(`roblox://experiences/start?placeId=${r.placeId}&gameInstanceId=${s.id}`); };
      row.append(info, ctl(b)); G.body.append(row);
    });
  };
  go.onclick = run; i.onkeydown = e => { if (e.key === 'Enter') run(); };
  if (pendingServer) { i.value = pendingServer; pendingServer = null; run(); }
  return W;
}

// История игр с быстрым возвращением
function history() {
  const W = E('div');
  const draw = async () => {
    const h = await api.history();
    W.replaceChildren();
    const G = grp(t('h.l'));
    if (!h.length) G.body.append(E('p', 'ghint', t('h.empty')));
    else {
      const bar = E('div', 'toolbar'), clr = E('button', 'btn danger', t('h.clear'));
      bar.style.justifyContent = 'flex-end';
      clr.onclick = async () => { await api.clearHistory(); draw(); };
      bar.append(clr); W.append(bar);
    }
    for (const e of h) {
      const r = E('div', 'row'), info = E('span'), mins = e.end ? Math.max(1, Math.round((e.end - e.start) / 60000)) : null;
      info.append(E('span', null, e.name || e.placeId),
        E('small', null, [new Date(e.start).toLocaleString(cfg.language), mins && t('h.min', { m: mins }), e.location].filter(Boolean).join('  ·  ')));
      const a = E('button', 'btn', t('h.again')), s2 = E('button', 'btn', t('h.same'));
      a.onclick = () => { show('home'); play(`roblox://experiences/start?placeId=${e.placeId}`); };
      s2.onclick = () => { show('home'); play(`roblox://experiences/start?placeId=${e.placeId}&gameInstanceId=${e.jobId}`); };
      r.append(info, ctl(a, s2)); G.body.append(r);
    }
    W.append(G);
  };
  draw(); return W;
}

// Менеджер модов-паков
function packs() {
  const W = E('div');
  const draw = async () => {
    const names = await api.packs();
    W.replaceChildren();
    const top = E('div', 'row'), imp = E('button', 'btn', t('m.import')), open = E('button', 'btn', t('m.packsOpen'));
    imp.onclick = async () => { await api.importPack(); draw(); };
    open.onclick = () => api.openPacks();
    top.append(E('span'), ctl(imp, open)); W.append(top);
    if (!names.length) W.append(E('p', 'hint', t('m.noPacks')));
    for (const n of names) {
      const r = E('div', 'row'), L = E('label', 'sw mini'), cb = E('input'), del = E('button', 'btn danger', t('clear'));
      cb.type = 'checkbox'; cb.checked = !cfg.disabledPacks.includes(n);
      cb.onchange = () => save({ disabledPacks: cb.checked ? cfg.disabledPacks.filter(x => x !== n) : [...cfg.disabledPacks, n] });
      del.onclick = async () => { await api.deletePack(n); draw(); };
      L.append(cb, E('i')); r.append(E('span', null, n), ctl(L, del)); W.append(r);
    }
  };
  draw(); return W;
}

// Профили FastFlags
function prof() {
  const W = E('div');
  const list = cfg.flagProfiles, r1 = E('div', 'row'), s = E('select');
  list.forEach((p, i) => { const o = E('option', null, p.name); o.value = i; s.append(o); });
  if (!list.length) { const o = E('option', null, t('e.profNone')); o.value = ''; s.append(o); }
  const ap = E('button', 'btn', t('e.profApply')), dl = E('button', 'btn danger', t('e.profDel'));
  ap.disabled = dl.disabled = !list.length;
  ap.onclick = () => { const p = list[+s.value]; if (p) { save({ fastFlags: { ...p.flags } }); build('engine'); } };
  dl.onclick = () => { list.splice(+s.value, 1); save({ flagProfiles: [...list] }); build('engine'); };
  r1.append(E('span', null, t('e.prof')), ctl(s, ap, dl));
  const r2 = E('div', 'row'), n = E('input'), sv = E('button', 'btn', t('e.profSave'));
  n.placeholder = t('e.profName');
  sv.onclick = () => {
    const name = n.value.trim(); if (!name) return;
    save({ flagProfiles: [...list.filter(p => p.name !== name), { name, flags: { ...cfg.fastFlags } }] }); build('engine');
  };
  r2.append(E('span'), ctl(n, sv)); W.append(r1, r2);
  return W;
}

/* ---------- библиотека ---------- */
const fmtTime = ms => { const m = Math.floor((ms || 0) / 60000); if (m < 1) return t('t.lt'); const h = Math.floor(m / 60); return h ? t('t.hm', { h, m: m % 60 }) : t('t.m', { m }); };
const safeImg = u => (typeof u === 'string' && /^https:\/\/[^"'\s)]+$/.test(u)) ? u : null;
// аватар: картинка Roblox или кружок с первой буквой, пока картинки нет
const avatarOf = (name, url) => safeImg(url) || ('data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#8d97b8" fill-opacity=".35"/><text x="32" y="43" font-size="30" text-anchor="middle" fill="#8d97b8" font-family="sans-serif" font-weight="600">${String(name || '?').charAt(0).toUpperCase().replace(/[<>&"]/g, '?')}</text></svg>`));

/* ---------- аккаунты ---------- */
function renderAccChip() {
  const chip = $('#accchip'), s = $('#accSel'), list = cfg.accounts || [];
  chip.hidden = !list.length;
  if (!list.length) return;
  s.replaceChildren();
  const o0 = E('option', null, t('acc.sys')); o0.value = ''; s.append(o0);
  for (const a of list) { const o = E('option', null, a.display + (a.expired ? ' ⚠' : '')); o.value = a.id; s.append(o); }
  s.value = cfg.activeAccount || '';
  const act = list.find(a => a.id === cfg.activeAccount);
  $('#accImg').hidden = !act; if (act) $('#accImg').src = avatarOf(act.display, act.avatar);
  s.onchange = () => { save({ activeAccount: s.value || null }); renderAccChip(); };
}

function accounts() {
  const W = E('div');
  const draw = () => {
    W.replaceChildren(E('p', 'hint', t('acc.note')), E('p', 'hint', t('acc.sec')));
    const bar = E('div', 'toolbar'), add = E('button', 'btn primary', t('acc.add'));
    bar.style.justifyContent = 'flex-end';
    add.onclick = async () => { add.disabled = true; cfg = await api.addAccount(); renderAccChip(); draw(); };
    bar.append(add); W.append(bar);
    const G = grp(t('acc.cur')); W.append(G);

    const sys = E('div', 'row'), useSys = E('button', 'btn', t('acc.use'));
    useSys.disabled = !cfg.activeAccount;
    useSys.onclick = () => { save({ activeAccount: null }); renderAccChip(); draw(); };
    sys.append(E('span', null, t('acc.sys')), ctl(E('span', 'tag ok', cfg.activeAccount ? '' : t('acc.active')), useSys)); G.body.append(sys);

    if (!cfg.accounts.length) G.body.append(E('p', 'ghint', t('acc.none')));
    for (const a of cfg.accounts) {
      const r = E('div', 'row'), who = E('span', 'who'), info = E('span'), img = E('img');
      img.src = avatarOf(a.display, a.avatar);
      info.append(E('span', null, a.display), E('small', null, '@' + a.name));
      who.append(img, info);
      const st = E('span', 'tag ' + (a.expired ? 'bad' : 'ok'), a.expired ? t('acc.expired') : (a.id === cfg.activeAccount ? t('acc.active') : ''));
      const use = E('button', 'btn', t('acc.use')), re = E('button', 'btn', t('acc.relogin')), rm = E('button', 'btn danger', t('acc.remove'));
      use.disabled = a.id === cfg.activeAccount || !!a.expired;
      use.onclick = () => { save({ activeAccount: a.id }); renderAccChip(); draw(); };
      re.onclick = async () => { re.disabled = true; cfg = await api.addAccount(); renderAccChip(); draw(); };
      rm.onclick = async () => { cfg = await api.removeAccount(a.id); renderAccChip(); draw(); };
      r.append(who, ctl(st, use, re, rm)); G.body.append(r);
    }
  };
  draw(); return W;
}

// галерея тем: превью цветов вместо выпадающего списка
function themeGallery() {
  const W = E('div', 'themes');
  for (const id of themeIds()) {
    const th = THEMES[id] || (id === 'system' ? THEMES['lumen-dark'] : { ...THEMES['lumen-dark'], ...cfg.ui.colors });
    const b = E('button', 'theme' + (cfg.ui.theme === id ? ' on' : '')), pv = E('div', 'tprev'), panel = E('i'), dot = E('i');
    pv.style.background = id === 'system' ? `linear-gradient(90deg, ${THEMES['lumen-dark'].bg} 50%, ${THEMES['lumen-light'].bg} 50%)` : th.bg;
    panel.style.background = id === 'system' ? `linear-gradient(90deg, ${THEMES['lumen-dark'].panel} 50%, ${THEMES['lumen-light'].panel} 50%)` : th.panel;
    dot.style.background = th.accent;
    pv.append(panel, dot); b.append(pv, E('span', null, t('th.' + id)));
    b.onclick = () => { save({ ui: { theme: id } }); build('look'); };
    W.append(b);
  }
  return W;
}
// карточка-группа: заголовок и тело; тело доступно как g.body
function grp(title, ...kids) {
  const g = E('section', 'group'), b = E('div', 'gbody');
  if (title) g.append(E('h3', null, title));
  g.append(b); b.append(...kids); g.body = b;
  return g;
}
const subtitle = id => t('pg.' + id);
// страница по схеме: заголовок {h} начинает новую карточку, {p} становится подсказкой карточки, raw выводится без карточки
function renderPage(id) {
  const root = E('div', 'page');
  let g = null;
  vlist = vlist.filter(x => x[2] !== id);
  const open = title => { g = grp(title); root.append(g); };
  for (const it of PAGES[id]()) {
    if (it.h) { open(t(it.h)); continue; }
    if (it.raw) { const n = el(it); if (it.show) vlist.push([n, it, id]); root.append(n); g = null; continue; }
    if (!g) open(null);
    if (it.p) { g.insertBefore(E('p', 'ghint', t(it.p)), g.body); continue; }
    const n = el(it);
    if (it.show) vlist.push([n, it, id]);
    g.body.append(n);
  }
  return root;
}
function vis() {
  for (const [n, it] of vlist) n.hidden = !it.show();
  $$('.group').forEach(g => { if (g.body) g.hidden = g.body.children.length > 0 && [...g.body.children].every(c => c.hidden); });
}
function build(id) {
  const slot = subSlots[id] && subSlots[id].isConnected ? subSlots[id] : null, host = slot || $('#' + id);
  if (!host) return;
  const sc = (host.closest && host.closest('.view')) || host, st = sc.scrollTop;
  if (slot) host.replaceChildren(renderPage(id));
  else { const hd = E('div', 'phead'), L = E('div'); L.append(E('h1', null, t('nav.' + id)), E('p', 'psub', subtitle(id))); hd.append(L); host.replaceChildren(hd, renderPage(id)); }
  sc.scrollTop = st; vis();
}
function applyLang() {
  document.documentElement.lang = cfg.language;
  renderNav(); moveIndicator();
  if (!running) { $('#playLabel').textContent = t('play'); $('#status').textContent = t('ready'); }
  setVer();
  renderAccChip();
  if (typeof paintUpdate === 'function') paintUpdate();
  NAV.slice(1).forEach(build);
}

/* ---------- старт ---------- */
async function init() {
  cfg = await api.cfg.get();
  links = await api.links();
  for (const id of NAV.slice(1)) { const s = E('section', 'view'); s.id = id; $('#pages').append(s); }
  $$('[data-win]').forEach(b => b.onclick = () => api.win(b.dataset.win));
  $('#play').onclick = () => play();
  api.onProgress(d => setProgress(d.percent, d.text));
  api.onBoot(({ uri }) => { show('home'); play(uri); });
  api.onActivity(showActivity);

  applyLang(); applyLook();
  setIcon(await api.getIcon()); loadBg();
  show('home');
  verState = await api.latest(); setVer();
}
// запуск только после выполнения всех скриптов (pages2.js, updates.js дополняют NAV и PAGES)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
