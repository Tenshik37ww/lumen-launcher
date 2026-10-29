// Отслеживание активности по журналу Roblox (шаблоны строк могут измениться с обновлениями Roblox)
const fs = require('fs');
const os = require('os');
const path = require('path');
const LOGS = path.join(process.env.LOCALAPPDATA || os.homedir(), 'Roblox', 'logs');
const RX = {
  joining: /! Joining game '([0-9a-f-]{36})' place (\d+) at ([\d.]+)/i,
  udmux: /UDMUX Address = ([\d.]+), Port = \d+ \| RCC Server Address = ([\d.]+), Port = \d+/,
  joined: /\[FLog::Network\] serverId: ([\d.]+)\|\d+/,
};
const DISCONNECT = '[FLog::Network] Time to disconnect replication data:';
const TELEPORT = '[FLog::SingleSurfaceApp] initiateTeleport';

class ActivityWatcher {
  constructor(since, cb) { this.since = since; this.cb = cb; this.file = null; this.off = 0; this.buf = ''; this.s = null; this.tp = false; }
  start() { this.timer = setInterval(() => this.poll(), 1000); }
  stop() { clearInterval(this.timer); }
  poll() {
    try {
      if (!this.file) {
        const list = fs.readdirSync(LOGS).filter(n => n.endsWith('.log') && n.includes('Player'))
          .map(n => ({ n, m: fs.statSync(path.join(LOGS, n)).mtimeMs })).filter(x => x.m >= this.since - 5000).sort((a, b) => b.m - a.m);
        if (!list.length) return;
        this.file = path.join(LOGS, list[0].n); this.off = 0;
      }
      const size = fs.statSync(this.file).size;
      if (size <= this.off) return;
      const fd = fs.openSync(this.file, 'r'), buf = Buffer.alloc(size - this.off);
      fs.readSync(fd, buf, 0, buf.length, this.off); fs.closeSync(fd);
      this.off = size;
      const lines = (this.buf + buf.toString('utf8')).split('\n');
      this.buf = lines.pop();
      lines.forEach(l => this.line(l));
    } catch {}
  }
  line(l) {
    let m;
    if ((m = RX.joining.exec(l))) { this.s = { jobId: m[1], placeId: m[2], ip: m[3], serverIp: null, joined: false }; this.tp = false; }
    else if (this.s && (m = RX.udmux.exec(l))) this.s.serverIp = m[2];
    else if (this.s && RX.joined.test(l)) { if (!this.s.joined) { this.s.joined = true; this.cb('joined', this.s); } }
    else if (l.includes(TELEPORT)) this.tp = true;
    else if (l.includes(DISCONNECT)) { if (!this.tp && this.s) { const s = this.s; this.s = null; this.cb('leave', s); } }
  }
}

const j = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(r.status); return r.json(); };
async function placeInfo(placeId) {
  const { universeId } = await j(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
  const [g, i] = await Promise.all([
    j(`https://games.roblox.com/v1/games?universeIds=${universeId}`),
    j(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`).catch(() => null),
  ]);
  const d = (g.data || [])[0] || {};
  return { name: d.name, creator: d.creator && d.creator.name, icon: i && i.data && i.data[0] && i.data[0].imageUrl, universeId };
}
const cache = new Map();
async function locate(ip) {
  if (!ip) return null;
  if (!cache.has(ip)) { const d = await j(`https://ipinfo.io/${ip}/json`); cache.set(ip, [d.city, d.region, d.country].filter(Boolean).join(', ')); }
  return cache.get(ip);
}

// Подбор сервера: публичный список серверов игры, сортировка по пингу (его считает Roblox)
async function findServers(q) {
  const m = /(\d{4,})/.exec(String(q || ''));
  if (!m) return { error: 'bad' };
  const placeId = m[1];
  let r;
  try { r = await fetch(`https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&excludeFullGames=true&limit=100`, { signal: AbortSignal.timeout(10000) }); }
  catch { return { error: 'net' }; }
  if (r.status === 429) return { error: 'rate' };
  if (!r.ok) return { error: 'net' };
  const d = await r.json();
  const list = (d.data || []).filter(s => /^[0-9a-f-]{36}$/i.test(s.id))
    .map(s => ({ id: s.id, playing: s.playing, max: s.maxPlayers, ping: Number.isFinite(s.ping) ? s.ping : null, fps: s.fps }));
  list.sort((a, b) => (a.ping ?? 1e9) - (b.ping ?? 1e9) || (b.fps || 0) - (a.fps || 0));
  const info = await placeInfo(placeId).catch(() => ({}));
  return { placeId, name: info.name, servers: list.slice(0, 15) };
}
module.exports = { ActivityWatcher, placeInfo, locate, findServers };
