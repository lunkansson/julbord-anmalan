// Where sign-ups live: Supabase when it is configured, otherwise a local JSON file (for development).
// Both stores expose the same three methods:
//   list()            → [{ id, name, createdAt, updatedAt }]
//   save({ id, name }) → { id, name }   (updates by id, else by name, else inserts)
//   remove(id)
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export class NameTakenError extends Error {
  constructor() { super('Det namnet är redan anmält.'); }
}

export const normName = (s) => s.normalize('NFC').trim().replace(/\s+/g, ' ');
export const nameKey = (s) => normName(s).toLocaleLowerCase('sv');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- JSON file ----------

export function fileStore(file) {
  let rows;
  try {
    rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(rows)) throw new Error(`${file} is not a JSON array`);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    rows = [];
  }

  // One write at a time, via a temp file + rename so a crash never leaves half a file.
  let queue = Promise.resolve();
  const persist = () => {
    const snapshot = JSON.stringify(rows, null, 2);
    queue = queue.then(async () => {
      await fsp.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, snapshot);
      await fsp.rename(tmp, file);
    });
    return queue;
  };

  return {
    kind: 'file',
    async list() { return rows.map((r) => ({ ...r })); },
    async save({ id, name }) {
      const key = nameKey(name);
      const now = new Date().toISOString();
      const sameName = rows.find((r) => nameKey(r.name) === key);
      let row = id ? rows.find((r) => r.id === id) : null;
      if (row) {
        if (sameName && sameName !== row) throw new NameTakenError();
        Object.assign(row, { name, updatedAt: now });
      } else if (sameName) {
        row = Object.assign(sameName, { name, updatedAt: now });
      } else {
        row = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
        rows.push(row);
      }
      await persist();
      return { id: row.id, name: row.name };
    },
    async remove(id) {
      const before = rows.length;
      rows = rows.filter((r) => r.id !== id);
      if (rows.length !== before) await persist();
    },
  };
}

// ---------- Supabase (via its REST API, no client library needed) ----------

export function supabaseStore(url, key, fetchImpl = fetch) {
  const table = `${url}/rest/v1/signups`;
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // Legacy service_role keys are JWTs and also go in Authorization; the newer sb_secret_ keys don't.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  async function call(method, query, body, prefer) {
    const res = await fetchImpl(`${table}${query}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      if (res.status === 409 || data?.code === '23505') throw new NameTakenError();
      throw new Error(`Supabase ${method} ${res.status}: ${text}`);
    }
    return data;
  }

  const fromRow = (r) => ({ id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at });

  return {
    kind: 'supabase',
    async list() {
      const rows = await call('GET', '?select=id,name,created_at,updated_at&order=created_at.asc');
      return rows.map(fromRow);
    },
    async save({ id, name }) {
      const fields = { name, name_key: nameKey(name), updated_at: new Date().toISOString() };
      if (id && UUID.test(id)) {
        const updated = await call('PATCH', `?id=eq.${id}`, fields, 'return=representation');
        if (updated.length) return { id: updated[0].id, name: updated[0].name };
      }
      // New sign-up, or the same name again: insert, or update the row that already has this name.
      const [row] = await call('POST', '?on_conflict=name_key', [fields], 'resolution=merge-duplicates,return=representation');
      return { id: row.id, name: row.name };
    },
    async remove(id) {
      if (!UUID.test(id || '')) return;
      await call('DELETE', `?id=eq.${id}`);
    },
  };
}

// ---------- pick one ----------

let store;
export function getStore() {
  if (store) return store;
  if (SUPABASE_URL && SUPABASE_KEY) store = supabaseStore(SUPABASE_URL, SUPABASE_KEY);
  else if (process.env.VERCEL) {
    const missing = [!SUPABASE_URL && 'SUPABASE_URL', !SUPABASE_KEY && 'SUPABASE_SECRET_KEY'].filter(Boolean).join(' och ');
    throw new Error(`Supabase är inte konfigurerat: ${missing} saknas`);
  }
  else store = fileStore(path.resolve(process.env.DATA_FILE || new URL('../data/signups.json', import.meta.url).pathname));
  return store;
}
