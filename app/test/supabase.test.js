import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabaseStore, NameTakenError } from '../lib/store.js';

// A fake fetch that records requests and replies with queued responses.
function fakeFetch(replies) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, ...init, body: init.body && JSON.parse(init.body) });
    const [status, body] = replies.shift();
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  };
  return { fn, calls };
}

const ID = '2c02b08d-69fa-462b-bf5d-afea93a7a2bd';
const row = (name) => ({ id: ID, name, created_at: '2026-10-23T08:00:00Z', updated_at: '2026-10-23T08:00:00Z' });

test('new sign-up upserts on name_key with the secret key', async () => {
  const f = fakeFetch([[201, [row('Anna Ek')]]]);
  const store = supabaseStore('https://x.supabase.co', 'sb_secret_abc', f.fn);
  assert.deepEqual(await store.save({ name: 'Anna Ek' }), { id: ID, name: 'Anna Ek' });
  const c = f.calls[0];
  assert.equal(c.method, 'POST');
  assert.equal(c.url, 'https://x.supabase.co/rest/v1/signups?on_conflict=name_key');
  assert.equal(c.headers.apikey, 'sb_secret_abc');
  assert.equal(c.headers.Authorization, undefined);
  assert.match(c.headers.Prefer, /merge-duplicates/);
  assert.equal(c.body[0].name_key, 'anna ek');
});

test('edit patches by id, falls back to upsert when the row is gone', async () => {
  const f = fakeFetch([[200, []], [201, [row('Anna Ek')]]]);
  const store = supabaseStore('https://x.supabase.co', 'eyJlegacy', f.fn);
  await store.save({ id: ID, name: 'Anna Ek' });
  assert.equal(f.calls[0].method, 'PATCH');
  assert.equal(f.calls[0].url, `https://x.supabase.co/rest/v1/signups?id=eq.${ID}`);
  assert.equal(f.calls[0].headers.Authorization, 'Bearer eyJlegacy');
  assert.equal(f.calls[1].method, 'POST');
});

test('non-uuid ids are never put in the query', async () => {
  const f = fakeFetch([[201, [row('Anna')]]]);
  await supabaseStore('https://x.supabase.co', 'k', f.fn).save({ id: '1&or=(id.neq.0)', name: 'Anna' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].method, 'POST');
});

test('unique violation becomes NameTakenError; list maps columns', async () => {
  const f = fakeFetch([[409, { code: '23505' }], [200, [row('Anna')]]]);
  const store = supabaseStore('https://x.supabase.co', 'k', f.fn);
  await assert.rejects(store.save({ id: ID, name: 'Anna' }), NameTakenError);
  assert.deepEqual(await store.list(), [{ id: ID, name: 'Anna', createdAt: '2026-10-23T08:00:00Z', updatedAt: '2026-10-23T08:00:00Z' }]);
});
