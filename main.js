const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage, nativeTheme, Tray, Menu, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const B = require('./bootstrapper');
const Session = require('./session');
const Accounts = require('./accounts');
const Discover = require('./discover');
const Overlay = require('./overlay');
const Updater = require('./updater');
const { findServers, placeInfo } = require('./activity');
const { dot } = require('./png');
const { t } = require('./lang');

const PROTOS = ['roblox-player', 'roblox'];
const uriFrom = argv => argv.find(a => PROTOS.some(p => a.startsWith(p + ':')));
const bootFrom = argv => { const uri = uriFrom(argv); return (uri || argv.includes('--play')) ? { uri: uri || null } : null; };
const T = (k, p) => t(B.loadConfig().language, k, p);
let win, tray = null, busy = false, sessionActive = false, quitting = false, cssKey = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('before-quit', () => { quitting = true; B.releaseMutex(); Overlay.stop(); });
app.on('second-instance', (_, argv) => {
  if (argv.includes('--studio')) { B.launchStudio(); return; }
  if (!win) return;
  showWin();
  const b = bootFrom(argv);
  if (b) win.webContents.send('boot', b);
});

function registerProtocols() {
  for (const p of PROTOS) {
    if (process.defaultApp) app.setAsDefaultProtocolClient(p, process.execPath, [path.resolve(process.argv[1])]);
    else app.setAsDefaultProtocolClient(p);
  }
}

