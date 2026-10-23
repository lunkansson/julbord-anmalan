// Request handlers in the web-standard Request → Response shape.
// Vercel runs them as functions (api/*.js); server.js runs the same ones locally.
import crypto from 'node:crypto';
import { DEADLINE, isClosed, ADMIN_PASSWORD, MAX_NAME } from './config.js';
import { getStore, normName, NameTakenError } from './store.js';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};
const NO_STORE = { 'Cache-Control': 'no-store' };

const json = (status, obj) => new Response(JSON.stringify(obj), {
  status, headers: { ...SECURITY_HEADERS, ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8' },
});
const text = (status, body, headers = {}) => new Response(body, {
  status, headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...headers },
});

async function readText(request, limit = 4096) {
  const body = await request.text();
  if (Buffer.byteLength(body) > limit) throw Object.assign(new Error('too large'), { status: 413 });
  return body;
}

// Best-effort limit on sign-up posts: 20 per minute per IP (per server instance).
const hits = new Map();
function rateLimited(request) {
  const ip = request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

const fmtTime = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csvCell = (s) => {
  let v = String(s);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`; // stop spreadsheet formula injection
  return `"${v.replace(/"/g, '""')}"`;
};

function serverError(err) {
  console.error(err);
  return json(500, { error: 'Något gick fel på servern. Försök igen.' });
}

// ---------- public API ----------

export async function status() {
  return json(200, { closed: isClosed(), deadline: DEADLINE.toISOString() });
}

export async function signup(request) {
  if (rateLimited(request)) return json(429, { error: 'För många försök. Vänta en minut och försök igen.' });
  if (isClosed()) return json(403, { closed: true, error: 'Anmälan är stängd.' });

  let body;
  try { body = JSON.parse(await readText(request)); } catch (err) {
    return json(err.status || 400, { error: 'Ogiltig förfrågan.' });
  }
  const name = typeof body?.name === 'string' ? normName(body.name) : '';
  if (!name) return json(400, { error: 'Fyll i ditt namn.' });
  if (name.length > MAX_NAME) return json(400, { error: `Namnet får vara högst ${MAX_NAME} tecken.` });

  try {
    const saved = await getStore().save({ id: typeof body.id === 'string' ? body.id : undefined, name });
    return json(200, saved);
  } catch (err) {
    if (err instanceof NameTakenError) return json(409, { error: err.message });
    return serverError(err);
  }
}

// ---------- admin (HTTP Basic auth, any username + ADMIN_PASSWORD) ----------

function denyAdmin(request) {
  if (!ADMIN_PASSWORD) return text(404, 'Admin är inte aktiverat. Sätt ADMIN_PASSWORD.');
  const m = /^Basic (.+)$/.exec(request.headers.get('authorization') || '');
  const pass = m ? Buffer.from(m[1], 'base64').toString('utf8').split(':').slice(1).join(':') : '';
  const a = crypto.createHash('sha256').update(pass).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (m && crypto.timingSafeEqual(a, b)) return null;
  return text(401, 'Inloggning krävs.', { 'WWW-Authenticate': 'Basic realm="Julbord admin", charset="UTF-8"' });
}

export async function adminPage(request) {
  const denied = denyAdmin(request); if (denied) return denied;
  let signups;
  try { signups = await getStore().list(); } catch (err) { return serverError(err); }

  const rows = signups.sort((a, b) => a.name.localeCompare(b.name, 'sv'))
    .map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(fmtTime(s.createdAt))}</td><td>
      <form method="post" action="/admin/delete" data-confirm="Ta bort ${esc(s.name)}?"><input type="hidden" name="id" value="${esc(s.id)}"><button class="btn btn-ghost" type="submit">Ta bort</button></form></td></tr>`)
    .join('');
  const state = isClosed() ? 'Stängd' : `Öppen till ${esc(fmtTime(DEADLINE.toISOString()))}`;
  const html = `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Anmälningar – Julbord 2026</title><link rel="stylesheet" href="/nocturne.css"><link rel="stylesheet" href="/app.css">
<style>.admin{max-width:900px;margin:0 auto;padding:40px 28px 80px;display:flex;flex-direction:column;gap:22px}.admin-head{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:16px}.admin form{margin:0}.table-wrap{overflow-x:auto}</style>
</head><body><div class="page"><main class="admin">
<div class="admin-head"><div class="stack-6"><div class="done-kicker">Julbord 2026 · Liseberg</div><h1 class="card-h2" style="font-size:32px">${signups.length} anmälda</h1>
<div class="text-muted">Anmälan: ${state}</div></div>
<a class="btn btn-primary" href="/admin/signups.csv">Ladda ner CSV</a></div>
<div class="card elev-md signup" style="padding:16px"><div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Namn</th><th>Anmäld</th><th></th></tr></thead>
<tbody>${rows || '<tr><td colspan="4" class="text-muted">Inga anmälningar än.</td></tr>'}</tbody></table></div></div>
<div class="footer" style="padding:0"><a href="/">← Till anmälningssidan</a></div>
</main></div><script src="/admin.js"></script></body></html>`;
  return new Response(html, { headers: { ...SECURITY_HEADERS, ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function adminCsv(request) {
  const denied = denyAdmin(request); if (denied) return denied;
  let signups;
  try { signups = await getStore().list(); } catch (err) { return serverError(err); }
  const lines = [['Namn', 'Anmäld', 'Senast ändrad'].map(csvCell).join(';')]
    .concat(signups.map((s) => [s.name, fmtTime(s.createdAt), fmtTime(s.updatedAt)].map(csvCell).join(';')));
  // BOM + semicolons so Excel with Swedish settings opens it correctly.
  return new Response('﻿' + lines.join('\r\n') + '\r\n', {
    headers: {
      ...SECURITY_HEADERS, ...NO_STORE,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="julbord-anmalningar.csv"',
    },
  });
}

export async function adminDelete(request) {
  const denied = denyAdmin(request); if (denied) return denied;
  // The browser re-sends Basic auth automatically, so refuse posts from other sites.
  const origin = request.headers.get('origin');
  let sameOrigin = !origin;
  try { sameOrigin = sameOrigin || new URL(origin).host === request.headers.get('host'); } catch { /* "null" etc. */ }
  if (!sameOrigin) return text(403, 'Förbjudet.');

  try {
    const id = new URLSearchParams(await readText(request)).get('id');
    if (id) await getStore().remove(id);
  } catch (err) { return serverError(err); }
  return new Response(null, { status: 303, headers: { ...SECURITY_HEADERS, Location: '/admin' } });
}
