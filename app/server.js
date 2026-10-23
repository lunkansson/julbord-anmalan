#!/usr/bin/env node
// Julbord sign-up server. No dependencies: serves public/, stores sign-ups in a JSON file,
// and gives the organiser a password-protected list with CSV export at /admin.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, 'data', 'signups.json'));
// End of 28 October, Swedish time (CET, summer time has ended by then).
const DEADLINE = new Date(process.env.SIGNUP_DEADLINE || '2026-10-28T23:59:59+01:00');
const FORCE_CLOSED = /^(1|true|yes)$/i.test(process.env.SIGNUPS_CLOSED || '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const MAX_NAME = 100;

if (Number.isNaN(DEADLINE.getTime())) {
  console.error(`Ogiltigt SIGNUP_DEADLINE: ${process.env.SIGNUP_DEADLINE}`);
  process.exit(1);
}

const isClosed = () => FORCE_CLOSED || Date.now() > DEADLINE.getTime();

// ---------- storage ----------

let signups = [];
try {
  signups = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!Array.isArray(signups)) throw new Error('data file is not an array');
} catch (err) {
  if (err.code !== 'ENOENT') { console.error(`Kan inte läsa ${DATA_FILE}:`, err.message); process.exit(1); }
  signups = [];
}

// Writes go one at a time, via a temp file + rename so a crash never leaves half a file.
let writeQueue = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify(signups, null, 2);
  writeQueue = writeQueue.then(async () => {
    await fsp.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, snapshot);
    await fsp.rename(tmp, DATA_FILE);
  });
  return writeQueue;
}

const normName = (s) => s.normalize('NFC').trim().replace(/\s+/g, ' ');
const nameKey = (s) => normName(s).toLocaleLowerCase('sv');

// ---------- helpers ----------

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Simple per-IP limit on sign-up posts: 20 per minute.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}
setInterval(() => { const now = Date.now(); for (const [ip, ts] of hits) if (ts.every((t) => now - t >= 60_000)) hits.delete(ip); }, 60_000).unref();

function checkAdmin(req) {
  if (!ADMIN_PASSWORD) return false;
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const pass = Buffer.from(m[1], 'base64').toString('utf8').split(':').slice(1).join(':');
  const a = crypto.createHash('sha256').update(pass).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csvCell = (s) => {
  let v = String(s);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`; // stop spreadsheet formula injection
  return `"${v.replace(/"/g, '""')}"`;
};
const fmtTime = (iso) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' });

// ---------- handlers ----------

async function handleSignup(req, res) {
  const ip = req.socket.remoteAddress || '';
  if (rateLimited(ip)) return sendJson(res, 429, { error: 'För många försök. Vänta en minut och försök igen.' });
  if (isClosed()) return sendJson(res, 403, { closed: true, error: 'Anmälan är stängd.' });

  let body;
  try { body = JSON.parse(await readBody(req)); } catch (err) {
    return sendJson(res, err.status || 400, { error: 'Ogiltig förfrågan.' });
  }
  const name = typeof body.name === 'string' ? normName(body.name) : '';
  if (!name) return sendJson(res, 400, { error: 'Fyll i ditt namn.' });
  if (name.length > MAX_NAME) return sendJson(res, 400, { error: `Namnet får vara högst ${MAX_NAME} tecken.` });

  const now = new Date().toISOString();
  // Editing an earlier sign-up from the same browser: update it in place.
  let entry = typeof body.id === 'string' ? signups.find((s) => s.id === body.id) : null;
  if (entry) {
    entry.name = name; entry.updatedAt = now;
  } else {
    // Same name signed up twice (e.g. from another device): keep one entry.
    entry = signups.find((s) => nameKey(s.name) === nameKey(name));
    if (entry) entry.updatedAt = now;
    else { entry = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now }; signups.push(entry); }
  }
  await persist();
  sendJson(res, 200, { id: entry.id, name: entry.name });
}

