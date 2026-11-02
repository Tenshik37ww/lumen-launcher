/* Геймпад: стрелки и левый стик двигают фокус, A выбирает, B возвращает, LB/RB переключают вкладки, Y открывает поиск,
   X показывает подробности (в Big Picture), Start запускает игру, Select включает Big Picture. */
(function () {
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const held = {}, prev = {};
  let timer = null;

  const rectOf = e => (e.matches && e.matches('.sw input') ? e.closest('.sw') : e).getBoundingClientRect();
  const visible = e => { const r = rectOf(e); return r.width > 0 && r.height > 0 && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden'; };
  function scope() {
    if (!$('#palette').hidden) return $('#palette');
    if (!$('#bp').hidden) return $('#bp');
    if (!$('#accmenu').hidden) return $('#accmenu');
    return document.body;
  }
  function focusables() {
    const root = scope();
    return [...root.querySelectorAll('button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])')]
      .filter(e => !e.disabled && !e.closest('.bgfx') && (root !== document.body || !e.closest('.view:not(.on)')) && visible(e));
  }
  function move(dir) {
    const list = focusables(), cur = document.activeElement && list.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { const f = list.find(e => e.closest('.view.on,.bp,.palette,.accmenu')) || list[0]; if (f) f.focus(); return; }
    const a = rectOf(cur), cx = a.left + a.width / 2, cy = a.top + a.height / 2, [dx, dy] = DIRS[dir];
    let best = null, bs = Infinity;
    for (const e of list) {
      if (e === cur) continue;
      const r = rectOf(e), vx = r.left + r.width / 2 - cx, vy = r.top + r.height / 2 - cy, along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const score = along + Math.abs(dx ? vy : vx) * 2.2;
      if (score < bs) { bs = score; best = e; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'center' }); }
  }
  function step(dir) {   // влево/вправо меняют значение у списков и ползунков
    const c = document.activeElement;
    if (c && (dir === 'left' || dir === 'right')) {
      const d = dir === 'left' ? -1 : 1;
      if (c.tagName === 'SELECT') { const n = Math.max(0, Math.min(c.options.length - 1, c.selectedIndex + d)); if (n !== c.selectedIndex) { c.selectedIndex = n; c.dispatchEvent(new Event('change')); } return; }
      if (c.type === 'range') { c.value = String(+c.value + d * (+c.step || 1)); c.dispatchEvent(new Event('input')); return; }
    }
    move(dir);
  }
  function press(name) {
    const c = document.activeElement;
    switch (name) {
      case 'a':
        if (c && c.tagName === 'SELECT') { c.selectedIndex = (c.selectedIndex + 1) % c.options.length; c.dispatchEvent(new Event('change')); }
        else if (c && c !== document.body) c.click();
        break;
      case 'b':
        if (!$('#palette').hidden) closePalette();
        else if (!$('#accmenu').hidden) $('#accmenu').hidden = true;
        else if (!$('#bp').hidden) exitBP();
        else if ($('#detail').classList.contains('on')) show(detailBack);
        else { const t0 = $('.tab.on'); if (t0) t0.focus(); }
        break;
      case 'x': if (!$('#bp').hidden && c && c.dataset && c.dataset.pid) { exitBP(); openGame(c.dataset.pid, 'library'); } break;
      case 'y': openPalette(); break;
      case 'lb': case 'rb': {
        if (!$('#bp').hidden) { const tabs = [...$$('.bptab')], i = tabs.findIndex(x => x.classList.contains('on')); if (tabs.length) tabs[(i + (name === 'rb' ? 1 : -1) + tabs.length) % tabs.length].click(); break; }
        const i = NAV.indexOf(current); show(NAV[(i + (name === 'rb' ? 1 : -1) + NAV.length) % NAV.length]); break;
      }
      case 'start': if (current === 'home' && $('#bp').hidden) $('#play').click(); break;
      case 'select': $('#bp').hidden ? enterBP() : exitBP(); break;
    }
  }
  const BTN = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 8: 'select', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  function poll() {
    if (cfg && cfg.gamepad === false) return;
    const now = performance.now();
    for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
      if (!gp) continue;
      const on = {};
      for (const [i, n] of Object.entries(BTN)) if (gp.buttons[i] && gp.buttons[i].pressed) on[n] = true;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (ax < -.55) on.left = true; if (ax > .55) on.right = true; if (ay < -.55) on.up = true; if (ay > .55) on.down = true;
      for (const n of Object.keys(BTN).map(k => BTN[k])) {
        if (!on[n]) { delete held[n]; prev[n] = false; continue; }
        document.body.classList.add('gamepad');
        const dir = DIRS[n], first = !prev[n];
        if (first) { held[n] = now + 380; prev[n] = true; dir ? step(n) : press(n); }
        else if (dir && now >= held[n]) { held[n] = now + 110; step(n); }
      }
    }
  }
  addEventListener('gamepadconnected', () => { if (!timer) timer = setInterval(poll, 16); });
  addEventListener('gamepaddisconnected', () => { if (!(navigator.getGamepads && [...navigator.getGamepads()].some(Boolean))) { clearInterval(timer); timer = null; document.body.classList.remove('gamepad'); } });
  addEventListener('mousemove', () => document.body.classList.remove('gamepad'));
  if (navigator.getGamepads && [...navigator.getGamepads()].some(Boolean) && !timer) timer = setInterval(poll, 16);
})();
