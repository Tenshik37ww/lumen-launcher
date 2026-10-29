// Рисует иконку приложения (build/icon.png и build/icon.ico с PNG внутри). Запуск: npm run icon
const fs = require('fs'), path = require('path');
const { encode } = require('../png');
const S = 256, out = Buffer.alloc(S * S * 4);
const inTri = (x, y, a, b, c) => { const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]); const P = [x, y], d1 = s(P, a, b), d2 = s(P, b, c), d3 = s(P, c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
const amber = [255, 178, 62], bg = [11, 14, 25];
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  let a = 0, col = bg, n = 0, ring = 0, tri = 0;
  for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
    const px = x + (sx + .5) / 3, py = y + (sy + .5) / 3, dx = Math.abs(px - 128) - (128 - 44), dy = Math.abs(py - 128) - (128 - 44);
    const sd = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - 44;   // скруглённый квадрат
    if (sd <= 0) n++;
    const d = Math.hypot(px - 128, py - 128); if (d >= 78 && d <= 96) ring++;
    if (inTri(px, py, [110, 92], [110, 164], [172, 128])) tri++;
  }
  a = n / 9;
  const k = Math.min(1, (ring + tri) / 9);
  col = bg.map((v, i) => Math.round(v * (1 - k) + amber[i] * k));
  const o = (y * S + x) * 4; out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = Math.round(a * 255);
}
const png = encode(S, S, out), dir = path.join(__dirname, '..', 'build');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon.png'), png);
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head[6] = 0; head[7] = 0; head[8] = 0; head[9] = 0; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([head, png]));
console.log('icon written', png.length, 'bytes');
