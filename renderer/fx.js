const $ = id => document.getElementById(id), clamp = (v, a, b) => Math.min(b, Math.max(a, +v || 0));
const g = $('grain'), gx = g.getContext('2d'), img = gx.createImageData(256, 256);
let grainTimer = null;
function noise() { const d = img.data; for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } gx.putImageData(img, 0, 0); }
fx.onCfg(c => {
  const scan = clamp(c.scan, 0, 100) / 100 * .5, vig = clamp(c.vignette, 0, 100) / 100 * .85, warm = clamp(c.warmth, -100, 100) / 100, dim = clamp(c.dim, 0, 100) / 100 * .6, curve = clamp(c.curve, 0, 100) / 100 * 120;
  $('scan').style.background = scan ? `repeating-linear-gradient(0deg, rgba(0,0,0,${scan}) 0px, rgba(0,0,0,${scan}) 1px, transparent 1px, transparent 3px)` : 'none';
  $('vig').style.background = vig ? `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${vig}) 100%)` : 'none';
  $('warm').style.background = warm ? (warm > 0 ? `rgba(255,140,40,${warm * .25})` : `rgba(60,120,255,${-warm * .25})`) : 'none';
  $('dim').style.background = dim ? `rgba(0,0,0,${dim})` : 'none';
  $('curve').style.boxShadow = curve ? `inset 0 0 ${curve * 2}px ${curve}px rgba(0,0,0,.92)` : 'none';
  $('curve').style.borderRadius = curve + 'px';
  const gr = clamp(c.grain, 0, 100) / 100 * .22;
  g.style.opacity = gr;
  if (gr && !grainTimer) { noise(); grainTimer = setInterval(noise, 120); }
  if (!gr && grainTimer) { clearInterval(grainTimer); grainTimer = null; }
});
