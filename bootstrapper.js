const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const AdmZip = require('adm-zip');
const { t } = require('./lang');
const { cursorPng } = require('./png');

const ROOT = path.join(process.env.LOCALAPPDATA || os.homedir(), 'Lumen');
const P = {
  root: ROOT, versions: path.join(ROOT, 'Versions'), mods: path.join(ROOT, 'Mods'),
  tmp: path.join(ROOT, 'Downloads'), cfg: path.join(ROOT, 'config.json'), assets: path.join(ROOT, 'Assets'),
};
const DEFAULTS = {
  language: 'ru', channel: 'LIVE', installed: null,
  autoClose: true, confirmSecond: true, backgroundUpdates: false,
  manageFlags: true, fastFlags: {},
  applyMods: true, cursor: 'default', emoji: 'default', slots: {},
  activityTracking: true, queryLocation: true, closeOnLeave: false,
  discordRpc: false, discordAllowJoin: false, discordAppId: '', integrations: [],
  notifyServer: true, multiInstance: false, priority: 'normal', dlConcurrency: 4, segmented: true, cleanLogsDays: 0,
  compat: { fso: false, dpi: false }, disabledPacks: [], flagProfiles: [],
  accounts: [], activeAccount: null,
  studioPath: '', newsNotify: true, verifyOnLaunch: false, folders: [],
  autoUpdateCheck: true, updateMode: 'notify', updatePrerelease: false,
  overlay: {
    enabled: false, corner: 'tr', x: 16, y: 16, scale: 100, opacity: 85, bg: '#0b0e19', text: '#e9edff', accent: '#ffb23e',
    layout: 'column', labels: true, interval: 1000, metrics: ['fps', 'ping', 'cpu', 'ram'], hotkey: 'Control+Shift+O',
    presentMon: '', pmArgs: '-process_name RobloxPlayerBeta.exe -output_stdout -stop_existing_session -terminate_on_proc_exit', css: '',
  },
  ui: {
    theme: 'system', accent: '', launcherStyle: 'ring', navPos: 'left', radius: 12, fs: 14, font: 'system', glow: 55,
    animations: true, animSpeed: 1, bgMode: 'solid', bgColor2: '#1d2a55', bgAngle: 135, bgBlur: 12, bgDim: 55, bgImage: null,
    opacity: 100, material: 'none', title: 'Lumen', icon: null, customCss: '',
    bgVideo: null, live: 'stars', liveSpeed: 1, liveDensity: 50,
    colors: { bg: '#0b0e19', panel: '#121829', line: '#232b45', text: '#e9edff', mute: '#8d97b8', danger: '#ff6b6b' },
  },
};

const PKG_DIRS = {
  'RobloxApp.zip': '', 'redist.zip': '', 'WebView2.zip': '', 'shaders.zip': 'shaders/', 'ssl.zip': 'ssl/',
  'WebView2RuntimeInstaller.zip': 'WebView2RuntimeInstaller/',
  'content-avatar.zip': 'content/avatar/', 'content-configs.zip': 'content/configs/', 'content-fonts.zip': 'content/fonts/',
  'content-sky.zip': 'content/sky/', 'content-sounds.zip': 'content/sounds/', 'content-textures2.zip': 'content/textures/',
  'content-models.zip': 'content/models/', 'content-platform-fonts.zip': 'PlatformContent/pc/fonts/',
  'content-platform-dictionaries.zip': 'PlatformContent/pc/shared_compression_dictionaries/',
  'content-terrain.zip': 'PlatformContent/pc/terrain/', 'content-textures3.zip': 'PlatformContent/pc/textures/',
  'extracontent-luapackages.zip': 'ExtraContent/LuaPackages/', 'extracontent-translations.zip': 'ExtraContent/translations/',
  'extracontent-models.zip': 'ExtraContent/models/', 'extracontent-textures.zip': 'ExtraContent/textures/',
  'extracontent-places.zip': 'ExtraContent/places/',
};

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => { const o = { ...a }; for (const k in b) o[k] = isObj(b[k]) && isObj(a[k]) ? merge(a[k], b[k]) : b[k]; return o; };
function loadConfig() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(P.cfg, 'utf8')); } catch {}
  return { ...DEFAULTS, ...s, ui: merge(DEFAULTS.ui, s.ui || {}), compat: { ...DEFAULTS.compat, ...(s.compat || {}) }, overlay: { ...DEFAULTS.overlay, ...(s.overlay || {}) } };
}
function saveConfig(patch) {
  const c = loadConfig(), n = { ...c, ...patch };
  if (patch.ui) n.ui = merge(c.ui, patch.ui);
  if (patch.compat) n.compat = { ...c.compat, ...patch.compat };
  if (patch.overlay) n.overlay = { ...c.overlay, ...patch.overlay };
  fs.mkdirSync(P.root, { recursive: true });
  fs.writeFileSync(P.cfg, JSON.stringify(n, null, 2));
  return n;
}
const T = (k, p) => t(loadConfig().language, k, p);

