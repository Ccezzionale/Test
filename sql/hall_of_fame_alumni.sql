-- Alumni per Hall of Fame / Lega degli Eroi.
-- Aggiunge tabelle e bucket nuovi senza modificare i risultati storici.
create table if not exists public.hall_of_fame_alumni (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 90),
  seasons text check (seasons is null or length(seasons) <= 70),
  trophy_count integer check (trophy_count is null or trophy_count >= 0),
  best_finish text check (best_finish is null or length(best_finish) <= 80),
  logo_url text check (logo_url is null or length(logo_url) <= 1000),
  description text not null default '',
  epitaph text not null default '',
  story text not null default '',
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hof_alumni_public_sort_idx
  on public.hall_of_fame_alumni (published, sort_order, created_at);

alter table public.hall_of_fame_alumni enable row level security;

grant select on public.hall_of_fame_alumni to anon, authenticated;
grant insert, update, delete on public.hall_of_fame_alumni to authenticated;

create policy "alumni published public read"
  on public.hall_of_fame_alumni for select to anon, authenticated
  using (published = true);

create policy "alumni admins read drafts"
  on public.hall_of_fame_alumni for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and lower(p.role) in ('admin', 'commissioner')
    )
  );

create policy "alumni admins insert"
  on public.hall_of_fame_alumni for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and lower(p.role) in ('admin', 'commissioner')
    )
  );

create policy "alumni admins update"
  on public.hall_of_fame_alumni for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and lower(p.role) in ('admin', 'commissioner')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and lower(p.role) in ('admin', 'commissioner')
    )
  );

create policy "alumni admins delete"
  on public.hall_of_fame_alumni for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and lower(p.role) in ('admin', 'commissioner')
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hof-alumni', 'hof-alumni', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Storage: lettura pubblica tramite URL, upload solo agli Admin/Commissioner.
create policy "alumni logos admin uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'hof-alumni'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and lower(p.role) in ('admin', 'commissioner')
    )
  );
