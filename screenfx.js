// Экранные фильтры: прозрачное окно поверх экрана, пропускающее клики. Это отдельное окно, в процесс Roblox ничего не внедряется.
// Доступно: ЭЛТ-линии, виньетка, зерно, тёплый/холодный тон, затемнение, скруглённые края. Насыщенность и резкость так не изменить.
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const B = require('./bootstrapper');

let win = null, tmr = null, until = 0, inSession = false;
function push() { if (win && !win.isDestroyed()) win.webContents.send('fx:cfg', B.loadConfig().fx); }
function start(opts = {}) {
  if (opts.session) inSession = true;
  if (win) return;
  const d = screen.getPrimaryDisplay().bounds;
  win = new BrowserWindow({
    x: d.x, y: d.y, width: d.width, height: d.height, frame: false, transparent: true, resizable: false, movable: false, focusable: false,
    skipTaskbar: true, hasShadow: false, alwaysOnTop: true, show: false, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'screenfx-preload.js'), sandbox: true, contextIsolation: true },
  });
  win.setIgnoreMouseEvents(true);
  try { win.setAlwaysOnTop(true, 'screen-saver'); } catch {}
  win.loadFile(path.join(__dirname, 'renderer', 'fx.html'));
  win.webContents.on('did-finish-load', push);
  win.once('ready-to-show', () => win && win.showInactive());
  win.on('closed', () => { win = null; });
  tmr = setInterval(push, 800);
}
function stop() { clearInterval(tmr); tmr = null; if (win && !win.isDestroyed()) win.destroy(); win = null; }
function preview(ms = 8000) { until = Date.now() + ms; start(); setTimeout(() => { if (!inSession && Date.now() >= until) stop(); }, ms + 200); }
function endSession() { inSession = false; stop(); }
module.exports = { start, stop, preview, endSession };
