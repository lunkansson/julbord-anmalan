// Settings shared by the local server and the Vercel functions. All come from environment variables.

// End of 28 October, Swedish time (CET, summer time has ended by then).
export const DEADLINE = new Date(process.env.SIGNUP_DEADLINE || '2026-10-28T23:59:59+01:00');
if (Number.isNaN(DEADLINE.getTime())) throw new Error(`Ogiltigt SIGNUP_DEADLINE: ${process.env.SIGNUP_DEADLINE}`);

const FORCE_CLOSED = /^(1|true|yes)$/i.test(process.env.SIGNUPS_CLOSED || '');
export const isClosed = () => FORCE_CLOSED || Date.now() > DEADLINE.getTime();

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
export const MAX_NAME = 100;

export const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
// Supabase's newer "secret" key or the older "service_role" key. Server-side only, never sent to the browser.
export const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
