// The "Anmälda" page: everyone who has signed up, with a name search.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const list = $('list');
  const search = $('q');
  let names = [];

  function render() {
    const q = search.value.trim().toLocaleLowerCase('sv');
    const shown = q ? names.filter((n) => n.toLocaleLowerCase('sv').includes(q)) : names;
    list.replaceChildren(...shown.map((n) => Object.assign(document.createElement('li'), { textContent: n })));
    list.hidden = shown.length === 0;
    $('no-match').hidden = !(names.length && shown.length === 0);
  }

  search.addEventListener('input', render);

  fetch('/api/attendees', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(r)))
    .then((d) => {
      names = d.names;
      $('count').textContent = `· ${names.length}`;
      if (names.length) {
        $('status').hidden = true;
        $('tools').hidden = false;
      } else {
        $('status').textContent = 'Ingen har anmält sig än – bli först!';
      }
      render();
    })
    .catch(() => { $('status').textContent = 'Kunde inte hämta listan. Ladda om sidan och försök igen.'; });
})();
