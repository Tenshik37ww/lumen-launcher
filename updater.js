// Автообновление лаунчера из GitHub Releases (electron-updater). Работает только в собранной версии.
const { app, ipcMain } = require('electron');
const B = require('./bootstrapper');

let au = null, getWin = () => null, state = { state: 'idle' };
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/[ \t]{2,}/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, 1500);
const notesOf = info => { const n = info && info.releaseNotes; return strip(Array.isArray(n) ? n.map(x => x.note).join('\n') : n); };
const errText = e => String((e && e.message) || e).split('\n')[0].slice(0, 200);

function set(s) {
  state = { ...s, current: app.getVersion() };
  const w = getWin();
  if (w && !w.isDestroyed()) w.webContents.send('update:status', state);
}
function check() {
  if (!au) return Promise.resolve();
  au.allowPrerelease = !!B.loadConfig().updatePrerelease;
  return au.checkForUpdates().catch(e => set({ state: 'error', message: errText(e) }));
}
function start(win) {
  getWin = win;
  if (!app.isPackaged) { set({ state: 'dev' }); return; }
  try { au = require('electron-updater').autoUpdater; } catch (e) { set({ state: 'error', message: errText(e) }); return; }
  au.autoDownload = false;
  au.autoInstallOnAppQuit = true;          // скачанное обновление ставится при закрытии лаунчера
  au.on('checking-for-update', () => set({ state: 'checking' }));
  au.on('update-available', info => {
    set({ state: 'available', version: info.version, notes: notesOf(info) });
    if (B.loadConfig().updateMode === 'auto') au.downloadUpdate().catch(e => set({ state: 'error', message: errText(e) }));
  });
  au.on('update-not-available', () => set({ state: 'none' }));
  au.on('download-progress', p => set({ state: 'downloading', percent: Math.round(p.percent), version: state.version, notes: state.notes }));
  au.on('update-downloaded', info => set({ state: 'ready', version: info.version, notes: state.notes || notesOf(info) }));
  au.on('error', e => set({ state: 'error', message: errText(e) }));
  const run = () => { if (B.loadConfig().autoUpdateCheck && !['downloading', 'ready'].includes(state.state)) check(); };
  setTimeout(run, 8000);
  setInterval(run, 4 * 3600 * 1000);
}

ipcMain.handle('update:get', () => ({ ...state, current: app.getVersion() }));
ipcMain.handle('update:check', () => { check(); return true; });
ipcMain.handle('update:download', () => {
  if (au && state.state === 'available') au.downloadUpdate().catch(e => set({ state: 'error', message: errText(e) }));
  return true;
});
ipcMain.handle('update:install', () => { if (au && state.state === 'ready') au.quitAndInstall(false, true); return true; });
module.exports = { start, check };
