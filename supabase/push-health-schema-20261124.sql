-- Push Health: isolated diagnostics, no changes to existing notification dispatch.
create table if not exists public.push_health_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  device_kind text not null check (device_kind in ('iOS','Android','Desktop','Altro')),
  status text not null check (status in ('active','repair-needed','check-error','permission-denied','permission-default','local-missing','unsupported','opted-out')),
  checked_at timestamptz not null default now(),
  primary key(user_id,device_id)
);
create table if not exists public.push_health_tests (
  target_user_id uuid not null references auth.users(id) on delete cascade,
  bucket bigint not null,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  accepted integer not null default 0,
  failed integer not null default 0,
  expired integer not null default 0,
  primary key(target_user_id,bucket)
);
alter table public.push_health_devices enable row level security;
alter table public.push_health_tests enable row level security;
revoke all on public.push_health_devices, public.push_health_tests from anon, authenticated, public;
grant select,insert,update,delete on public.push_health_devices, public.push_health_tests to service_role;
create index if not exists push_health_devices_checked_idx on public.push_health_devices(checked_at);
create index if not exists push_health_tests_requested_idx on public.push_health_tests(requested_at desc);
