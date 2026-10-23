#!/usr/bin/env node
// Local server: serves public/ and runs the same handlers Vercel runs from api/.
// Uses Supabase if SUPABASE_URL + SUPABASE_SECRET_KEY are set, otherwise data/signups.json.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as h from './lib/handlers.js';
import { DEADLINE, isClosed, ADMIN_PASSWORD } from './lib/config.js';
import { getStore } from './lib/store.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

// Same routes as vercel.json.
const ROUTES = {
  'GET /api/status': h.status,
  'GET /api/attendees': h.attendees,
  'POST /api/signups': h.signup,
  'GET /admin': h.adminPage,
  'GET /admin/signups.csv': h.adminCsv,
  'POST /admin/delete': h.adminDelete,
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400).end(); return; }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  try {
    if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new Error('outside public');
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Hittades inte.');
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const handler = ROUTES[`${req.method} ${url.pathname.replace(/\/$/, '') || '/'}`];
    if (!handler) {
      if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res, url.pathname);
      return res.writeHead(405).end();
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    headers.set('x-real-ip', req.socket.remoteAddress || '');
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
    const response = await handler(new Request(url, { method: req.method, headers, body }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500).end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Julbord-anmälan på http://localhost:${PORT}`);
  console.log(`Lagring: ${getStore().kind === 'supabase' ? 'Supabase' : 'lokal JSON-fil'}`);
  console.log(`Anmälan ${isClosed() ? 'är STÄNGD' : `öppen till ${DEADLINE.toISOString()}`}`);
  console.log(ADMIN_PASSWORD ? 'Admin: /admin' : 'Admin avstängt (sätt ADMIN_PASSWORD för att aktivera /admin)');
});
