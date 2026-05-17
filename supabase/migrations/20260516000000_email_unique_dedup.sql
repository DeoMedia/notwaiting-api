-- Replace name+country deduplication with email deduplication.
-- The name+country unique index caused false positives (two real people named
-- "David" from Nigeria could not both sign). Email is 1:1 with a person.

drop index if exists public.signers_name_country_unique;

-- Partial unique index: only enforced when email is provided.
-- Existing rows with NULL email are unaffected (NULL != NULL in Postgres).
create unique index signers_email_unique
  on public.signers (lower(trim(email)))
  where email is not null;
