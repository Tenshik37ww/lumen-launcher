// Диагностика: что доступно из Lumen и что он видит на этом компьютере.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const B = require('./bootstrapper');
const { xfetch } = require('./http');

async function probe(id, url) {
  const t0 = Date.now();
  try { const r = await xfetch(url, { signal: AbortSignal.timeout(8000) }); return { id, url, reachable: true, status: r.status, ms: Date.now() - t0 }; }
  catch (e) { return { id, url, reachable: false, error: String((e && e.message) || e).slice(0, 120), ms: Date.now() - t0 }; }
}
async function run() {
  const c = B.loadConfig();
  const checks = await Promise.all([
    probe('clientsettings', 'https://clientsettingscdn.roblox.com/v2/client-version/WindowsPlayer'),
    probe('cdn', 'https://setup.rbxcdn.com/version'),
    probe('web', 'https://www.roblox.com/robots.txt'),
    probe('auth', 'https://auth.roblox.com/v2/logout'),
    probe('games', 'https://games.roblox.com/v1/games?universeIds=1'),
    probe('thumbs', 'https://thumbnails.roblox.com/v1/games/icons?universeIds=1&size=50x50&format=Png'),
    probe('ipinfo', 'https://ipinfo.io/1.1.1.1/json'),
  ]);
  let latest;
  try { latest = await B.getLatest(c.channel); } catch (e) { latest = { error: String((e && e.message) || e).slice(0, 160) }; }
  const logs = path.join(process.env.LOCALAPPDATA || os.homedir(), 'Roblox', 'logs');
  return {
    checks, latest,
    local: {
      installDir: B.installDir(c), systemRoblox: B.findSystemRoblox(), running: await B.robloxRunning(), logsDir: fs.existsSync(logs),
      protocol: app.isDefaultProtocolClient('roblox-player'), protocolWeb: app.isDefaultProtocolClient('roblox'),
      lumen: app.getVersion(), electron: process.versions.electron, os: `${os.platform()} ${os.release()}`,
      proxy: c.proxy || '', channel: c.channel, useSystem: c.useSystemRoblox, accounts: c.accounts.length, expired: c.accounts.filter(a => a.expired).length,
    },
  };
}
module.exports = { run };
