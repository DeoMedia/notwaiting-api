-- ============================================================
-- #NotWaiting — Stories signer_id unique constraint
-- Required for the upsert in routes/stories.js POST to work correctly.
-- Run in Supabase Dashboard → SQL Editor → New Query.
-- ============================================================

-- Deduplicate first (keep the most recent story per signer)
delete from public.stories s1
using public.stories s2
where s1.signer_id = s2.signer_id
  and s1.created_at < s2.created_at;

-- Add unique constraint so upsert can resolve conflicts on signer_id
alter table public.stories
  add constraint stories_signer_id_unique unique (signer_id);
