// Request handlers in the web-standard Request → Response shape.
// Vercel runs them as functions (api/*.js); server.js runs the same ones locally.
import { DEADLINE, isClosed, MAX_NAME, keyKind, SUPABASE_KEY } from './config.js';
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
const csvCell = (s) => {
  let v = String(s);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`; // stop spreadsheet formula injection
  return `"${v.replace(/"/g, '""')}"`;
};

// Turn a storage error into a short reason the organiser can act on. Never includes keys.
function reason(err) {
  const m = String(err?.message || err);
  const missing = /inte konfigurerat: (.+) saknas/.exec(m);
  if (missing) {
    const env = process.env.VERCEL_ENV ? ` (miljö: ${process.env.VERCEL_ENV})` : '';
    return `${missing[1]} saknas i Vercel${env}. Lägg in under Settings → Environment Variables och gör Redeploy.`;
  }
  if (/PGRST205|42P01|does not exist|Could not find the table/i.test(m)) return 'Tabellen signups finns inte i Supabase – kör supabase/schema.sql.';
  if (/Supabase \w+ 401/.test(m)) {
    const kind = keyKind();
    if (kind === 'publishable' || kind === 'anon') {
      return `SUPABASE_SECRET_KEY är en ${kind}-nyckel. Använd en secret key (sb_secret_…) eller service_role.`;
    }
    let said = '';
    try { said = JSON.parse(m.slice(m.indexOf('{'))).message || ''; } catch { /* keep empty */ }
    return `Supabase godtar inte nyckeln (typ: ${kind}, ${SUPABASE_KEY.length} tecken${said ? `, Supabase säger: "${said}"` : ''}). `
      + 'Kopiera nyckeln på nytt från projektet uxururfjpxegxtexjuhg och gör Redeploy.';
  }
  if (/42501|permission denied/i.test(m)) return 'Nyckeln saknar behörighet – använd secret key, inte publishable.';
  if (/fetch failed|ENOTFOUND|getaddrinfo/i.test(m)) return 'Når inte Supabase – kontrollera SUPABASE_URL.';
  return null;
}

function serverError(err) {
  console.error('[julbord]', err?.message || err);
  const why = reason(err);
  return json(500, { error: `Något gick fel på servern. Försök igen.${why ? ` (Orsak: ${why})` : ''}` });
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

// Public list shown on the page: names only, in alphabetical order.
export async function attendees() {
  try {
    const names = (await getStore().list()).map((s) => s.name).sort((a, b) => a.localeCompare(b, 'sv'));
    return json(200, { count: names.length, names });
  } catch (err) { return serverError(err); }
}

// Same list as a CSV file for Excel (BOM + semicolons so Swedish Excel opens it correctly).
export async function attendeesCsv() {
  let signups;
  try { signups = await getStore().list(); } catch (err) { return serverError(err); }
  signups.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  const lines = [['Namn', 'Anmäld'].map(csvCell).join(';')]
    .concat(signups.map((s) => [s.name, fmtTime(s.createdAt)].map(csvCell).join(';')));
  return new Response('\uFEFF' + lines.join('\r\n') + '\r\n', {
    headers: {
      ...SECURITY_HEADERS, ...NO_STORE,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="julbord-anmalda.csv"',
    },
  });
}

// Setup check at /api/health: says in plain Swedish what is missing, without revealing any keys.
export async function health() {
  const { SUPABASE_URL } = await import('./config.js');
  const checks = [];
  const add = (ok, what, fix) => checks.push(ok ? { ok, what } : { ok, what, fix });

  add(!!SUPABASE_URL, 'SUPABASE_URL är satt', 'Lägg in SUPABASE_URL i Vercel (Settings → Environment Variables) och gör Redeploy.');
  if (SUPABASE_URL) add(/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL), `SUPABASE_URL ser rätt ut (${SUPABASE_URL})`, 'Den ska se ut som https://xxxx.supabase.co');
  add(!!SUPABASE_KEY, 'SUPABASE_SECRET_KEY är satt', 'Lägg in SUPABASE_SECRET_KEY i Vercel och gör Redeploy.');

  if (SUPABASE_KEY) {
    const kind = keyKind();
    add(kind === 'secret' || kind === 'service_role', `Nyckeln är av typen "${kind}"`,
      'Fel nyckel: använd en secret key (sb_secret_…) eller service_role-nyckeln, inte publishable/anon.');
  }

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const headers = { apikey: SUPABASE_KEY };
      if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/signups?select=id&limit=1`, { headers });
      const body = await res.text();
      let fix = `Supabase svarade ${res.status}: ${body.slice(0, 300)}`;
      if (/PGRST205|42P01|does not exist|Could not find the table/i.test(body)) fix = 'Tabellen signups finns inte. Kör SQL:en från supabase/schema.sql i Supabase SQL Editor.';
      else if (res.status === 401) fix = 'Supabase godtar inte nyckeln. Kopiera secret key på nytt och kontrollera att den hör till samma projekt som SUPABASE_URL.';
      else if (/42501|permission denied/i.test(body)) fix = 'Behörighet saknas. Kör SQL:en från supabase/schema.sql igen (raden med grant).';
      add(res.ok, 'Kan läsa tabellen signups i Supabase', fix);
    } catch (err) {
      add(false, 'Kan nå Supabase', `Kunde inte ansluta: ${err.message}. Kontrollera SUPABASE_URL.`);
    }
  }

  const ok = checks.every((c) => c.ok);
  return json(ok ? 200 : 500, { ok, summary: ok ? 'Allt ser bra ut.' : 'Något behöver åtgärdas – se "fix".', checks });
}
