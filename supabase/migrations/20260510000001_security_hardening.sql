-- ============================================================
-- #NotWaiting — Security hardening (Supabase Advisor findings)
-- Addresses all CRITICAL and WARNING items from the Advisor Center.
-- ============================================================

-- ── 1. Security Definer Views → security_invoker ─────────────
-- The three stats views were created as SECURITY DEFINER (the default),
-- meaning they run as the view owner (postgres) and bypass RLS on the
-- underlying tables. Switching to security_invoker means each caller's
-- own privileges are used instead, so RLS is respected.
-- Our API uses the service-role key (which bypasses RLS), so behaviour
-- is unchanged for the app; the fix prevents privilege escalation if the
-- views are ever queried directly with a lower-privilege key.

create or replace view public.coalition_stats
  with (security_invoker = on) as
select
  count(*)                                                              as total_signers,
  count(distinct country)                                               as total_countries,
  count(*) filter (where created_at::date = current_date)              as signed_today,
  (select count(*) from public.actions where action = 'got_mark')      as total_marks,
  (select count(*) from public.actions
   where action = 'got_mark' and created_at::date = current_date)      as marks_today,
  (select count(*) from public.actions
   where action in ('shared_social','shared_story'))                    as total_shares,
  (select count(*) from public.actions
   where action in ('shared_social','shared_story')
   and created_at::date = current_date)                                 as shares_today
from public.signers;

create or replace view public.wave_breakdown
  with (security_invoker = on) as
select
  wave_tag,
  count(*) as signer_count
from public.signers
where wave_tag is not null
group by wave_tag
order by signer_count desc;

create or replace view public.country_breakdown
  with (security_invoker = on) as
select
  country,
  count(*) as signer_count
from public.signers
group by country
order by signer_count desc;


-- ── 2. RLS policies for signers, stories, actions ────────────
-- RLS is enabled on all three tables but no policies exist, which
-- means the Advisor flags them as incomplete. Our API exclusively uses
-- the service-role key (which bypasses RLS entirely), so deny-all for
-- other roles is the correct and intentional behaviour.
-- Adding explicit policies here silences the Advisor and documents intent.

-- signers: no direct public/authenticated access — API only via service role
create policy "deny_all_signers_anon"
  on public.signers
  as restrictive
  for all
  to anon, authenticated
  using (false);

-- stories: anon users can read visible stories directly if needed in future;
-- authenticated non-admin users are also limited to visible rows only.
-- (The API always uses service role, so this policy only applies to direct queries.)
create policy "anon_read_visible_stories"
  on public.stories
  for select
  to anon, authenticated
  using (is_visible = true);

-- actions: no direct public/authenticated access — API only via service role
create policy "deny_all_actions_anon"
  on public.actions
  as restrictive
  for all
  to anon, authenticated
  using (false);


-- ── 3. rls_auto_enable function — revoke public execute ──────
-- This SECURITY DEFINER function is granted to public and authenticated
-- by the Supabase dump. It should only be callable by postgres (it fires
-- as an event trigger, not via direct invocation).
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    revoke execute on function public.rls_auto_enable() from anon;
    revoke execute on function public.rls_auto_enable() from authenticated;
  end if;
end
$$;


-- ── 4. Auth RLS Initialization Plan — admin_users ────────────
-- The existing policy uses auth.uid() in a way that causes Postgres to
-- re-evaluate the auth function per-row instead of once per query.
-- Wrapping auth.uid() in a subselect forces a single evaluation.
drop policy if exists "Users can read own admin record" on public.admin_users;

create policy "Users can read own admin record"
  on public.admin_users
  for select
  using (user_id = (select auth.uid()));
