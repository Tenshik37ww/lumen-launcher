const KNOWN = ['fps', 'ping', 'cpu', 'ram', 'rcpu', 'rmem', 'clock', 'timer', 'game', 'loc'];
const SAMPLE = { fps: 144, ping: 32, cpu: 23, ram: 58, rcpu: 11, rmem: 1450, game: 'Sample Game', loc: 'Frankfurt, DE' };
const hex = (c, d) => (/^#[0-9a-f]{6}$/i.test(c) ? c : d);
const pct = v => (v == null ? '—' : Math.round(v) + '%');
function value(m, d, lang, pv) {
  const v = k => (d[k] != null && d[k] !== 0 ? d[k] : pv ? SAMPLE[k] : null);
  switch (m) {
    case 'fps': return v('fps') ? String(Math.round(v('fps'))) : '—';
    case 'ping': return v('ping') != null ? v('ping') + ' ms' : '—';
    case 'cpu': return pct(d.cpu); case 'ram': return pct(d.ram); case 'rcpu': return pct(d.rcpu);
    case 'rmem': return v('rmem') ? Math.round(v('rmem')) + ' MB' : '—';
    case 'clock': return new Date().toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    case 'timer': { if (!d.since) return '—'; const s = Math.max(0, Math.floor((Date.now() - d.since) / 1000)); return [s / 3600, (s / 60) % 60, s % 60].map(x => String(Math.floor(x)).padStart(2, '0')).join(':'); }
    case 'game': return String(d.game || (pv ? SAMPLE.game : '—')).slice(0, 26);
    case 'loc': return String(d.loc || (pv ? SAMPLE.loc : '—')).slice(0, 26);
  }
  return '—';
}
ov.onData(({ o, data, preview, lang }) => {
  const box = document.getElementById('box'); box.replaceChildren();
  const bg = hex(o.bg, '#0b0e19'), n = parseInt(bg.slice(1), 16);
  box.style.background = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.min(1, Math.max(0, o.opacity / 100))})`;
  box.style.color = hex(o.text, '#e9edff');
  box.style.fontSize = 13 * Math.min(3, Math.max(.5, o.scale / 100)) + 'px';
  box.style.flexDirection = o.layout === 'row' ? 'row' : 'column';
  for (const m of o.metrics.filter(x => KNOWN.includes(x))) {
    const row = document.createElement('div'); row.className = 'm';
    const label = LANG.t(lang, 'ov.s.' + m);
    if (o.labels && label && label !== 'ov.s.' + m) { const l = document.createElement('span'); l.className = 'l'; l.textContent = label; row.append(l); }
    const val = document.createElement('span'); val.textContent = value(m, data, lang, preview); val.style.color = hex(o.accent, '#ffb23e');
    row.append(val); box.append(row);
  }
  requestAnimationFrame(() => ov.size(box.offsetWidth + 2, box.offsetHeight + 2));
});
