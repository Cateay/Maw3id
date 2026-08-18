-- Run this AFTER the schema you already ran.
alter table public.bookings add column if not exists reminder_24_sent boolean not null default false;
alter table public.bookings add column if not exists reminder_1h_sent boolean not null default false;
alter table public.bookings add column if not exists responded_at timestamptz;
create index if not exists bookings_start_idx on public.bookings(session_date,start_time);
