// Сетевые запросы основного процесса. В Electron идут через сетевой стек Chromium: он учитывает системный прокси,
// PAC-скрипты и настройку прокси в Lumen (обычный fetch Node.js их игнорирует). Вне Electron (тесты) используется fetch.
let net = null;
try { const e = require('electron'); if (e && e.net && typeof e.net.fetch === 'function') net = e.net; } catch {}
const xfetch = (url, opts) => (net ? net.fetch(url, opts) : fetch(url, opts));
module.exports = { xfetch };
