// Settings shared by the local server and the Vercel functions. All come from environment variables.

// End of 28 October, Swedish time (CET, summer time has ended by then).
export const DEADLINE = new Date(process.env.SIGNUP_DEADLINE || '2026-10-28T23:59:59+01:00');
if (Number.isNaN(DEADLINE.getTime())) throw new Error(`Ogiltigt SIGNUP_DEADLINE: ${process.env.SIGNUP_DEADLINE}`);

const FORCE_CLOSED = /^(1|true|yes)$/i.test(process.env.SIGNUPS_CLOSED || '');
export const isClosed = () => FORCE_CLOSED || Date.now() > DEADLINE.getTime();

export const MAX_NAME = 100;

// Accepts both https://<ref>.supabase.co and the full REST address https://<ref>.supabase.co/rest/v1/
// The project address is not secret, so it has a default; the env variable can still override it.
const DEFAULT_SUPABASE_URL = 'https://uxururfjpxegxtexjuhg.supabase.co';
export const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL)
  .trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
// Supabase's newer "secret" key or the older "service_role" key. Server-side only, never sent to the browser.
// Trimmed, and stray quotes removed, in case they came along when pasting into Vercel.
export const SUPABASE_KEY = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  .trim().replace(/^["']+|["']+$/g, '').trim();

// What kind of key it is (never the key itself): secret, service_role, publishable, anon or unknown.
export function keyKind(key = SUPABASE_KEY) {
  if (key.startsWith('sb_secret_')) return 'secret';
  if (key.startsWith('sb_publishable_')) return 'publishable';
  if (key.startsWith('eyJ')) {
    try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role || 'okänd'; } catch { return 'okänd'; }
  }
  return 'okänd';
}
