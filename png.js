const zlib = require('zlib');
const TBL = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = b => { let c = 0xffffffff; for (const x of b) c = TBL[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function encode(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Стрелка курсора с обводкой (антиалиасинг через суперсэмплинг)
function cursorPng(kind) {
  const S = 64, [fill, line] = kind === 'inverted' ? [[0, 0, 0], [255, 255, 255]] : [[255, 255, 255], [0, 0, 0]];
  const poly = [[0, 0], [0, 16], [4, 12], [7, 19], [9, 18], [6, 11], [11, 11]].map(([x, y]) => [x * 2.6 + 4, y * 2.6 + 4]);
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const cov = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let n = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (inside(x + (sx + .5) / 4, y + (sy + .5) / 4)) n++;
    cov[y * S + x] = n / 16;
  }
  const out = Buffer.alloc(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = cov[y * S + x]; let m = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (dx * dx + dy * dy <= 5 && xx >= 0 && yy >= 0 && xx < S && yy < S) m = Math.max(m, cov[yy * S + xx]);
    }
    const a = c + m * (1 - c), o = (y * S + x) * 4;
    if (a <= 0) continue;
    for (let k = 0; k < 3; k++) out[o + k] = Math.round((fill[k] * c + line[k] * m * (1 - c)) / a);
    out[o + 3] = Math.round(a * 255);
  }
  return encode(S, S, out);
}

// Круглая иконка для трея
function dot(size, rgb) {
  const out = Buffer.alloc(size * size * 4), r = size / 2 - 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + .5 - size / 2, y + .5 - size / 2), a = Math.max(0, Math.min(1, r + .5 - d)), o = (y * size + x) * 4;
    out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = Math.round(a * 255);
  }
  return encode(size, size, out);
}
module.exports = { cursorPng, dot, encode };
