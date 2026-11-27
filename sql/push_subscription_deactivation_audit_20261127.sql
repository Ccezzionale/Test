-- Push deactivation history; applied to the production database on 2026-11-27.
alter table public.push_subscriptions
  add column if not exists disabled_reason text,
  add column if not exists disabled_source text,
  add column if not exists disabled_at timestamptz;
create table if not exists public.push_subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null,
  user_id uuid not null,
  occurred_at timestamptz not null default now(),
  reason text not null,
  source text not null
);
alter table public.push_subscription_events enable row level security;
revoke all on table public.push_subscription_events from public, anon, authenticated;
grant select,insert on table public.push_subscription_events to service_role;
create index if not exists push_subscription_events_user_time_idx on public.push_subscription_events(user_id, occurred_at desc);
create or replace function public.record_push_subscription_deactivation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.is_active and not new.is_active then
    new.disabled_at := clock_timestamp();
    new.disabled_reason := coalesce(nullif(new.disabled_reason,''),'unknown');
    new.disabled_source := coalesce(nullif(new.disabled_source,''),'unclassified');
    insert into public.push_subscription_events(subscription_id,user_id,occurred_at,reason,source)
    values(new.id,new.user_id,new.disabled_at,new.disabled_reason,new.disabled_source);
  elsif new.is_active then
    new.disabled_at := null;
    new.disabled_reason := null;
    new.disabled_source := null;
  elsif not old.is_active and not new.is_active then
    new.disabled_at := old.disabled_at;
    new.disabled_reason := old.disabled_reason;
    new.disabled_source := old.disabled_source;
  end if;
  return new;
end;
$$;
revoke all on function public.record_push_subscription_deactivation() from public,anon,authenticated;
grant execute on function public.record_push_subscription_deactivation() to service_role;
drop trigger if exists record_push_subscription_deactivation on public.push_subscriptions;
create trigger record_push_subscription_deactivation before update of is_active on public.push_subscriptions
for each row execute function public.record_push_subscription_deactivation();
