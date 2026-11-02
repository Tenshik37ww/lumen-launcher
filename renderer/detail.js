/* Подробности об игре: описание, статистика, скриншоты и достижения (значки) с отметкой полученных. */
let detailBack = 'library';
const numFmt = n => (n == null ? '—' : Number(n).toLocaleString(cfg.language));
const numC = n => (n == null ? '—' : new Intl.NumberFormat(cfg.language, { notation: 'compact', maximumFractionDigits: 1 }).format(n));
async function openGame(placeId, back) {
  if (!isId(placeId)) return;
  detailBack = back || (current !== 'detail' ? current : detailBack);
  const box = $('#detail');
  const backBtn = () => { const b = E('button', 'btn dback', '← ' + t('dt.back')); b.onclick = () => show(detailBack); return b; };
  box.replaceChildren(backBtn(), E('p', 'hint', t('dt.loading')));
  show('detail'); box.scrollTop = 0;
  const [d, libList] = await Promise.all([api.details(String(placeId)), api.libGet()]);
  if (!d || d.error) { box.replaceChildren(backBtn(), E('p', 'hint', t('dt.err'))); return; }
  const mine = libList.find(p => p.placeId === d.placeId);

  const hero = E('div', 'dhero'), cover = thumb(E('div', 'dcover'), d.icon), info = E('div'), btns = E('div', 'btns');
  if (!safeImg(d.icon)) cover.textContent = (d.name || '?').charAt(0).toUpperCase();
  const pl = E('button', 'btn primary', t('play')), sv = E('button', 'btn', t('lib.servers')), fv = E('button', 'btn', t(mine && mine.fav ? 'dt.fav.in' : 'dt.fav.add'));
  pl.onclick = () => { show('home'); play(startUri(d.placeId)); };
  sv.onclick = () => jumpServers(d.placeId);
  fv.onclick = async () => { await api.libAdd(d.placeId); await api.libSet(d.placeId, { fav: true }); fv.textContent = t('dt.fav.in'); fv.disabled = true; };
  btns.append(pl, sv, fv);
  const sub1 = [d.creator && t('dt.by', { c: d.creator.name + (d.creator.verified ? ' ✔' : '') }), [d.genre, d.genre2].filter(Boolean).join(' / ')].filter(Boolean).join('  ·  ');
  info.append(E('h1', null, d.name), E('p', 'psub', sub1), btns);
  hero.append(cover, info);

  const tile = (label, v, extra) => { const x = E('div', 'tile'); x.append(E('b', null, v), E('small', null, label + (extra ? '  ·  ' + extra : ''))); return x; };
  const tiles = E('div', 'tiles');
  tiles.append(tile(t('dt.playing'), numC(d.playing)), tile(t('dt.visits'), numC(d.visits)), tile(t('dt.fav'), numC(d.favorites)),
    tile(t('dt.rating'), d.rating != null ? d.rating + '%' : '—', d.up != null ? `▲${numC(d.up)} ▼${numC(d.down)}` : ''),
    tile(t('dt.max'), numFmt(d.max)), tile(t('dt.created'), fdate(d.created) || '—'), tile(t('dt.updated'), fdate(d.updated) || '—'));

  const stats = E('div', 'tiles');
  if (mine && (mine.totalMs || mine.sessions)) stats.append(tile(t('dt.time'), fmtTime(mine.totalMs)), tile(t('dt.sessions'), numFmt(mine.sessions || 0)), tile(t('dt.last'), mine.last ? fdate(new Date(mine.last).toISOString()) : '—'));
  const myG = grp(t('dt.mine')); mine && (mine.totalMs || mine.sessions) ? myG.body.append(stats) : myG.body.append(E('p', 'ghint', t('dt.never')));

  box.replaceChildren(backBtn(), hero, tiles, myG);
  if (d.description) { const g = grp(t('dt.desc')), p = E('div', 'ddesc'); p.textContent = d.description; g.body.append(p); box.append(g); }
  if (d.shots && d.shots.length) { const g = grp(t('dt.shots')), s = E('div', 'dshots'); d.shots.forEach(u => { const x = E('div'); thumb(x, u); s.append(x); }); g.body.append(s); box.append(g); }

  // достижения
  const bg = grp(t('dt.badges')); box.append(bg);
  bg.body.append(E('p', 'ghint', t('dt.loading')));
  const r = await api.badges(String(d.universeId));
  if (!r || r.error || !r.badges.length) { bg.body.replaceChildren(E('p', 'ghint', r && r.badges && !r.badges.length ? t('dt.badges.none') : t('dt.err'))); return; }
  const head = E('div', 'row'), flt = E('select'), prog = E('div', 'bprog'), list = E('div');
  for (const [v, k] of [['all', 'dt.f.all'], ['earned', 'dt.f.earned'], ['locked', 'dt.f.locked']]) { const o = E('option', null, t(k)); o.value = v; flt.append(o); }
  const sum = r.noAccount ? t('dt.badges.noacc') : t('dt.badges.sum', { a: r.earned, b: r.total });
  head.append(E('span', null, sum), ctl(flt));
  const fill = E('i'); fill.style.width = (r.total ? r.earned / r.total * 100 : 0) + '%'; prog.append(fill);
  bg.body.replaceChildren(head); if (!r.noAccount) bg.body.append(prog); bg.body.append(list);
  const draw = () => {
    list.replaceChildren();
    for (const b of r.badges.filter(x => flt.value === 'all' || (flt.value === 'earned') === x.earned)) {
      const row = E('div', 'badge' + (b.earned || r.noAccount ? '' : ' locked')), img = E('img'), info2 = E('div', 'grow');
      img.src = avatarOf(b.name, b.icon);
      info2.append(E('b', null, b.name), E('small', null, b.description));
      row.append(img, info2);
      const side = E('div'); side.style.textAlign = 'right';
      if (b.rate != null) side.append(E('small', null, t('dt.rate', { r: b.rate })));
      if (b.earned && b.date) side.append(E('span', 'tag ok', t('dt.got', { d: fdate(b.date) })));
      row.append(side); list.append(row);
    }
  };
  flt.onchange = draw; draw();
}