const isLive = ch => ch.toUpperCase() === 'LIVE';
const cdn = ch => isLive(ch) ? 'https://setup.rbxcdn.com' : `https://setup.rbxcdn.com/channel/${ch.toLowerCase()}`;

async function getLatest(channel) {
  const suffix = isLive(channel) ? '' : `/channel/${channel.toLowerCase()}`;
  const r = await fetch(`https://clientsettingscdn.roblox.com/v2/client-version/WindowsPlayer${suffix}`);
  if (!r.ok) throw new Error(T('err.ver', { s: r.status }));
  const j = await r.json();
  return { guid: j.clientVersionUpload, version: j.version };
}

function parseManifest(text) {
  const l = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (l[0] !== 'v0') throw new Error(T('err.fmt'));
  const out = [];
  for (let i = 1; i + 3 < l.length; i += 4) out.push({ name: l[i], md5: l[i + 1], size: +l[i + 2] });
  return out;
}

async function download(url, dest, md5, onBytes) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(T('err.dl', { s: r.status, f: path.basename(dest) }));
  const hash = crypto.createHash('md5'), out = fs.createWriteStream(dest);
  for await (const chunk of r.body) {
    hash.update(chunk); onBytes(chunk.length);
    if (!out.write(chunk)) await new Promise(res => out.once('drain', res));
  }
  await new Promise((res, rej) => { out.on('error', rej); out.end(res); });
  if (hash.digest('hex') !== md5) throw new Error(T('err.md5', { f: path.basename(dest) }));
}

function extract(zipPath, target, only) {
  const base = path.resolve(target), out = [];
  fs.mkdirSync(base, { recursive: true });
  for (const e of new AdmZip(zipPath).getEntries()) {
    const rel = e.entryName.replace(/\\/g, '/'), full = path.resolve(base, rel);
    if (!full.startsWith(base + path.sep)) continue;
    if (e.isDirectory || rel.endsWith('/')) { if (!only) fs.mkdirSync(full, { recursive: true }); continue; }
    if (only && !only.has(rel)) continue;
    const d = e.getData();
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, d);
    out.push([rel, d.length, crypto.createHash('md5').update(d).digest('hex')]);
  }
  return out;
}

