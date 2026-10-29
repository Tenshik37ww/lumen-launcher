// Фоновая сессия после запуска Roblox: интеграции, активность, Discord, история, приоритет, фоновое обновление
const { spawn } = require('child_process');
const B = require('./bootstrapper');
const { t } = require('./lang');
const { ActivityWatcher, placeInfo, locate } = require('./activity');
const Discord = require('./discord');

const splitArgs = s => ((s || '').match(/"[^"]*"|\S+/g) || []).map(a => a.replace(/^"|"$/g, ''));

function activityFor(s, cfg) {
  const L = cfg.language, buttons = [{ label: t(L, 'dc.page'), url: `https://www.roblox.com/games/${s.placeId}` }];
  if (cfg.discordAllowJoin) buttons.push({ label: t(L, 'dc.join'), url: `https://www.roblox.com/games/start?placeId=${s.placeId}&gameInstanceId=${s.jobId}` });
  return {
    details: s.name || 'Roblox', state: s.creator ? t(L, 'by', { c: s.creator }) : undefined,
    timestamps: { start: Math.floor(s.since / 1000) },
    assets: { large_image: s.icon, large_text: s.name }, buttons,
  };
}

function start({ cfg, update, notify, onFinish }) {
  const launchedAt = Date.now(), procs = [];
  const bg = update ? update().catch(() => {}) : null;

  for (const it of cfg.integrations || []) {
    if (!it.path) continue;
    try {
      const p = spawn(it.path, splitArgs(it.args), { detached: true, stdio: 'ignore' });
      p.on('error', () => {}); p.unref();
      procs.push({ p, it });
    } catch {}
  }

  let watcher = null, rpc = null;
  if (cfg.activityTracking) {
    if (cfg.discordRpc && cfg.discordAppId) { rpc = new Discord(cfg.discordAppId.trim()); rpc.connect(); }
    watcher = new ActivityWatcher(launchedAt, async (ev, s) => {
      if (ev === 'joined') {
        const info = await placeInfo(s.placeId).catch(() => ({}));
        const loc = cfg.queryLocation ? await locate(s.serverIp || s.ip).catch(() => null) : null;
        const st = { ...info, placeId: s.placeId, jobId: s.jobId, location: loc, ip: s.serverIp || s.ip, since: Date.now() };
        B.addHistory({ placeId: s.placeId, jobId: s.jobId, name: info.name, icon: info.icon, location: loc, start: st.since });
        B.libStart(s.placeId, info);
        notify(st);
        if (rpc) rpc.setActivity(activityFor(st, cfg));
      } else {
        B.endHistory();
        B.libStop();
        notify(null);
        if (rpc) rpc.setActivity(null);
        if (cfg.closeOnLeave) setTimeout(B.killRoblox, 1500);
      }
    });
    watcher.start();
  }

  const background = !!(watcher || bg || cfg.overlay.enabled || cfg.priority !== 'normal' || procs.some(x => x.it.autoClose));
  if (!background) return { background: false };

  let seen = false, ended = false, lastPrio = 0, lastTick = Date.now();
  const finish = async () => {
    if (ended) return; ended = true;
    clearInterval(mon);
    if (watcher) watcher.stop();
    if (rpc) rpc.close();
    B.endHistory();
    B.libStop();
    for (const x of procs) if (x.it.autoClose) { try { process.kill(x.p.pid); } catch {} }
    notify(null);
    await bg;
    onFinish();
  };
  const mon = setInterval(async () => {
    if (Date.now() - lastTick > 30000) { lastTick = Date.now(); B.libTick(); }   // сохраняем время каждые 30 с
    const run = await B.robloxRunning();
    if (run) {
      seen = true;
      if (cfg.priority !== 'normal' && Date.now() - lastPrio > 30000) { lastPrio = Date.now(); B.setPriority(cfg.priority); }
    }
    if ((seen && !run) || (!seen && Date.now() - launchedAt > 90000)) finish();
  }, 3000);
  return { background: true, stop: finish };
}
module.exports = { start };
