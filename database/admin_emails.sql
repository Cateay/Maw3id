-- Existing admin_emails table migration used by the email center.
alter table public.admin_emails add column if not exists resend_id text;
alter table public.admin_emails add column if not exists error_message text;
alter table public.admin_emails add column if not exists sent_at timestamptz;
alter table public.admin_emails add column if not exists created_at timestamptz not null default now();
alter table public.admin_emails add column if not exists updated_at timestamptz not null default now();
alter table public.admin_emails add column if not exists status text not null default 'draft';

alter table public.admin_emails drop constraint if exists admin_emails_status_check;
alter table public.admin_emails add constraint admin_emails_status_check
  check (status in ('draft','sent','failed'));

create index if not exists admin_emails_status_idx on public.admin_emails(status);
create index if not exists admin_emails_created_at_idx on public.admin_emails(created_at desc);
create index if not exists admin_emails_sent_at_idx on public.admin_emails(sent_at desc);
