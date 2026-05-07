-- ============================================================
-- #NotWaiting — Admin Users Migration
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- Run AFTER the main schema.sql
-- ============================================================

-- ── Admin users ───────────────────────────────────────────────
-- Stores which Supabase auth users have admin access and their role.
-- This is separate from the public signers table.

create table if not exists public.admin_users (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('super_admin', 'content_manager')),
  created_at timestamptz not null default now(),
  constraint admin_users_user_unique unique (user_id)
);

-- Enable RLS
alter table public.admin_users enable row level security;

-- Only authenticated users can read their own row
-- (the server uses service role key which bypasses RLS)
create policy "Users can read own admin record"
  on public.admin_users for select
  using (auth.uid() = user_id);

-- Index for fast lookups
create index if not exists admin_users_user_id_idx on public.admin_users(user_id);

-- ── After running this migration: ────────────────────────────
-- 1. Go to Supabase → Authentication → Users → Invite user
--    (or use the admin app once deployed)
-- 2. Get the new user's UUID from the Users list
-- 3. Run this to make them a super admin:
--
--    insert into public.admin_users (user_id, role)
--    values ('PASTE-USER-UUID-HERE', 'super_admin');
