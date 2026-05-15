alter table public.signers
  add column if not exists email text;

create index if not exists signers_email_idx on public.signers(email);