/* ---- ассеты кастомизации ---- */
const assetPath = n => n ? path.join(B.P.assets, n) : null;
function dataUrl(name, size) {
  const p = assetPath(name);
  if (!p || !fs.existsSync(p)) return null;
  if (size) { const i = nativeImage.createFromPath(p); return i.isEmpty() ? null : i.resize({ width: size, height: size }).toDataURL(); }
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[path.extname(p).slice(1).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,` + fs.readFileSync(p).toString('base64');
}
function putAsset(prefix, src) {
  fs.mkdirSync(B.P.assets, { recursive: true });
  for (const f of fs.readdirSync(B.P.assets)) if (f.startsWith(prefix + '.')) fs.rmSync(path.join(B.P.assets, f), { force: true });
  const file = prefix + path.extname(src).toLowerCase();
  fs.copyFileSync(src, path.join(B.P.assets, file));
  return file;
}
const dropAsset = prefix => { try { for (const f of fs.readdirSync(B.P.assets)) if (f.startsWith(prefix + '.')) fs.rmSync(path.join(B.P.assets, f), { force: true }); } catch {} };
async function pickFile(title, exts) {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openFile'], filters: [{ name: title, extensions: exts }] });
  return r.canceled ? null : r.filePaths[0];
}
const BG = { 'lumen-dark': '#0b0e19', 'lumen-light': '#f3f5fb', 'midnight': '#070a12', 'forest': '#0d1511', 'sakura': '#1a1018', 'terminal': '#000000', 'paper': '#f4efe6', 'nord': '#2e3440', 'dracula': '#282a36', 'solarized-dark': '#002b36', 'solarized-light': '#fdf6e3', 'catppuccin': '#1e1e2e', 'tokyo-night': '#1a1b26', 'gruvbox': '#282828', 'rose-pine': '#191724', 'ocean': '#06141f', 'sunset': '#1b1020', 'mono-dark': '#000000', 'mono-light': '#ffffff', 'cyberpunk': '#0a0014', 'coffee': '#1f1611', 'lavender': '#f5f1fb', 'mint': '#effaf5' };
function bgColor() {
  const u = B.loadConfig().ui;
  if (u.theme === 'custom') return u.colors.bg;
  if (u.theme === 'system') return nativeTheme.shouldUseDarkColors ? BG['lumen-dark'] : BG['lumen-light'];
  return BG[u.theme] || BG['lumen-dark'];
}
function iconImage() {
  const p = assetPath(B.loadConfig().ui.icon);
  if (!p || !fs.existsSync(p)) return null;
  const i = nativeImage.createFromPath(p);
  return i.isEmpty() ? null : i;
}
async function applyCss(css) {
  try {
    if (cssKey) { await win.webContents.removeInsertedCSS(cssKey); cssKey = null; }
    if (css && css.trim()) cssKey = await win.webContents.insertCSS(css);
  } catch {}
}

/* ---- окно и трей ---- */
function createWindow() {
  const ui = B.loadConfig().ui;
  win = new BrowserWindow({
    width: 1100, height: 720, minWidth: 940, minHeight: 620, frame: false, resizable: true, show: false,
    backgroundColor: bgColor(), icon: iconImage() || undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => {
    applyCss(ui.customCss);
    const b = bootFrom(process.argv);
    if (b) win.webContents.send('boot', b);
  });
  win.on('close', e => { if (sessionActive && !quitting) { e.preventDefault(); hideToTray(); } });
}
function showWin() { if (tray) { tray.destroy(); tray = null; } win.show(); if (win.isMinimized()) win.restore(); win.focus(); }
function hideToTray() {
  if (!tray) {
    const a = B.loadConfig().ui.accent, rgb = /^#[0-9a-f]{6}$/i.test(a) ? [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)) : [255, 178, 62];
    tray = new Tray(nativeImage.createFromBuffer(dot(32, rgb)));
    tray.setToolTip(B.loadConfig().ui.title || 'Lumen');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: T('tray.show'), click: showWin }, { label: T('tray.quit'), click: () => { quitting = true; app.quit(); } }]));
    tray.on('click', showWin);
  }
  win.hide();
}

app.whenReady().then(() => {
  if (process.argv.includes('--studio')) { B.launchStudio(); app.quit(); return; }
  registerProtocols(); createWindow();
  Updater.start(() => win);
  const newsRun = async () => {
    try {
      const r = await Discover.checkNews();
      if (r.fresh.length) {
        if (win) win.webContents.send('news:badge', Discover.getFeed().unread);
        if (B.loadConfig().newsNotify) new Notification({ title: 'Lumen', body: r.fresh.map(i => i.name).slice(0, 3).join(', ') }).show();
      }
    } catch {}
  };
  setTimeout(newsRun, 20000); setInterval(newsRun, 30 * 60 * 1000);
});
app.on('window-all-closed', () => app.quit());

/* ---- IPC ---- */
ipcMain.handle('cfg:get', () => B.loadConfig());
ipcMain.handle('cfg:set', (_, patch) => B.saveConfig(patch));
ipcMain.handle('latest', async () => { try { return await B.getLatest(B.loadConfig().channel); } catch (e) { return { error: e.message }; } });

ipcMain.handle('launch', async (_, rawUri) => {
  if (busy) return { ok: false, error: T('busy') };
  const uri = rawUri ? B.safeUri(rawUri) : null;
  if (rawUri && !uri) return { ok: false, error: T('err.uri') };
  busy = true;
  const send = p => win.webContents.send('progress', p);
  try {
    const cfg0 = B.loadConfig();
    if (cfg0.confirmSecond && !cfg0.multiInstance && await B.robloxRunning()) {
      const r = await dialog.showMessageBox(win, { type: 'question', buttons: [T('dlg.ok'), T('dlg.cancel')], defaultId: 1, cancelId: 1, message: T('dlg.second') });
      if (r.response !== 0) return { ok: false, cancelled: true };
    }
    const { update } = await B.ensure(send);
    send({ percent: 100, text: T('starting') });
    if (cfg0.multiInstance) await B.holdMutex();
    // активный аккаунт: запуск конкретной игры идёт с одноразовым билетом этого аккаунта
    let launchUri = uri;
    const pm = uri && /^roblox:\/\/experiences\/start\?placeId=(\d+)(?:&gameInstanceId=([0-9a-f-]{36}))?$/i.exec(uri);
    const acc = (cfg0.accounts || []).find(a => a.id === cfg0.activeAccount);
    if (pm && acc) {
      try { launchUri = await Accounts.ticketUri(acc, pm[1], pm[2]); }
      catch (e) {
        const expired = e.message === 'expired';
        if (expired) B.saveConfig({ accounts: cfg0.accounts.map(a => a.id === acc.id ? { ...a, expired: true } : a) });
        return { ok: false, error: T(expired ? 'acc.err.expired' : 'acc.err.ticket') };
      }
    }
    B.launch(launchUri);
    const cfg = B.loadConfig();
    if (cfg.overlay.enabled) Overlay.start({ session: true });
    const s = Session.start({
      cfg, update,
      notify: a => {
        win.webContents.send('activity', a);
        Overlay.setSession(a);
        if (a && a.location && cfg.notifyServer) { try { new Notification({ title: a.name || 'Roblox', body: T('srv', { l: a.location }) }).show(); } catch {} }
      },
      onFinish: () => { sessionActive = false; Overlay.endSession(); cfg.autoClose ? (quitting = true, app.quit()) : showWin(); },
    });
    if (s.background) { sessionActive = true; if (cfg.autoClose) setTimeout(hideToTray, 1500); }
    else if (cfg.autoClose) setTimeout(() => app.quit(), 2500);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
  finally { busy = false; }
});
ipcMain.handle('acc:add', () => Accounts.addAccount(win));
ipcMain.handle('acc:remove', (_, id) => Accounts.removeAccount(String(id)));
ipcMain.handle('lib:get', () => Object.values(B.loadLibrary()).filter(e => !e.hidden));
ipcMain.handle('lib:fav', (_, id, v) => B.libSet(id, { fav: !!v }));
ipcMain.handle('lib:remove', (_, id) => B.libSet(id, { hidden: true }));
ipcMain.handle('lib:add', async (_, q) => {
  const m = /(\d{4,})/.exec(String(q || ''));
  if (!m) return { error: 'bad' };
  const info = await placeInfo(m[1]).catch(() => null);
  if (!info || !info.name) return { error: 'nf' };
  B.libUpsert(m[1], info, {});
  return { ok: true };
});
ipcMain.handle('lib:set', (_, id, patch) => {
  const ok = {};
  if (patch && typeof patch === 'object') {
    if ('fav' in patch) ok.fav = !!patch.fav;
    if ('news' in patch) ok.news = patch.news === null ? undefined : !!patch.news;
    if ('folder' in patch) ok.folder = typeof patch.folder === 'string' ? patch.folder.slice(0, 40) : null;
  }
  return B.libSet(id, ok);
});
ipcMain.handle('discover:search', (_, f) => Discover.search(f && typeof f === 'object' ? f : {}));
ipcMain.handle('news:get', () => Discover.getFeed());
ipcMain.handle('news:check', async () => { try { await Discover.checkNews(); } catch {} return Discover.getFeed(); });
ipcMain.handle('news:seen', () => { Discover.markRead(); return true; });
ipcMain.handle('stats:get', () => ({ stats: B.loadStats(), names: Object.fromEntries(Object.values(B.loadLibrary()).map(p => [p.placeId, p.name])) }));
ipcMain.handle('friends:get', async () => {
  const cfg = B.loadConfig(), acc = cfg.accounts.find(a => a.id === cfg.activeAccount);
  if (!acc) return { error: 'noacc' };
  try { const r = await Accounts.friendsOverview(acc); B.addFriendSample(r.friends); return r; }
  catch (e) { return { error: e.message === 'expired' ? 'expired' : 'net' }; }
});
ipcMain.handle('studio:find', () => B.findStudio());
ipcMain.handle('studio:launch', async (_, withFile) => {
  let f = null;
  if (withFile) { f = await pickFile('Place', ['rbxl', 'rbxlx', 'rbxm', 'rbxmx']); if (!f) return false; }
  return B.launchStudio(f);
});
ipcMain.handle('studio:path', async () => {
  const p = await pickFile('Studio', ['exe']);
  return p && /RobloxStudioBeta\.exe$/i.test(p) ? B.saveConfig({ studioPath: p }) : B.loadConfig();
});
ipcMain.handle('studio:download', () => shell.openExternal('https://www.roblox.com/create'));
ipcMain.handle('integrity:run', async (_, mode) => {
  const cfg = B.loadConfig();
  if (!cfg.installed) return { error: 'noinst' };
  const dir = path.join(B.P.versions, cfg.installed), send = p => win.webContents.send('itg', p);
  try {
    send({ percent: 0, text: T('itg.run') });
    const r = await B.verifyIntegrity(dir, mode !== 'quick', send);
    if (r.noIndex) return { error: 'noindex' };
    let fixed = 0;
    if (mode === 'repair' && r.bad.length) { await B.repairIntegrity(dir, r.bad, send); fixed = r.bad.length; }
    return { checked: r.checked, bad: r.bad.length, fixed, files: r.bad.slice(0, 30).map(b => `${b.pkg}: ${b.rel} (${b.why})`) };
  } catch (e) { return { error: 'fail', message: e.message }; }
});
ipcMain.handle('overlay:preview', () => { Overlay.preview(8000); return true; });
ipcMain.handle('bgv:pick', async () => {
  const src = await pickFile('Video', ['mp4', 'webm']);
  if (src && fs.statSync(src).size <= 60 * 1048576) B.saveConfig({ ui: { bgVideo: putAsset('BgVideo', src) } });
  return B.loadConfig();
});
ipcMain.handle('bgv:clear', () => { dropAsset('BgVideo'); return B.saveConfig({ ui: { bgVideo: null } }); });
ipcMain.handle('bgv:get', () => {
  const f = assetPath(B.loadConfig().ui.bgVideo);
  return f && fs.existsSync(f) ? { type: f.endsWith('.webm') ? 'video/webm' : 'video/mp4', data: fs.readFileSync(f) } : null;
});
ipcMain.handle('servers:find', (_, q) => findServers(q));
ipcMain.handle('history:get', () => B.loadHistory());
ipcMain.handle('history:clear', () => { B.saveHistory([]); return true; });
ipcMain.handle('cache:clean', () => B.cleanCache());
ipcMain.handle('packs:list', () => B.listPacks());
ipcMain.handle('packs:open', () => { B.listPacks(); return shell.openPath(path.join(B.P.mods, 'Packs')); });
ipcMain.handle('packs:import', async () => { const z = await pickFile('Mod pack', ['zip']); try { if (z) B.importPack(z); } catch {} return true; });
ipcMain.handle('packs:delete', (_, n) => { B.deletePack(n); return true; });

ipcMain.handle('mods:open', () => { fs.mkdirSync(B.P.mods, { recursive: true }); return shell.openPath(B.P.mods); });
ipcMain.handle('reset', () => { B.reset(); return true; });
ipcMain.on('win', (_, a) => { if (a === 'min') win.minimize(); if (a === 'close') win.close(); });

// файловые слоты: шрифт, эмодзи, звук смерти, фон редактора аватара
const SLOT_EXTS = { font: ['ttf', 'otf'], emoji: ['ttf', 'otf'], deathSound: ['ogg'], avatarBg: ['rbxl'] };
ipcMain.handle('slot:pick', async (_, id) => {
  if (!SLOT_EXTS[id]) return B.loadConfig();
  const src = await pickFile(id, SLOT_EXTS[id]);
  if (!src) return B.loadConfig();
  const file = putAsset('Slot_' + id, src);
  return B.saveConfig({ slots: { ...B.loadConfig().slots, [id]: { name: path.basename(src), file } } });
});
ipcMain.handle('slot:clear', (_, id) => {
  if (!SLOT_EXTS[id]) return B.loadConfig();
  dropAsset('Slot_' + id);
  const slots = { ...B.loadConfig().slots }; delete slots[id];
  return B.saveConfig({ slots });
});

// иконка и фон
ipcMain.handle('icon:pick', async () => {
  const src = await pickFile('Icon', ['ico', 'png']);
  if (src) { const f = putAsset('Icon', src); B.saveConfig({ ui: { icon: f } }); const i = iconImage(); if (i) win.setIcon(i); }
  return { cfg: B.loadConfig(), icon: dataUrl(B.loadConfig().ui.icon, 32) };
});
ipcMain.handle('icon:clear', () => { dropAsset('Icon'); return { cfg: B.saveConfig({ ui: { icon: null } }), icon: null }; });
ipcMain.handle('icon:get', () => dataUrl(B.loadConfig().ui.icon, 32));
ipcMain.handle('bg:pick', async () => {
  const src = await pickFile('Image', ['png', 'jpg', 'jpeg', 'webp', 'gif']);
  if (src && fs.statSync(src).size <= 15 * 1048576) B.saveConfig({ ui: { bgImage: putAsset('Background', src) } });
  return { cfg: B.loadConfig(), img: dataUrl(B.loadConfig().ui.bgImage) };
});
ipcMain.handle('bg:clear', () => { dropAsset('Background'); return { cfg: B.saveConfig({ ui: { bgImage: null } }), img: null }; });
ipcMain.handle('bg:get', () => dataUrl(B.loadConfig().ui.bgImage));
ipcMain.handle('exe:pick', () => pickFile('Program', ['exe', 'bat', 'cmd', 'lnk']));
ipcMain.handle('css:apply', (_, css) => applyCss(String(css || '')));
ipcMain.on('win:look', (_, { opacity, material, bg }) => {
  try {
    win.setOpacity(Math.min(1, Math.max(.5, (+opacity || 100) / 100)));
    if (['mica', 'acrylic'].includes(material)) { win.setBackgroundColor('#00000000'); win.setBackgroundMaterial(material); }
    else { if (win.setBackgroundMaterial) win.setBackgroundMaterial('none'); win.setBackgroundColor(bg || '#0b0e19'); }
  } catch {}
});

// ярлыки
const LNK = {
  desktop: () => [path.join(app.getPath('desktop'), 'Lumen.lnk'), []],
  start: () => [path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Lumen.lnk'), []],
  play: () => [path.join(app.getPath('desktop'), 'Lumen (Play).lnk'), ['--play']],
  studio: () => [path.join(app.getPath('desktop'), 'Lumen (Studio).lnk'), ['--studio']],
};
ipcMain.handle('links:get', () => Object.fromEntries(Object.keys(LNK).map(k => [k, fs.existsSync(LNK[k]()[0])])));
ipcMain.handle('links:set', (_, id, on) => {
  if (!LNK[id]) return false;
  const [file, extra] = LNK[id]();
  if (!on) { fs.rmSync(file, { force: true }); return true; }
  const args = [...(process.defaultApp ? [`"${path.resolve(process.argv[1])}"`] : []), ...extra].join(' ');
  const ico = assetPath(B.loadConfig().ui.icon);
  return shell.writeShortcutLink(file, 'create', {
    target: process.execPath, args, cwd: path.dirname(process.execPath), description: 'Lumen',
    icon: ico && ico.endsWith('.ico') && fs.existsSync(ico) ? ico : process.execPath, iconIndex: 0,
  });
});
