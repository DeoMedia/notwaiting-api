-- Migration: soft deduplication on signers
-- Prevents the same first_name + country from signing twice.
-- Case-insensitive and whitespace-trimmed so "amara" and "Amara " are treated
-- as the same signer. Works in tandem with the rate limiter (3/IP/hr) as a
-- defence-in-depth against casual spam.
--
-- This is intentionally soft deduplication, not identity verification.
-- Two real people named "Amara" from Ghana can't both sign — a known trade-off
-- until email collection is added to the form.

create unique index if not exists signers_name_country_unique
  on public.signers (lower(trim(first_name)), country);
