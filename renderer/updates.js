/* Обновления лаунчера: плашка на всех вкладках и раздел на вкладке «Лаунчер». Подключается после pages2.js. */
let updState = { state: 'idle' }, updBox = null;
const updText = s => {
  switch (s.state) {
    case 'checking': return t('u.s.checking');
    case 'available': return t('u.s.avail', { v: s.version });
    case 'none': return t('u.s.none');
    case 'downloading': return t('u.s.dl', { p: s.percent || 0 });
    case 'ready': return t('u.s.ready', { v: s.version });
    case 'error': return t('u.s.err', { e: s.message || '' });
    case 'dev': return t('u.s.dev');
    default: return t('u.s.idle');
  }
};
function paintUpdate() {
  const bar = $('#updbar'), s = updState, shown = ['available', 'downloading', 'ready'].includes(s.state);
  bar.hidden = !shown;
  if (shown) {
    $('#updtxt').textContent = s.state === 'ready' ? t('u.s.ready', { v: s.version }) : s.state === 'downloading' ? t('u.s.dl', { p: s.percent || 0 }) : t('u.banner', { v: s.version });
    const b = $('#updbtn');
    b.hidden = s.state === 'downloading';
    b.textContent = t(s.state === 'ready' ? 'u.btn.install' : 'u.btn.dl');
    b.onclick = () => (s.state === 'ready' ? api.updateInstall() : api.updateDownload());
  }
  if (updBox) updBox.paint();
}
function updateBox() {
  const W = E('div'), st = E('p', 'hint pre'), notes = E('p', 'hint pre'), row = E('div', 'row'), c = ctl();
  const chk = E('button', 'btn', t('u.btn.check')), dl = E('button', 'btn primary', t('u.btn.dl')), ins = E('button', 'btn primary', t('u.btn.install'));
  chk.onclick = () => api.updateCheck(); dl.onclick = () => api.updateDownload(); ins.onclick = () => api.updateInstall();
  c.append(chk, dl, ins);
  const ver = E('span'); row.append(ver, c); W.append(row, st, notes);
  updBox = { paint() {
    const s = updState;
    ver.textContent = t('u.cur', { v: s.current || '' });
    st.textContent = updText(s);
    notes.textContent = s.notes ? t('u.notes') + '\n' + s.notes : '';
    chk.disabled = ['checking', 'downloading', 'dev'].includes(s.state);
    dl.hidden = s.state !== 'available'; ins.hidden = s.state !== 'ready';
  } };
  updBox.paint();
  return W;
}
const launcherPageBase = PAGES.launcher;
PAGES.launcher = () => [
  { h: 'u.h' }, { t: 'node', make: updateBox },
  tog('autoUpdateCheck', 'u.check'),
  sel_('updateMode', 'u.mode', [['notify', 'u.mode.notify'], ['auto', 'u.mode.auto']]),
  tog('updatePrerelease', 'u.pre'),
  ...launcherPageBase(),
];
api.onUpdate(s => { updState = s; paintUpdate(); });
api.updateGet().then(s => { updState = s; paintUpdate(); });
