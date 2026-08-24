-- Run this AFTER the schema you already ran.
alter table public.bookings add column if not exists reminder_24_sent boolean not null default false;
alter table public.bookings add column if not exists reminder_1h_sent boolean not null default false;
alter table public.bookings add column if not exists responded_at timestamptz;
create index if not exists bookings_start_idx on public.bookings(session_date,start_time);

-- =========================================================
-- Admin email center (uses the existing admin_emails table)
-- =========================================================
-- This does NOT create a new table. It only makes sure the
-- existing table has the fields needed for drafts and history.

alter table public.admin_emails add column if not exists created_at timestamptz not null default now();
alter table public.admin_emails add column if not exists updated_at timestamptz not null default now();
alter table public.admin_emails add column if not exists sent_at timestamptz;
alter table public.admin_emails add column if not exists status text not null default 'draft';

-- The email center stores drafts and successfully sent messages.
alter table public.admin_emails
  drop constraint if exists admin_emails_status_check;

alter table public.admin_emails
  add constraint admin_emails_status_check
  check (status in ('draft', 'sent'));

create index if not exists admin_emails_status_created_idx
  on public.admin_emails(status, created_at desc);

create index if not exists admin_emails_sent_at_idx
  on public.admin_emails(sent_at desc);