async function downloadSeg(url, dest, md5, size, seg, inc) {
  const probe = await fetch(url, { headers: { Range: 'bytes=0-0' } });
  await probe.arrayBuffer();
  if (probe.status !== 206) return download(url, dest, md5, inc);   // сервер не поддерживает Range
  const fd = fs.openSync(dest, 'w'), part = Math.ceil(size / seg);
  try {
    await Promise.all(Array.from({ length: seg }, async (_, i) => {
      const a = i * part, b = Math.min(size - 1, a + part - 1);
      if (a > b) return;
      const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` } });
      if (r.status !== 206) throw new Error(T('err.dl', { s: r.status, f: path.basename(dest) }));
      let pos = a;
      for await (const ch of r.body) { fs.writeSync(fd, ch, 0, ch.length, pos); pos += ch.length; inc(ch.length); }
    }));
  } finally { fs.closeSync(fd); }
  const h = crypto.createHash('md5');
  await new Promise((res, rej) => fs.createReadStream(dest).on('data', d => h.update(d)).on('end', res).on('error', rej));
  if (h.digest('hex') !== md5) throw new Error(T('err.md5', { f: path.basename(dest) }));
}

async function install(guid, channel, dir, send) {
  const base = `${cdn(channel)}/${guid}-`, cfg = loadConfig();
  const mr = await fetch(base + 'rbxPkgManifest.txt');
  if (!mr.ok) throw new Error(T('err.man', { s: mr.status }));
  const pkgs = parseManifest(await mr.text()).filter(p => p.name in PKG_DIRS);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(P.tmp, { recursive: true });
  const total = pkgs.reduce((a, p) => a + p.size, 0) || 1, win = [];
  let got = 0, last = 0;
  const index = {};
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const report = () => {
    const now = Date.now();
    if (now - last < 100) return;
    last = now;
    win.push([now, got]);
    while (win.length > 1 && now - win[0][0] > 4000) win.shift();
    const sp = win.length > 1 ? (got - win[0][1]) / ((now - win[0][0]) / 1000) : 0;
    send({ percent: Math.min(97, got / total * 95),
      text: T('dl2', { a: (got / 1048576).toFixed(0), b: (total / 1048576).toFixed(0), s: (sp / 1048576).toFixed(1), e: sp > 0 ? fmt((total - got) / sp) : '…' }) });
  };
  try {
    const queue = [...pkgs], seg = cfg.segmented ? 4 : 1, workers = Math.max(1, Math.min(8, (cfg.dlConcurrency | 0) || 4));
    await Promise.all(Array.from({ length: workers }, async () => {
      for (let p; (p = queue.shift());) {
        const zip = path.join(P.tmp, `${guid}-${p.name}`), inc = n => { got += n; report(); };
        if (seg > 1 && p.size > 8 * 1048576) await downloadSeg(base + p.name, zip, p.md5, p.size, seg, inc);
        else await download(base + p.name, zip, p.md5, inc);
        index[p.name] = extract(zip, path.join(dir, PKG_DIRS[p.name]));
        fs.rmSync(zip, { force: true });
      }
    }));
    fs.writeFileSync(path.join(dir, 'AppSettings.xml'),
      '<?xml version="1.0" encoding="UTF-8"?>\r\n<Settings>\r\n\t<ContentFolder>content</ContentFolder>\r\n\t<BaseUrl>http://www.roblox.com</BaseUrl>\r\n</Settings>\r\n');
    fs.writeFileSync(path.join(dir, 'integrity.json'), JSON.stringify({ v: 1, packages: index }));
    fs.writeFileSync(path.join(dir, '.complete'), '');
  } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
}

/* ---------- моды и предустановки ---------- */
function writeFlags(dir, cfg) {
  const f = path.join(dir, 'ClientSettings', 'ClientAppSettings.json');
  if (!cfg.manageFlags || !Object.keys(cfg.fastFlags).length) return fs.rmSync(f, { force: true });
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(cfg.fastFlags, null, 2));
}

// запись файла с резервной копией оригинала (или меткой .new, если файла не было),
// чтобы мод/предустановку можно было полностью откатить
function writeMod(dir, rel, data) {
  const f = path.join(dir, rel), b = path.join(dir, '.bak', rel);
  if (!fs.existsSync(b) && !fs.existsSync(b + '.new')) {
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.existsSync(f) ? fs.copyFileSync(f, b) : fs.writeFileSync(b + '.new', '');
  }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
}
function revertMod(dir, rel) {
  const f = path.join(dir, rel), b = path.join(dir, '.bak', rel);
  if (fs.existsSync(b)) fs.copyFileSync(b, f);
  else if (fs.existsSync(b + '.new')) fs.rmSync(f, { force: true });
}

// моды: корень Mods + включённые паки из Mods/Packs. Исполняемые файлы и скрипты не применяются.
const PACKS = path.join(P.mods, 'Packs');
const BLOCKED = /\.(exe|dll|sys|bat|cmd|ps1|vbs|msi|scr|com|lnk)$/i;
function walk(root, skip, out, rel = '') {
  let ents;
  try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (skip && skip(r)) continue;
    if (e.isDirectory()) walk(root, skip, out, r);
    else if (!BLOCKED.test(e.name)) out.set(r, path.join(root, r));
  }
}
function listPacks() {
  fs.mkdirSync(PACKS, { recursive: true });
  return fs.readdirSync(PACKS, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
}
function importPack(zip) {
  fs.mkdirSync(PACKS, { recursive: true });
  const name = path.basename(zip, path.extname(zip)).replace(/[\\/:*?"<>|]/g, '_') || 'pack';
  let n = name, i = 2;
  while (fs.existsSync(path.join(PACKS, n))) n = `${name} (${i++})`;
  extract(zip, path.join(PACKS, n));
  return n;
}
function deletePack(name) {
  if (typeof name !== 'string' || !/^[^\\/:*?"<>|]+$/.test(name) || name === '.' || name === '..') return;
  fs.rmSync(path.join(PACKS, name), { recursive: true, force: true });
}
function applyMods(dir, c) {
  const map = new Map();
  if (c.applyMods) {
    fs.mkdirSync(P.mods, { recursive: true });
    walk(P.mods, r => r === 'Packs' || r.startsWith('.'), map);
    for (const n of listPacks()) if (!(c.disabledPacks || []).includes(n)) walk(path.join(PACKS, n), r => r.startsWith('.'), map);
  }
  const mf = path.join(dir, '.mods.json');
  let prev = [];
  try { prev = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch {}
  for (const rel of prev) if (!map.has(rel)) revertMod(dir, rel);
  for (const [rel, src] of map) writeMod(dir, rel, fs.readFileSync(src));
  fs.writeFileSync(mf, JSON.stringify([...map.keys()]));
  return new Set(map.keys());
}
const slotFile = (c, id) => { const s = c.slots && c.slots[id], f = s && path.join(P.assets, s.file); return f && fs.existsSync(f) ? { ...s, full: f } : null; };

const CURSORS = ['content/textures/Cursors/KeyboardMouse/ArrowCursor.png', 'content/textures/Cursors/KeyboardMouse/ArrowFarCursor.png'];
const EMOJI = 'content/fonts/TwemojiMozilla.ttf';
const SLOTS = { deathSound: 'content/sounds/ouch.ogg', avatarBg: 'ExtraContent/places/Mobile.rbxl' };

function applyFont(dir, c) {
  const fam = path.join(dir, 'content', 'fonts', 'families');
  if (!fs.existsSync(fam)) return;
  const bakDir = path.join(dir, '.fontbackup'), font = slotFile(c, 'font');
  fs.mkdirSync(bakDir, { recursive: true });
  if (font) fs.copyFileSync(font.full, path.join(dir, 'content', 'fonts', font.file));
  for (const f of fs.readdirSync(fam).filter(n => n.endsWith('.json'))) {
    const file = path.join(fam, f), bak = path.join(bakDir, f);
    if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
    if (!font) { fs.copyFileSync(bak, file); continue; }
    const j = JSON.parse(fs.readFileSync(bak, 'utf8').replace(/^\uFEFF/, ''));
    for (const face of j.faces || []) face.assetId = 'rbxasset://fonts/' + font.file;
    fs.writeFileSync(file, JSON.stringify(j, null, 2));
  }
}

function applyPresets(dir, c, modSet) {
  const rv = rel => { if (!modSet.has(rel)) revertMod(dir, rel); };   // мод важнее «по умолчанию»
  for (const rel of CURSORS) c.cursor === 'default' ? rv(rel) : writeMod(dir, rel, cursorPng(c.cursor));
  const sys = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'seguiemj.ttf'), custom = slotFile(c, 'emoji');
  if (c.emoji === 'system' && fs.existsSync(sys)) writeMod(dir, EMOJI, fs.readFileSync(sys));
  else if (c.emoji === 'custom' && custom) writeMod(dir, EMOJI, fs.readFileSync(custom.full));
  else rv(EMOJI);
  for (const [id, rel] of Object.entries(SLOTS)) { const s = slotFile(c, id); s ? writeMod(dir, rel, fs.readFileSync(s.full)) : rv(rel); }
}

/* ---------- процессы и диск ---------- */
function robloxRunning() {
  return new Promise(res => execFile('tasklist', ['/FI', 'IMAGENAME eq RobloxPlayerBeta.exe', '/NH'], { windowsHide: true },
    (e, out) => res(!e && /RobloxPlayerBeta\.exe/i.test(out))));
}
const killRoblox = () => execFile('taskkill', ['/IM', 'RobloxPlayerBeta.exe', '/F'], { windowsHide: true }, () => {});
function freeGB() { try { const s = fs.statfsSync(P.root); return s.bavail * s.bsize / 1073741824; } catch { return 0; } }

function cleanup(keep) {
  if (!fs.existsSync(P.versions)) return;
  for (const d of fs.readdirSync(P.versions)) if (!keep.has(d)) { try { fs.rmSync(path.join(P.versions, d), { recursive: true, force: true }); } catch {} }
}

async function ensure(send) {
  fs.mkdirSync(P.root, { recursive: true });
  const cfg = loadConfig(), ok = g => g && fs.existsSync(path.join(P.versions, g, '.complete'));
  send({ percent: 0, text: T('checking') });
  let latest = null;
  try { latest = await getLatest(cfg.channel); } catch (e) { if (!ok(cfg.installed)) throw e; }
  const have = ok(cfg.installed) ? cfg.installed : null, keep = new Set();
  let guid, update = null;
  if (!latest || latest.guid === have) guid = have;
  else if (have && cfg.backgroundUpdates && freeGB() >= 5) {
    guid = have; keep.add(latest.guid);
    update = async () => {
      await install(latest.guid, cfg.channel, path.join(P.versions, latest.guid), () => {});
      saveConfig({ installed: latest.guid });
    };
  } else { guid = latest.guid; await install(guid, cfg.channel, path.join(P.versions, guid), send); }
  if (!guid) throw new Error(T('err.ver', { s: 'offline' }));

  send({ percent: 98, text: T('applying') });
  const dir = path.join(P.versions, guid);
  if (cfg.verifyOnLaunch) {
    const r = await verifyIntegrity(dir, false, () => {});
    if (r.bad && r.bad.length) await repairIntegrity(dir, r.bad, send);
  }
  const modSet = applyMods(dir, cfg);
  applyFont(dir, cfg);
  applyPresets(dir, cfg, modSet);
  writeFlags(dir, cfg);            // FastFlags применяются последними
  await applyCompat(dir, cfg);
  cleanLogs(cfg.cleanLogsDays);
  saveConfig({ installed: guid });
  keep.add(guid);
  if (!(await robloxRunning())) cleanup(keep);
  return { guid, update };
}

function launch(uri) {
  const { installed } = loadConfig(), exe = path.join(P.versions, installed, 'RobloxPlayerBeta.exe');
  const u = safeUri(uri), args = u ? [u] : ['--app'];
  spawn(exe, args, { detached: true, stdio: 'ignore', cwd: path.dirname(exe) }).unref();
}
function reset() {
  fs.rmSync(P.versions, { recursive: true, force: true });
  fs.rmSync(P.tmp, { recursive: true, force: true });
  saveConfig({ installed: null });
}

/* ---------- безопасные ссылки, совместимость, приоритет, мультиокно, очистка, история ---------- */
// строгая проверка: схема из белого списка, длина, без управляющих символов и пробелов
function safeUri(u) {
  if (typeof u !== 'string' || u.length > 4096 || /[\x00-\x20\x7f"]/.test(u)) return null;
  return /^roblox(-player)?:/i.test(u) ? u : null;
}
const run = (cmd, args) => new Promise(r => execFile(cmd, args, { windowsHide: true }, () => r()));
const LAYERS = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers';
async function applyCompat(dir, c) {
  const exe = path.join(dir, 'RobloxPlayerBeta.exe'), f = [];
  if (c.compat.fso) f.push('DISABLEDXMAXIMIZEDWINDOWEDMODE');
  if (c.compat.dpi) f.push('HIGHDPIAWARE');
  if (f.length) await run('reg', ['add', LAYERS, '/v', exe, '/t', 'REG_SZ', '/d', '~ ' + f.join(' '), '/f']);
  else await run('reg', ['delete', LAYERS, '/v', exe, '/f']);
}
// ссылка запуска с одноразовым билетом входа (формат ссылок самого сайта Roblox)
function buildTicketUri(ticket, placeId, jobId) {
  if (!/^\d+$/.test(String(placeId)) || (jobId && !/^[0-9a-f-]{36}$/i.test(jobId))) return null;
  if (!/^[A-Za-z0-9_\-+/=.%]{8,2000}$/.test(String(ticket))) return null;
  const tracker = String(Math.floor(1e11 + Math.random() * 9e11));
  const req = jobId ? `RequestGameJob&browserTrackerId=${tracker}&placeId=${placeId}&gameId=${jobId}` : `RequestGame&browserTrackerId=${tracker}&placeId=${placeId}`;
  const launcher = `https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=${req}&isPlayTogetherGame=false`;
  return safeUri(`roblox-player:1+launchmode:play+gameinfo:${ticket}+launchtime:${Date.now()}+placelauncherurl:${encodeURIComponent(launcher)}+browsertrackerid:${tracker}+robloxLocale:en_us+gameLocale:en_us+channel:+LaunchExp:InApp`);
}

// библиотека игр и общее время в каждом плейсе
const LIBF = path.join(ROOT, 'library.json');
function loadLibrary() { try { return JSON.parse(fs.readFileSync(LIBF, 'utf8')); } catch { return {}; } }
function saveLibrary(l) { fs.mkdirSync(ROOT, { recursive: true }); fs.writeFileSync(LIBF, JSON.stringify(l)); }
let libCur = null;
function libUpsert(placeId, info = {}, extra = {}) {
  const l = loadLibrary(), e = l[placeId] || { placeId: String(placeId), totalMs: 0, sessions: 0, fav: false };
  l[placeId] = { ...e, name: info.name || e.name, icon: info.icon || e.icon, creator: info.creator || e.creator, universeId: info.universeId || e.universeId, hidden: false, ...(typeof extra === 'function' ? extra(e) : extra) };
  saveLibrary(l);
}
function libStart(placeId, info = {}) {
  libStop();
  libUpsert(placeId, info, e => ({ sessions: (e.sessions || 0) + 1, last: Date.now() }));
  libCur = { placeId, at: Date.now() };
}
function libTick() {
  if (!libCur) return;
  const now = Date.now(), l = loadLibrary(), e = l[libCur.placeId];
  if (e) { e.totalMs = (e.totalMs || 0) + (now - libCur.at); e.last = now; saveLibrary(l); addStat(libCur.placeId, now - libCur.at, now); }
  libCur.at = now;
}
function libStop() { libTick(); libCur = null; }
function libSet(id, patch) {
  if (!/^\d+$/.test(String(id))) return false;
  const l = loadLibrary();
  if (!l[id]) return false;
  Object.assign(l[id], patch); saveLibrary(l); return true;
}

const PRIO = { above: 'AboveNormal', high: 'High' };
function setPriority(level) {
  const cls = PRIO[level];
  if (!cls) return;
  execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `Get-Process RobloxPlayerBeta -ErrorAction SilentlyContinue | ForEach-Object { $_.PriorityClass = '${cls}' }`], { windowsHide: true }, () => {});
}
// несколько окон Roblox: удерживаем именованный мьютекс, пока запускаются клиенты
let mutexProc = null;
async function holdMutex() {
  if (mutexProc) return;
  mutexProc = spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command',
    "$m = New-Object System.Threading.Mutex($true,'ROBLOX_singletonMutex'); while($true){ Start-Sleep 3600 }"], { stdio: 'ignore', windowsHide: true });
  mutexProc.on('error', () => { mutexProc = null; });
  mutexProc.on('exit', () => { mutexProc = null; });
  await new Promise(r => setTimeout(r, 1500));
}
function releaseMutex() { if (mutexProc) { try { mutexProc.kill(); } catch {} mutexProc = null; } }

const LOGS_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'Roblox', 'logs');
function sweep(dir, minAge) {
  let n = 0, ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of ents) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { n += sweep(f, minAge); continue; }
    try {
      const st = fs.statSync(f);
      if (Date.now() - st.mtimeMs < minAge) continue;
      fs.rmSync(f, { force: true });
      if (!fs.existsSync(f)) n += st.size;
    } catch {}
  }
  return n;
}
const cleanLogs = days => days > 0 ? sweep(LOGS_DIR, days * 864e5) : 0;
const cleanCache = () => Math.round((sweep(path.join(os.tmpdir(), 'Roblox'), 0) + sweep(LOGS_DIR, 864e5)) / 1048576);

const HIST = path.join(ROOT, 'history.json');
function loadHistory() { try { return JSON.parse(fs.readFileSync(HIST, 'utf8')); } catch { return []; } }
function saveHistory(h) { fs.mkdirSync(ROOT, { recursive: true }); fs.writeFileSync(HIST, JSON.stringify(h.slice(0, 50))); }
function addHistory(e) { const h = loadHistory(); if (h[0] && !h[0].end) h[0].end = Date.now(); h.unshift(e); saveHistory(h); }
function endHistory() { const h = loadHistory(); if (h[0] && !h[0].end) { h[0].end = Date.now(); saveHistory(h); } }

/* ---------- проверка целостности файлов Roblox ---------- */
// При установке для каждого файла записывается размер и MD5 (integrity.json). Проверка сверяет диск с этой записью,
// пропуская файлы, которые намеренно изменены модами, предустановками, шрифтом и FastFlags.
const touched = (rel, mod) => mod.has(rel) || rel.startsWith('content/fonts/families/') || rel.startsWith('content/fonts/Slot_') || rel.startsWith('ClientSettings/');
function modifiedSet(dir) {
  const s = new Set();
  try { for (const r of JSON.parse(fs.readFileSync(path.join(dir, '.mods.json'), 'utf8'))) s.add(r); } catch {}
  for (const r of [...CURSORS, EMOJI, ...Object.values(SLOTS)]) s.add(r);
  return s;
}
async function verifyIntegrity(dir, full, send) {
  let idx;
  try { idx = JSON.parse(fs.readFileSync(path.join(dir, 'integrity.json'), 'utf8')); } catch { return { noIndex: true }; }
  const mod = modifiedSet(dir), all = [], bad = [];
  for (const [pkg, ents] of Object.entries(idx.packages || {})) for (const [rel, size, md5] of ents) all.push([pkg, rel, (PKG_DIRS[pkg] || '') + rel, size, md5]);
  let n = 0;
  for (const [pkg, rel, abs, size, md5] of all) {
    if (++n % 250 === 0) { send({ percent: n / all.length * 100, text: T('itg.run') }); await new Promise(r => setImmediate(r)); }
    if (touched(abs, mod)) continue;
    const f = path.join(dir, abs);
    let st;
    try { st = fs.statSync(f); } catch { bad.push({ pkg, rel, abs, why: 'missing' }); continue; }
    if (st.size !== size) { bad.push({ pkg, rel, abs, why: 'size' }); continue; }
    if (full && crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex') !== md5) bad.push({ pkg, rel, abs, why: 'hash' });
  }
  return { checked: all.length, bad };
}
async function repairIntegrity(dir, bad, send) {
  const guid = path.basename(dir), cfg = loadConfig(), base = `${cdn(cfg.channel)}/${guid}-`;
  const mr = await fetch(base + 'rbxPkgManifest.txt');
  if (!mr.ok) throw new Error(T('err.man', { s: mr.status }));
  const man = new Map(parseManifest(await mr.text()).map(p => [p.name, p]));
  const by = {};
  for (const b of bad) (by[b.pkg] ||= []).push(b.rel);
  fs.mkdirSync(P.tmp, { recursive: true });
  let i = 0;
  for (const [pkg, rels] of Object.entries(by)) {
    const p = man.get(pkg);
    if (!p || !(pkg in PKG_DIRS)) continue;
    send({ percent: i++ / Object.keys(by).length * 100, text: T('itg.fix', { p: pkg }) });
    const zip = path.join(P.tmp, `${guid}-${pkg}`);
    await download(base + pkg, zip, p.md5, () => {});
    extract(zip, path.join(dir, PKG_DIRS[pkg]), new Set(rels));
    fs.rmSync(zip, { force: true });
  }
}

/* ---------- Roblox Studio ---------- */
function findStudio(c = loadConfig()) {
  if (c.studioPath && /RobloxStudioBeta\.exe$/i.test(c.studioPath) && fs.existsSync(c.studioPath)) return c.studioPath;
  const la = process.env.LOCALAPPDATA || os.homedir();
  let best = null, mt = 0;
  for (const r of [path.join(la, 'Roblox', 'Versions'), path.join(la, 'Bloxstrap', 'Versions')]) {
    let ds = []; try { ds = fs.readdirSync(r); } catch {}
    for (const d of ds) {
      const f = path.join(r, d, 'RobloxStudioBeta.exe');
      try { const m = fs.statSync(f).mtimeMs; if (m > mt) { mt = m; best = f; } } catch {}
    }
  }
  return best;
}
function launchStudio(file) {
  const exe = findStudio();
  if (!exe) return false;
  const args = file && /\.(rbxl|rbxlx|rbxm|rbxmx)$/i.test(file) ? [file] : [];
  const p = spawn(exe, args, { detached: true, stdio: 'ignore', cwd: path.dirname(exe) });
  p.on('error', () => {}); p.unref();
  return true;
}

/* ---------- статистика активности (по дням, часам, дням недели, играм, друзьям) ---------- */
const STATF = path.join(ROOT, 'stats.json');
const emptyStats = () => ({ days: {}, hours: Array(24).fill(0), dow: Array(7).fill(0), byPlace: {}, friends: [] });
function loadStats() { try { return { ...emptyStats(), ...JSON.parse(fs.readFileSync(STATF, 'utf8')) }; } catch { return emptyStats(); } }
function saveStats(s) { fs.mkdirSync(ROOT, { recursive: true }); fs.writeFileSync(STATF, JSON.stringify(s)); }
function addStat(placeId, ms, now = Date.now()) {
  if (!(ms > 0) || ms > 3600e3) return;
  const s = loadStats(), d = new Date(now), key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  s.days[key] = (s.days[key] || 0) + ms; s.hours[d.getHours()] += ms; s.dow[d.getDay()] += ms;
  s.byPlace[placeId] = (s.byPlace[placeId] || 0) + ms;
  const keys = Object.keys(s.days).sort();
  while (keys.length > 400) delete s.days[keys.shift()];
  saveStats(s);
}
function addFriendSample(friends) {
  const s = loadStats(), now = Date.now(), last = s.friends[s.friends.length - 1];
  if (last && now - last.t < 300000) return;
  s.friends.push({ t: now, online: friends.filter(f => f.type > 0).length, ingame: friends.filter(f => f.type === 2).length });
  s.friends = s.friends.slice(-400);
  saveStats(s);
}

module.exports = {
  verifyIntegrity, repairIntegrity, findStudio, launchStudio, loadStats, addStat, addFriendSample,
  P, loadConfig, saveConfig, getLatest, ensure, launch, reset, robloxRunning, killRoblox,
  safeUri, buildTicketUri, setPriority, holdMutex, releaseMutex, cleanCache, loadHistory, saveHistory, addHistory, endHistory,
  loadLibrary, libUpsert, libStart, libTick, libStop, libSet,
  listPacks, importPack, deletePack, applyMods, applyPresets, applyFont,
};
