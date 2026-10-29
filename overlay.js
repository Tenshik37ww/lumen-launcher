// Оверлей: отдельное прозрачное окно поверх экрана. Никакого внедрения в Roblox.
// Показатели берутся из системы (CPU/RAM/процесс Roblox), ping до сервера из журнала, FPS через внешний PresentMon.
const { BrowserWindow, screen, globalShortcut, ipcMain } = require('electron');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const B = require('./bootstrapper');

let win = null, tmr = null, psProc = null, pmProc = null, hotkey = null;
let size = { w: 220, h: 80 }, shown = true, inSession = false, sess = null, previewUntil = 0;
let cpuPrev = null, rb = { cpu: 0, mem: 0, prev: null, t: 0 }, frames = [], ping = null, pingAt = 0;

function cpuPct() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) { for (const k in c.times) total += c.times[k]; idle += c.times.idle; }
  const r = cpuPrev ? (1 - (idle - cpuPrev.idle) / Math.max(1, total - cpuPrev.total)) * 100 : 0;
  cpuPrev = { idle, total };
  return Math.max(0, Math.min(100, r));
}

function startCollectors(c) {
  const script = "while($true){ $p=@(Get-Process RobloxPlayerBeta -ErrorAction SilentlyContinue); if($p.Count){ $c=($p|Measure-Object CPU -Sum).Sum; $m=($p|Measure-Object WorkingSet64 -Sum).Sum; [Console]::Out.WriteLine([string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0}|{1}',$c,$m)) } else { [Console]::Out.WriteLine('0|0') }; Start-Sleep -Milliseconds 1000 }";
  try {
    psProc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    psProc.on('error', () => {});
    let buf = '';
    psProc.stdout.on('data', d => {
      buf += d; const lines = buf.split(/\r?\n/); buf = lines.pop();
      for (const l of lines) {
        const [cs, mem] = l.split('|').map(Number), now = Date.now();
        if (!(mem > 0)) { rb = { cpu: 0, mem: 0, prev: null, t: now }; continue; }
        if (rb.prev != null && now > rb.t) rb.cpu = Math.max(0, (cs - rb.prev) / ((now - rb.t) / 1000) / os.cpus().length * 100);
        rb.prev = cs; rb.t = now; rb.mem = mem;
      }
    });
  } catch {}
  const o = c.overlay;
  if (o.presentMon && /\.exe$/i.test(o.presentMon) && fs.existsSync(o.presentMon) && o.metrics.includes('fps')) {
    try {
      const args = (o.pmArgs.match(/"[^"]*"|\S+/g) || []).map(a => a.replace(/^"|"$/g, ''));
      pmProc = spawn(o.presentMon, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
      pmProc.on('error', () => {});
      let buf = '', header = false;
      pmProc.stdout.on('data', d => {
        buf += d; const lines = buf.split(/\r?\n/); buf = lines.pop();
        for (const l of lines) { if (!l) continue; if (!header) { header = true; continue; } frames.push(Date.now()); }
      });
    } catch {}
  }
}

function place() {
  if (!win || win.isDestroyed()) return;
  const o = B.loadConfig().overlay, d = screen.getPrimaryDisplay().bounds;
  const x = o.corner.endsWith('l') ? d.x + o.x : d.x + d.width - size.w - o.x;
  const y = o.corner.startsWith('t') ? d.y + o.y : d.y + d.height - size.h - o.y;
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: size.w, height: size.h });
}

function tick() {
  if (!win || win.isDestroyed()) return;
  const c = B.loadConfig(), o = c.overlay, now = Date.now();
  while (frames.length && now - frames[0] > 1000) frames.shift();
  if (sess && sess.ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(sess.ip) && now - pingAt > 3000) {
    pingAt = now;
    execFile('ping', ['-n', '1', '-w', '1000', sess.ip], { windowsHide: true }, (e, out) => {
      const m = /(\d+)\s*\S{0,3}\s+TTL=/i.exec(String(out || '')); ping = m ? +m[1] : null;
    });
  } else if (!sess) ping = null;
  const data = {
    fps: frames.length, ping, cpu: cpuPct(), ram: (1 - os.freemem() / os.totalmem()) * 100, rcpu: rb.cpu, rmem: rb.mem / 1048576,
    game: sess && sess.name, loc: sess && sess.location, since: sess && sess.since,
  };
  win.webContents.send('overlay:data', {
    o: { corner: o.corner, scale: o.scale, opacity: o.opacity, bg: o.bg, text: o.text, accent: o.accent, layout: o.layout, labels: o.labels, metrics: o.metrics },
    data, preview: now < previewUntil, lang: c.language,
  });
  place();
}

function bindHotkey(acc) {
  try { if (hotkey) globalShortcut.unregister(hotkey); hotkey = null; } catch {}
  if (!acc) return;
  try {
    if (globalShortcut.register(acc, () => { if (!win) return; shown = !shown; shown ? win.showInactive() : win.hide(); })) hotkey = acc;
  } catch {}
}

function start(opts = {}) {
  if (opts.session) inSession = true;
  if (win) return;
  const c = B.loadConfig();
  win = new BrowserWindow({
    width: size.w, height: size.h, frame: false, transparent: true, resizable: false, focusable: false, skipTaskbar: true,
    hasShadow: false, alwaysOnTop: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'overlay-preload.js'), sandbox: true, contextIsolation: true },
  });
  win.setIgnoreMouseEvents(true);
  try { win.setAlwaysOnTop(true, 'screen-saver'); } catch {}
  win.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  win.webContents.on('did-finish-load', () => {
    if (c.overlay.css) win.webContents.insertCSS(String(c.overlay.css).slice(0, 20000)).catch(() => {});
    tick();
  });
  win.once('ready-to-show', () => { if (shown) win.showInactive(); place(); });
  win.on('closed', () => { win = null; });
  startCollectors(c);
  tmr = setInterval(tick, Math.max(300, (c.overlay.interval | 0) || 1000));
  bindHotkey(c.overlay.hotkey);
}

function stop() {
  clearInterval(tmr); tmr = null;
  for (const p of [psProc, pmProc]) { try { if (p) p.kill(); } catch {} }
  psProc = pmProc = null; frames = []; rb = { cpu: 0, mem: 0, prev: null, t: 0 }; ping = null;
  bindHotkey(null);
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}
function preview(ms = 8000) {
  previewUntil = Date.now() + ms; start();
  setTimeout(() => { if (!inSession && Date.now() >= previewUntil) stop(); }, ms + 200);
}
const setSession = a => { sess = a || null; };
function endSession() { inSession = false; sess = null; stop(); }

ipcMain.on('overlay:size', (e, s) => {
  if (!win || e.sender !== win.webContents || !s) return;
  const w = Math.min(900, s.w | 0), h = Math.min(700, s.h | 0);
  if (w > 0 && h > 0) { size = { w, h }; place(); }
});
module.exports = { start, stop, preview, setSession, endSession };
