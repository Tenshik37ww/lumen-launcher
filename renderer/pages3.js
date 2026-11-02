/* Экранные фильтры и диагностика. Подключается после pages2.js и updates.js. */
const FX_KEYS = [['scan', 'fx.scan', 0], ['vignette', 'fx.vig', 0], ['grain', 'fx.grain', 0], ['warmth', 'fx.warm', -100], ['dim', 'fx.dim', 0], ['curve', 'fx.curve', 0]];
PAGES.fx = () => [
  { h: 'fx.g.main' }, { p: 'fx.note' },
  tog('fx.enabled', 'fx.on'),
  ...FX_KEYS.map(([k, l, min]) => rng('fx.' + k, l, min, 100, 5, { u: '%', set: v => { save({ fx: { [k]: v } }); api.fxPreview(); } })),
  { t: 'btns', l: 'fx.preview', b: [{ l: 'fx.preview.b', fn: () => api.fxPreview() }] },
  { h: 'fx.g.about' }, { p: 'fx.about' },
];
PAGES.diag = () => [{ h: 'dg.h' }, { p: 'dg.d' }, { t: 'node', make: diagBox }];

function diagBox() {
  const W = E('div'), row = E('div', 'row'), out = E('div'), run = E('button', 'btn primary', t('dg.run')), copy = E('button', 'btn', t('dg.copy'));
  copy.disabled = true; row.append(E('span'), ctl(run, copy)); W.append(row, out);
  let report = '';
  const yn = v => t(v ? 'dg.yes' : 'dg.no');
  run.onclick = async () => {
    run.disabled = true; out.replaceChildren(E('p', 'ghint', t('dg.running')));
    const r = await api.diag();
    run.disabled = false; copy.disabled = false;
    const L = r.local, lines = [`Lumen ${L.lumen} / Electron ${L.electron} / ${L.os}`];
    const net = grp(t('dg.net'));
    for (const c of r.checks) {
      const row2 = E('div', 'row'), st = E('span', 'tag ' + (c.reachable ? 'ok' : 'bad'), c.reachable ? `✓ HTTP ${c.status} · ${c.ms} ms` : `✗ ${c.error || 'нет ответа'}`);
      row2.append(E('span', null, t('dg.c.' + c.id)), ctl(st)); net.body.append(row2);
      lines.push(`${c.id}: ${c.reachable ? 'HTTP ' + c.status + ' ' + c.ms + 'ms' : 'FAIL ' + c.error}`);
    }
    const loc = grp(t('dg.local')), add = (k, v) => { const r2 = E('div', 'row'); r2.append(E('span', null, t(k)), ctl(E('span', 'fname', String(v)))); loc.body.append(r2); lines.push(`${k}: ${v}`); };
    add('dg.l.install', L.installDir || t('dg.none')); add('dg.l.system', L.systemRoblox || t('dg.none')); add('dg.l.running', yn(L.running));
    add('dg.l.logs', yn(L.logsDir)); add('dg.l.proto', `${yn(L.protocol)} / ${yn(L.protocolWeb)}`);
    add('dg.l.ver', r.latest && r.latest.version ? r.latest.version : t('dg.latestErr', { e: (r.latest && r.latest.error) || '?' }));
    add('dg.l.proxy', L.proxy || '—'); add('dg.l.acc', `${L.accounts} (${L.expired} ⚠)`);
    const adv = [], by = Object.fromEntries(r.checks.map(c => [c.id, c.reachable]));
    if (!by.cdn || !by.clientsettings) adv.push(t('dg.adv.cdn'));
    else if (!by.web || !by.games || !by.auth) adv.push(t('dg.adv.api'));
    if (!L.installDir && !L.systemRoblox) adv.push(t('dg.adv.noinst'));
    if (!L.protocol && !L.protocolWeb) adv.push(t('dg.adv.proto'));
    if (L.expired) adv.push(t('dg.adv.exp', { n: L.expired }));
    if (!adv.length) adv.push(t('dg.adv.ok'));
    const hint = grp(t('dg.adv'), ...adv.map(x => E('p', 'ghint', x)));
    lines.push('', ...adv); report = lines.join('\n');
    out.replaceChildren(net, loc, hint);
  };
  copy.onclick = () => { navigator.clipboard.writeText(report).catch(() => {}); copy.textContent = '✓'; setTimeout(() => { copy.textContent = t('dg.copy'); }, 1500); };
  return W;
}

// вкладка «Инструменты»: добавляем фильтры экрана и диагностику
const toolsPrev = PAGES.tools;
PAGES.tools = () => [{ t: 'node', raw: true, make: () => seg('tools', [
  ['studio', 'nav.studio', sub('studio')], ['integrity', 'nav.integrity', sub('integrity')], ['overlay', 'nav.overlay', sub('overlay')],
  ['fx', 'nav.fx', sub('fx')], ['diag', 'nav.diag', sub('diag')]]) }];
