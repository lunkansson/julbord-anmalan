// Falling snow on the page background. Off with ?snow=0 or when the visitor prefers reduced motion.
(() => {
  'use strict';
  const canvas = document.getElementById('snow');
  const params = new URLSearchParams(location.search);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (params.get('snow') === '0' || reduceMotion || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const flakes = [];
  const color = getComputedStyle(document.documentElement).getPropertyValue('--color-neutral-100').trim() || '#f3f5fe';
  let w = 0, h = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const nw = canvas.offsetWidth, nh = canvas.offsetHeight;
    if (nw === w && nh === h) return;
    w = nw; h = nh;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round((w * h) / 9000);
    flakes.length = 0;
    for (let i = 0; i < n; i++) {
      flakes.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.8 + 0.4, s: Math.random() * 0.5 + 0.2, d: Math.random() * Math.PI * 2 });
    }
  }

  function tick() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    for (const f of flakes) {
      f.y += f.s; f.d += 0.01; f.x += Math.sin(f.d) * 0.3;
      if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
      ctx.globalAlpha = 0.25 + f.r * 0.25;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(tick);
  }

  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  tick();
})();
