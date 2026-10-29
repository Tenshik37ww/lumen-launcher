// Минимальный клиент Discord RPC через именованный канал (без зависимостей)
const net = require('net');
const crypto = require('crypto');
const frame = (op, obj) => {
  const d = Buffer.from(JSON.stringify(obj)), h = Buffer.alloc(8);
  h.writeInt32LE(op, 0); h.writeInt32LE(d.length, 4);
  return Buffer.concat([h, d]);
};
class Discord {
  constructor(id) { this.id = id; this.sock = null; this.ready = false; this.act = null; this.dead = false; this.buf = Buffer.alloc(0); }
  connect() {
    let i = 0;
    const retry = () => { if (!this.dead) this.timer = setTimeout(() => { i = 0; next(); }, 5000); };
    const next = () => {
      if (this.dead) return;
      if (i > 9) return retry();
      const s = net.connect(`\\\\?\\pipe\\discord-ipc-${i++}`);
      s.once('connect', () => { this.sock = s; this.buf = Buffer.alloc(0); s.write(frame(0, { v: 1, client_id: this.id })); });
      s.on('data', d => this.data(d));
      s.on('error', () => { if (!this.sock) next(); });
      s.on('close', () => { if (this.sock === s) { this.sock = null; this.ready = false; retry(); } });
    };
    next();
  }
  data(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0), len = this.buf.readInt32LE(4);
      if (this.buf.length < 8 + len) break;
      let msg = {}; try { msg = JSON.parse(this.buf.slice(8, 8 + len).toString()); } catch {}
      this.buf = this.buf.slice(8 + len);
      if (op === 3) this.sock?.write(frame(4, msg));
      if (msg.evt === 'READY') { this.ready = true; this.flush(); }
    }
  }
  flush() {
    this.sock?.write(frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: this.act || undefined }, nonce: crypto.randomUUID() }));
  }
  setActivity(a) { this.act = a; if (this.ready) this.flush(); }
  close() {
    this.dead = true; clearTimeout(this.timer);
    try { if (this.ready) { this.act = null; this.flush(); } } catch {}
    setTimeout(() => this.sock?.destroy(), 300);
  }
}
module.exports = Discord;
