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
      if (!res.ok) throw new Error(data.error || `Något gick fel (fel ${res.status}). Försök igen.`);
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
  const moreLink = $('att-more');

  function renderAttendees() {
    const list = $('att-list');
    const names = allNames.slice(0, SHOW_FIRST);
    list.replaceChildren(...names.map((n) => Object.assign(document.createElement('li'), { textContent: n })));
    $('att-count').textContent = allNames.length ? `· ${allNames.length}` : '';
    $('att-empty').hidden = allNames.length > 0;
    moreLink.hidden = allNames.length === 0;
    moreLink.textContent = allNames.length > SHOW_FIRST
      ? `Se alla ${allNames.length} som har anmält sig →`
      : 'Se alla som har anmält sig →';
    $('attendees').hidden = false;
  }

  function loadAttendees() {
    return fetch('/api/attendees', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => { allNames = d.names; renderAttendees(); })
      .catch(() => { /* list stays hidden */ });
  }

  loadAttendees();

  // Initial state: closed beats everything; otherwise show an earlier sign-up from this browser.
  fetch('/api/status')
    .then((r) => r.json())
    .then((s) => { if (s.closed) show('closed'); })
    .catch(() => { /* keep the form; the server will answer on submit */ });
  if (saved?.name) showDone(saved.name);
})();
