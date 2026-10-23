-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- Creates the table the julbord sign-up page writes to.

create table if not exists public.signups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 100),
  name_key    text not null unique,          -- lower-cased name, so the same person is only listed once
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Only the server (with the secret key) may read or write. No policies = no access for the public key.
alter table public.signups enable row level security;

grant select, insert, update, delete on public.signups to service_role;
