-- Run this ONCE in Supabase SQL Editor.
-- This migrates an existing admin_emails table to the final
-- drafts + sent-history structure.

alter table public.admin_emails
  add column if not exists resend_id text;

alter table public.admin_emails
  add column if not exists created_at timestamptz not null default now();

alter table public.admin_emails
  add column if not exists updated_at timestamptz not null default now();

alter table public.admin_emails
  add column if not exists sent_at timestamptz;

alter table public.admin_emails
  drop column if exists error_message;

-- Remove any previous status check, regardless of its old name.
do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.admin_emails'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format(
      'alter table public.admin_emails drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;
end $$;

alter table public.admin_emails
  alter column recipient drop not null;

alter table public.admin_emails
  alter column subject drop not null;

alter table public.admin_emails
  alter column message drop not null;

alter table public.admin_emails
  add constraint admin_emails_status_check
  check (status in ('draft', 'sent'));

create index if not exists admin_emails_status_idx
  on public.admin_emails(status);

create index if not exists admin_emails_created_at_idx
  on public.admin_emails(created_at desc);

create index if not exists admin_emails_sent_at_idx
  on public.admin_emails(sent_at desc);
