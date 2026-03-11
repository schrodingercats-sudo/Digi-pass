create extension if not exists pgcrypto;

create or replace function set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists event_settings (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_slug text not null unique,
  venue text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

drop trigger if exists trg_event_settings_updated_at on event_settings;
create trigger trg_event_settings_updated_at
before update on event_settings
for each row
execute procedure set_row_updated_at();

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'scanner' check (role in ('scanner', 'supervisor')),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_admin_users_updated_at on admin_users;
create trigger trg_admin_users_updated_at
before update on admin_users
for each row
execute procedure set_row_updated_at();

create table if not exists event_passes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references event_settings(id) on delete cascade,
  attendee_name text not null,
  attendee_email text not null,
  attendee_phone text not null,
  pass_code text not null unique,
  token_version integer not null default 1,
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired', 'revoked')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by_admin_id uuid references admin_users(id),
  override_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_event_passes_updated_at on event_passes;
create trigger trg_event_passes_updated_at
before update on event_passes
for each row
execute procedure set_row_updated_at();

create unique index if not exists uniq_pass_email_per_event
on event_passes(event_id, attendee_email);

create unique index if not exists uniq_pass_phone_per_event
on event_passes(event_id, attendee_phone);

create index if not exists idx_event_passes_event_status
on event_passes(event_id, status);

create table if not exists scan_logs (
  id bigserial primary key,
  event_id uuid not null references event_settings(id) on delete cascade,
  pass_id uuid references event_passes(id) on delete set null,
  pass_code_snapshot text,
  attendee_name_snapshot text,
  admin_id uuid references admin_users(id) on delete set null,
  admin_name_snapshot text,
  input_value text not null,
  scan_channel text not null default 'camera' check (scan_channel in ('camera', 'manual')),
  result text not null,
  reason text,
  requester_ip text,
  requester_user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_scan_logs_event_created_at
on scan_logs(event_id, created_at desc);

insert into event_settings (event_name, event_slug, venue, starts_at, ends_at, timezone)
values (
  'PassDigi Live Event',
  'default-event',
  'Main Venue',
  now(),
  now() + interval '3 days',
  'Asia/Kolkata'
)
on conflict (event_slug) do nothing;
