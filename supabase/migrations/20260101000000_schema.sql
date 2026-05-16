-- ============================================================
-- #NotWaiting — Full initial schema
-- Covers all tables, views, indexes, and RLS policies the API needs.
-- All statements are idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
-- gen_random_uuid() is built-in since Postgres 13; no extension needed.

-- ── signers ──────────────────────────────────────────────────
create table if not exists public.signers (
  id         uuid primary key default gen_random_uuid(),
  first_name text not null,
  country    text not null,
  wave       text,
  wave_tag   text,
  created_at timestamptz not null default now()
);

alter table public.signers enable row level security;

create index if not exists signers_created_at_idx on public.signers(created_at desc);
create index if not exists signers_country_idx    on public.signers(country);
create index if not exists signers_wave_tag_idx   on public.signers(wave_tag);

-- ── stories ──────────────────────────────────────────────────
create table if not exists public.stories (
  id         uuid primary key default gen_random_uuid(),
  signer_id  uuid not null references public.signers(id) on delete cascade,
  first_name text not null,
  country    text not null,
  wave_tag   text,
  caption    text not null,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  -- One story per signer — enables atomic upsert in the API
  constraint stories_signer_id_unique unique (signer_id)
);

alter table public.stories enable row level security;

create index if not exists stories_created_at_idx on public.stories(created_at desc);
create index if not exists stories_wave_tag_idx   on public.stories(wave_tag);
create index if not exists stories_is_visible_idx on public.stories(is_visible);

-- ── actions ──────────────────────────────────────────────────
create table if not exists public.actions (
  id         uuid primary key default gen_random_uuid(),
  signer_id  uuid not null references public.signers(id) on delete cascade,
  action     text not null,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

alter table public.actions enable row level security;

create index if not exists actions_signer_id_idx  on public.actions(signer_id);
create index if not exists actions_created_at_idx on public.actions(created_at desc);
create index if not exists actions_action_idx     on public.actions(action);

-- ── admin_users ───────────────────────────────────────────────
create table if not exists public.admin_users (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('super_admin', 'content_manager')),
  created_at timestamptz not null default now(),
  constraint admin_users_user_unique unique (user_id)
);

alter table public.admin_users enable row level security;

create index if not exists admin_users_user_id_idx on public.admin_users(user_id);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'admin_users'
      and policyname = 'Users can read own admin record'
  ) then
    execute $policy$
      create policy "Users can read own admin record"
        on public.admin_users for select
        using (auth.uid() = user_id)
    $policy$;
  end if;
end$$;

-- ── coalition_stats view ──────────────────────────────────────
drop view if exists public.coalition_stats;
create view public.coalition_stats as
select
  count(*)                                                             as total_signers,
  count(distinct country)                                              as total_countries,
  count(*) filter (where created_at::date = current_date)             as signed_today,
  (select count(*) from public.actions where action = 'got_mark')     as total_marks,
  (select count(*) from public.actions where action = 'got_mark'
     and created_at::date = current_date)                             as marks_today,
  (select count(*) from public.actions where action in ('shared_social','shared_story')) as total_shares,
  (select count(*) from public.actions where action in ('shared_social','shared_story')
     and created_at::date = current_date)                             as shares_today
from public.signers;

-- ── wave_breakdown view ───────────────────────────────────────
drop view if exists public.wave_breakdown;
create view public.wave_breakdown as
select
  wave_tag,
  count(*) as signer_count
from public.signers
where wave_tag is not null
group by wave_tag
order by signer_count desc;

-- ── country_breakdown view ────────────────────────────────────
drop view if exists public.country_breakdown;
create view public.country_breakdown as
select
  country,
  count(*) as signer_count
from public.signers
group by country
order by signer_count desc;
