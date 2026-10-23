(() => {
  'use strict';

  const STORAGE_KEY = 'julbord2026.signup';
  const $ = (id) => document.getElementById(id);

  const views = { closed: $('view-closed'), done: $('view-done'), form: $('view-form') };
  const nameInput = $('f-name');
  const errorBox = $('form-error');
  const submitBtn = $('submit');

  const store = {
    get() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; } },
    set(v) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  let saved = store.get(); // { id, name } of this browser's sign-up

  function show(which) {
    for (const [k, el] of Object.entries(views)) el.hidden = k !== which;
  }

  function showDone(name) {
    $('done-first').textContent = name.trim().split(/\s+/)[0];
    $('done-name').textContent = name;
    show('done');
  }

  function setError(msg) {
    errorBox.textContent = msg || '';
    errorBox.hidden = !msg;
  }

  nameInput.addEventListener('input', () => setError(''));

  $('edit').addEventListener('click', () => {
    if (saved) nameInput.value = saved.name;
    show('form');
    nameInput.focus();
  });

  views.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim().replace(/\s+/g, ' ');
    if (!name) { setError('Fyll i ditt namn.'); nameInput.focus(); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Skickar…';
    try {
      const res = await fetch('/api/signups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, id: saved?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403 && data.closed) { show('closed'); return; }
      if (!res.ok) throw new Error(data.error || 'Något gick fel. Försök igen.');
      saved = { id: data.id, name: data.name };
      store.set(saved);
      showDone(saved.name);
      loadAttendees();
    } catch (err) {
      setError(err instanceof TypeError ? 'Kunde inte nå servern. Kontrollera din uppkoppling och försök igen.' : err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Skicka anmälan';
    }
  });

  // Public list of who has signed up.
  const SHOW_FIRST = window.matchMedia('(max-width: 600px)').matches ? 8 : 16;
  let allNames = [];
  let showAll = false;
  const moreBtn = $('att-more');

  function renderAttendees() {
    const list = $('att-list');
    const names = showAll ? allNames : allNames.slice(0, SHOW_FIRST);
    list.replaceChildren(...names.map((n) => Object.assign(document.createElement('li'), { textContent: n })));
    $('att-count').textContent = allNames.length ? `· ${allNames.length}` : '';
    $('att-empty').hidden = allNames.length > 0;
    moreBtn.hidden = allNames.length <= SHOW_FIRST;
    moreBtn.textContent = showAll ? 'Visa färre' : `Visa alla ${allNames.length}`;
    $('attendees').hidden = false;
  }

  function loadAttendees() {
    return fetch('/api/attendees', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { allNames = d.names; renderAttendees(); })
      .catch(() => { /* list stays hidden */ });
  }

  moreBtn.addEventListener('click', () => { showAll = !showAll; renderAttendees(); });
  loadAttendees();

  // Initial state: closed beats everything; otherwise show an earlier sign-up from this browser.
  fetch('/api/status')
    .then((r) => r.json())
    .then((s) => { if (s.closed) show('closed'); })
    .catch(() => { /* keep the form; the server will answer on submit */ });
  if (saved?.name) showDone(saved.name);

  // Snowfall
  const canvas = $('snow');
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
