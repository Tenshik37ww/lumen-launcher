/* Режим Big Picture: полноэкранный интерфейс для геймпада и телевизора. */
let bpOn = false, bpTab = 'library', bpClock = null;
const bpTime = () => new Date().toLocaleTimeString(cfg.language, { hour: '2-digit', minute: '2-digit' });
function bpStatus(text) { const s = $('#bpstatus'); if (s && text) s.textContent = text; }
async function enterBP() {
  if (bpOn) return;
  bpOn = true; document.body.classList.add('bp-on'); $('#bp').hidden = false; api.fullscreen(true);
  bpTab = 'library'; await bpRender();
  bpClock = setInterval(() => { const c = $('#bpclock'); if (c) c.textContent = bpTime(); }, 10000);
}
function exitBP() {
  if (!bpOn) return;
  bpOn = false; clearInterval(bpClock); $('#bp').hidden = true; document.body.classList.remove('bp-on'); api.fullscreen(false);
}
function bpTile(cover, name, line, pid, act) {
  const b = E('button', 'bptile'), cv = E('div', 'cover'), meta = E('div', 'meta');
  if (safeImg(cover)) cv.style.backgroundImage = `url("${cover}")`; else cv.textContent = (name || '?').charAt(0).toUpperCase();
  meta.append(E('b', null, name), E('small', null, line || ''));
  b.append(cv, meta); if (pid) b.dataset.pid = pid;
  b.onclick = act;
  b.onmouseenter = () => b.focus();
  b.onfocus = () => { b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); const i = $('#bpinfo'); if (i) { i.replaceChildren(E('h2', null, name), E('span', 'psub', line || '')); } };
  return b;
}
async function bpRender() {
  const root = $('#bp'); root.replaceChildren();
  const top = E('div', 'bptop'), tabs = E('div', 'bptabs');
  for (const [id, l] of [['library', 'nav.library'], ['favorites', 'lib.f.fav'], ['news', 'nav.news'], ['friends', 'nav.friends']]) {
    const b = E('button', 'bptab' + (bpTab === id ? ' on' : ''), t(l)); b.onclick = () => { bpTab = id; bpRender(); }; tabs.append(b);
  }
  const clock = E('span', 'bpclock', bpTime()); clock.id = 'bpclock';
  const exit = E('button', 'bpbtn', t('bp.exit')); exit.onclick = exitBP;
  top.append(tabs, clock, exit);
  const row = E('div', 'bprow'), info = E('div', 'bpinfo'), st = E('div', 'bpstatus'), hints = E('div', 'bphints');
  info.id = 'bpinfo'; st.id = 'bpstatus';
  for (const [k, l] of [['A', 'bp.h.a'], ['X', 'bp.h.x'], ['Y', 'bp.h.y'], ['B', 'bp.h.b']]) { const h = E('span'); h.append(E('kbd', null, k), t(l)); hints.append(h); }
  root.append(top, row, info, st, hints);
  const launch = pid => { st.textContent = t('launching'); play(startUri(pid)); };
  const lib = await api.libGet();
  if (bpTab === 'library' || bpTab === 'favorites') {
    const list = lib.filter(p => bpTab === 'library' || p.fav).sort((a, b) => (b.last || 0) - (a.last || 0));
    list.forEach(p => row.append(bpTile(p.icon, p.name || p.placeId, p.totalMs ? fmtTime(p.totalMs) : t('lib.never'), p.placeId, () => launch(p.placeId))));
  } else if (bpTab === 'news') {
    (await api.newsGet()).items.forEach(i => row.append(bpTile(i.icon, i.name, t('n.upd', { d: fdate(i.at) }), i.placeId, () => launch(i.placeId))));
  } else {
    const r = await api.friends();
    if (r.error) row.append(E('div', 'bpempty', t('bp.noacc')));
    else r.friends.filter(f => f.type === 2 && isId(f.placeId)).forEach(f => row.append(bpTile(f.avatar, f.display, f.game || f.location, f.placeId,
      () => { st.textContent = t('launching'); play(startUri(f.placeId, /^[0-9a-f-]{36}$/i.test(f.gameId || '') ? f.gameId : null)); })));
  }
  if (!row.children.length && !row.querySelector('.bpempty')) row.append(E('div', 'bpempty', t('bp.empty')));
  const first = row.querySelector('.bptile'); if (first) first.focus();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && bpOn && $('#palette').hidden) exitBP(); });
