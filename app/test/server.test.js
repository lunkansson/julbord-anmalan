import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function start(env) {
  const port = 30000 + Math.floor(Math.random() * 20000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'julbord-'));
  const dataFile = path.join(dir, 'signups.json');
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', PORT: String(port), HOST: '127.0.0.1', DATA_FILE: dataFile, ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const ready = new Promise((resolve) => proc.stdout.on('data', (d) => { if (String(d).includes('http://')) resolve(); }));
  return { proc, ready, dataFile, base: `http://127.0.0.1:${port}` };
}

const post = (base, body) => fetch(`${base}/api/signups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

let open, closed;
before(async () => {
  open = start({ SIGNUP_DEADLINE: '2999-01-01T00:00:00Z' });
  closed = start({ SIGNUP_DEADLINE: '2000-01-01T00:00:00Z' });
  await Promise.all([open.ready, closed.ready]);
});
after(() => { open.proc.kill(); closed.proc.kill(); });

test('serves the page and assets', async () => {
  const html = await (await fetch(`${open.base}/`)).text();
  assert.match(html, /God jul på/);
  assert.match(html, /href="\/anmalda"/);
  assert.match(await (await fetch(`${open.base}/anmalda`)).text(), /<h1 class="list-title">Anmälda/);
  assert.equal((await fetch(`${open.base}/assets/1923.jpg`)).headers.get('content-type'), 'image/jpeg');
  assert.equal((await fetch(`${open.base}/..%2fserver.js`)).status, 404);
});

test('status reflects the deadline', async () => {
  assert.equal((await (await fetch(`${open.base}/api/status`)).json()).closed, false);
  assert.equal((await (await fetch(`${closed.base}/api/status`)).json()).closed, true);
});

test('validates name', async () => {
  assert.equal((await post(open.base, { name: '   ' })).status, 400);
  assert.equal((await post(open.base, { name: 'x'.repeat(101) })).status, 400);
});

test('stores, edits and de-duplicates sign-ups', async () => {
  const a = await (await post(open.base, { name: '  Anna   Svensson ' })).json();
  assert.equal(a.name, 'Anna Svensson');
  const again = await (await post(open.base, { name: 'anna svensson' })).json();
  assert.equal(again.id, a.id);
  const edited = await (await post(open.base, { name: 'Anna Ek', id: a.id })).json();
  assert.equal(edited.id, a.id);
  await new Promise((r) => setTimeout(r, 50));
  const saved = JSON.parse(fs.readFileSync(open.dataFile, 'utf8'));
  assert.deepEqual(saved.map((s) => s.name), ['Anna Ek']);
  // Renaming onto someone else's name is refused.
  const b = await (await post(open.base, { name: 'Bo Ek' })).json();
  assert.equal((await post(open.base, { name: 'anna ek', id: b.id })).status, 409);
});

test('public attendee list shows names only', async () => {
  await post(open.base, { name: 'Örjan Öst' });
  const res = await (await fetch(`${open.base}/api/attendees`)).json();
  assert.ok(res.names.includes('Örjan Öst'));
  assert.equal(res.count, res.names.length);
  assert.ok(res.names.every((n) => typeof n === 'string'));
});

test('rejects sign-ups after the deadline', async () => {
  const res = await post(closed.base, { name: 'Sen Person' });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).closed, true);
});

test('anyone can download the list as CSV; admin pages are gone', async () => {
  await post(open.base, { name: '=HYPERLINK("x")' });
  const res = await fetch(`${open.base}/api/attendees-csv`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attachment/);
  const csv = await res.text();
  assert.match(csv, /"Namn";"Anmäld"/);
  assert.match(csv, /"'=HYPERLINK/);
  assert.equal((await fetch(`${open.base}/admin`)).status, 404);
  assert.equal((await fetch(`${open.base}/admin/delete`, { method: 'POST', body: 'id=x' })).status, 405);
});