function adminPage() {
  const rows = [...signups].sort((a, b) => a.name.localeCompare(b.name, 'sv'))
    .map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(fmtTime(s.createdAt))}</td><td>
      <form method="post" action="/admin/delete" data-confirm="Ta bort ${esc(s.name)}?"><input type="hidden" name="id" value="${esc(s.id)}"><button class="btn btn-ghost" type="submit">Ta bort</button></form></td></tr>`)
    .join('');
  const status = isClosed() ? 'Stängd' : `Öppen till ${esc(fmtTime(DEADLINE.toISOString()))}`;
  return `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Anmälningar – Konsultjulbord 2026</title><link rel="stylesheet" href="/nocturne.css"><link rel="stylesheet" href="/app.css">
<style>.admin{max-width:900px;margin:0 auto;padding:40px 28px 80px;display:flex;flex-direction:column;gap:22px}.admin-head{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:16px}.admin form{margin:0}.table-wrap{overflow-x:auto}</style>
</head><body><div class="page"><main class="admin">
<div class="admin-head"><div class="stack-6"><div class="done-kicker">Konsultjulbord 2026</div><h1 class="card-h2" style="font-size:32px">${signups.length} anmälda</h1>
<div class="text-muted">Anmälan: ${status}</div></div>
<a class="btn btn-primary" href="/admin/signups.csv">Ladda ner CSV</a></div>
<div class="card elev-md signup" style="padding:16px"><div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Namn</th><th>Anmäld</th><th></th></tr></thead>
<tbody>${rows || '<tr><td colspan="4" class="text-muted">Inga anmälningar än.</td></tr>'}</tbody></table></div></div>
</main></div><script src="/admin.js"></script></body></html>`;
}

async function handleAdmin(req, res, url) {
  if (!ADMIN_PASSWORD) return send(res, 404, 'Admin är inte aktiverat. Starta servern med ADMIN_PASSWORD.', { 'Content-Type': 'text/plain; charset=utf-8' });
  if (!checkAdmin(req)) return send(res, 401, 'Inloggning krävs.', { 'WWW-Authenticate': 'Basic realm="Julbord admin", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });

  if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
    return send(res, 200, adminPage(), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  }
  if (req.method === 'GET' && url.pathname === '/admin/signups.csv') {
    const lines = [['Namn', 'Anmäld', 'Senast ändrad'].map(csvCell).join(';')]
      .concat(signups.map((s) => [s.name, fmtTime(s.createdAt), fmtTime(s.updatedAt)].map(csvCell).join(';')));
    // BOM + semicolons so Excel with Swedish settings opens it correctly.
    return send(res, 200, '﻿' + lines.join('\r\n') + '\r\n', {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="julbord-anmalningar.csv"',
      'Cache-Control': 'no-store',
    });
  }
  if (req.method === 'POST' && url.pathname === '/admin/delete') {
    // Same-origin check: the browser re-sends Basic auth automatically, so block cross-site posts.
    const origin = req.headers.origin;
    let sameOrigin = !origin;
    try { sameOrigin = sameOrigin || new URL(origin).host === req.headers.host; } catch { /* "null" etc. */ }
    if (!sameOrigin) {
      return send(res, 403, 'Förbjudet.', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    const id = new URLSearchParams(await readBody(req)).get('id');
    const before = signups.length;
    signups = signups.filter((s) => s.id !== id);
    if (signups.length !== before) await persist();
    return send(res, 303, '', { Location: '/admin' });
  }
  return send(res, 404, 'Hittades inte.', { 'Content-Type': 'text/plain; charset=utf-8' });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

async function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad request'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
    const ext = path.extname(file);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch {
    send(res, 404, 'Hittades inte.', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/status' && req.method === 'GET') {
      return sendJson(res, 200, { closed: isClosed(), deadline: DEADLINE.toISOString() });
    }
    if (url.pathname === '/api/signups') {
      if (req.method === 'POST') return await handleSignup(req, res);
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await handleAdmin(req, res, url);
    if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res, url);
    send(res, 405, 'Method not allowed');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, err.status || 500, { error: 'Något gick fel på servern. Försök igen.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Julbord-anmälan på http://localhost:${PORT}`);
  console.log(`Data: ${DATA_FILE} (${signups.length} anmälda)`);
  console.log(`Anmälan ${isClosed() ? 'är STÄNGD' : `öppen till ${DEADLINE.toISOString()}`}`);
  console.log(ADMIN_PASSWORD ? 'Admin: /admin' : 'Admin avstängt (sätt ADMIN_PASSWORD för att aktivera /admin)');
});
