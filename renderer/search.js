/* Поиск по лаунчеру (Ctrl+K или кнопка в заголовке): страницы, настройки, игры из библиотеки и действия. */
const SEARCH_SUBS = { settings: ['launcher', 'updates', 'mods', 'engine', 'integr', 'look', 'links'], tools: ['studio', 'integrity', 'overlay', 'fx', 'diag'],
  discover: ['games', 'servers'], people: ['friends', 'accounts'], stats: ['charts', 'history'] };
let pItems = [], pSel = 0, pGames = [];
const pOpen = () => !$('#palette').hidden;

function gotoSub(top, sid, label) {
  segState[top] = sid; show(top); build(top);
  if (!label) return;
  setTimeout(() => {
    const el_ = [...$('#' + top).querySelectorAll('.row,.sw,.col,.group>h3')].find(e => e.textContent.includes(label));
    if (el_) { el_.scrollIntoView({ block: 'center', behavior: 'smooth' }); el_.classList.add('flash'); setTimeout(() => el_.classList.remove('flash'), 2300); }
  }, 150);
}
function buildIndex() {
  const out = [], K = k => t('sr.k.' + k);
  for (const id of NAV) {
    if (id === 'home') { out.push({ kind: K('page'), title: t('nav.home'), go: () => show('home') }); continue; }
    out.push({ kind: K('page'), title: t('nav.' + id), sub: t('pg.' + id), go: () => show(id) });
  }
  for (const [top, subs] of Object.entries(SEARCH_SUBS)) for (const sid of subs) {
    out.push({ kind: K('page'), title: t('nav.' + top) + ' › ' + t(sid === 'games' ? 'sg.games' : sid === 'servers' ? 'sg.servers' : sid === 'charts' ? 'sg.charts' : sid === 'history' ? 'sg.history' : 'nav.' + sid), go: () => gotoSub(top, sid) });
    if (!PAGES[sid]) continue;
    let items = []; try { items = PAGES[sid](); } catch { continue; }
    let group = '';
    for (const it of items) {
      if (it.h) { group = t(it.h); continue; }
      if (!it.l || it.t === 'node') continue;
      const label = tx(it.l);
      out.push({ kind: K('setting'), title: label, sub: `${t('nav.' + top)} › ${t('nav.' + sid)}${group ? ' › ' + group : ''}`, extra: (it.l + '.d') in LANG.D.ru ? t(it.l + '.d') : '', go: () => gotoSub(top, sid, label) });
    }
  }
  const act = (title, fn) => out.push({ kind: K('action'), title, go: fn });
  act(t('play'), () => { show('home'); play(); });
  act(t('tl.launch'), () => api.studioLaunch(false));
  act(t('u.btn.check'), () => api.updateCheck());
  act(t('m.open'), () => api.openMods());
  act(t('l.bp'), () => enterBP());
  act(t('dg.run'), () => gotoSub('tools', 'diag'));
  for (const g of pGames) out.push({ kind: K('game'), title: g.name || g.placeId, sub: g.totalMs ? fmtTime(g.totalMs) : t('lib.never'), go: () => openGame(g.placeId), alt: () => { show('home'); play(startUri(g.placeId)); } });
  return out;
}
function rank(q) {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return pItems.filter(i => i.kind !== t('sr.k.setting')).slice(0, 12);
  const res = [];
  for (const it of pItems) {
    const title = it.title.toLowerCase(), all = `${title} ${(it.sub || '').toLowerCase()} ${(it.extra || '').toLowerCase()}`;
    let s = 0;
    for (const k of toks) { if (!all.includes(k)) { s = -1; break; } s += title.startsWith(k) ? 4 : title.split(/[\s›]+/).some(w => w.startsWith(k)) ? 3 : title.includes(k) ? 2 : 1; }
    if (s > 0) res.push([s, it]);
  }
  return res.sort((a, b) => b[0] - a[0]).slice(0, 14).map(x => x[1]);
}
let pShown = [];
function paintPalette() {
  const box = $('#pres'); box.replaceChildren();
  pShown = rank($('#pinput').value); pSel = Math.min(pSel, Math.max(0, pShown.length - 1));
  if (!pShown.length) { box.append(E('div', 'pempty', t('sr.none'))); return; }
  pShown.forEach((it, i) => {
    const b = E('button', 'pitem' + (i === pSel ? ' sel' : '')), tt = E('span', 'pt');
    tt.append(E('span', null, it.title)); if (it.sub) tt.append(E('small', null, it.sub));
    b.append(tt, E('span', 'pk', it.kind)); b.onclick = () => runItem(it, false);
    b.onmouseenter = () => { pSel = i; box.querySelectorAll('.pitem').forEach((x, j) => x.classList.toggle('sel', j === i)); };
    box.append(b);
  });
}
function runItem(it, alt) { closePalette(); (alt && it.alt ? it.alt : it.go)(); }
async function openPalette() {
  if (pOpen()) return;
  const p = $('#palette'); p.hidden = false; $('#pinput').placeholder = t('sr.ph'); $('#pinput').value = ''; pSel = 0;
  $('#pinput').focus();
  try { pGames = await api.libGet(); } catch { pGames = []; }
  pItems = buildIndex(); paintPalette();
}
function closePalette() { $('#palette').hidden = true; }
$('#btnSearch').onclick = openPalette;
$('#btnBP').onclick = () => enterBP();
$('#palette').onclick = e => { if (e.target.id === 'palette') closePalette(); };
$('#pinput').oninput = () => { pSel = 0; paintPalette(); };
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pOpen() ? closePalette() : openPalette(); return; }
  if (e.key === '/' && !pOpen() && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) { e.preventDefault(); openPalette(); return; }
  if (!pOpen()) return;
  if (e.key === 'Escape') { closePalette(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); pSel = (pSel + (e.key === 'ArrowDown' ? 1 : -1) + pShown.length) % Math.max(1, pShown.length);
    $$('#pres .pitem').forEach((x, j) => x.classList.toggle('sel', j === pSel));
    const s = $('#pres .pitem.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && pShown[pSel]) { e.preventDefault(); runItem(pShown[pSel], e.ctrlKey || e.metaKey); }
});
