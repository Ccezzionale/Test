-- Lega degli Eroi · Waiver Wire
-- 2026-11-20 | Regola: compensative da Injury Reserve sempre dopo le altre
-- compensative normali, con priorita del waiver all'interno di ogni fascia.
-- Gli allenatori possono riordinare le loro chiamate solo entro la stessa fascia.
-- Distribuito su Supabase; questo file versiona le definizioni applicate.

CREATE OR REPLACE FUNCTION public.recalculate_compensatory_priorities(p_week integer, p_phase text, p_priority_tier text DEFAULT 'normal'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_updated integer := 0;
  v_needs_change boolean := false;
begin
  create temporary table if not exists compensatory_priority_plan (
    call_id uuid primary key,
    new_priority integer not null
  ) on commit drop;

  truncate table pg_temp.compensatory_priority_plan;

  insert into pg_temp.compensatory_priority_plan (call_id, new_priority)
  with grouped_calls as (
    select
      c.id,
      c.team_id,
      coalesce(t.name, c.team_id::text) as team_name,
      case
        when lower(coalesce(p_phase, '')) = 'conference'
          then coalesce(t.conference, 'Senza Conference')
        else 'Totale'
      end as priority_group,
      coalesce(
        (
          select min(wo.priority_number)
          from public.waiver_order wo
          where wo.week is not distinct from p_week
            and wo.phase is not distinct from p_phase
            and upper(coalesce(wo.slot, '')) = '1'
            and wo.original_team_id = c.team_id
        ),
        999999
      ) as team_rank,
      case when c.injury_reserve_id is not null or lower(coalesce(c.reason_type, '')) = 'injury_reserve'
        then 1 else 0 end as ir_bucket,
      c.priority_order,
      c.created_at
    from public.waiver_compensatory_calls c
    join public.teams t
      on t.id = c.team_id
    where c.week is not distinct from p_week
      and c.phase is not distinct from p_phase
      and coalesce(c.priority_tier, 'normal') =
          coalesce(p_priority_tier, 'normal')
      and coalesce(c.status, 'pending') <> 'cancelled'
  ),
  call_rounds as (
    select
      g.*,
      row_number() over (
        partition by g.priority_group, g.team_id, g.ir_bucket
        order by
          g.priority_order nulls last,
          g.created_at nulls last,
          g.id
      ) as call_round
    from grouped_calls g
  ),
  final_order as (
    select
      r.id,
      row_number() over (
        partition by r.priority_group
        order by
          r.ir_bucket,
          r.call_round,
          r.team_rank,
          r.team_name,
          r.id
      )::integer as new_priority
    from call_rounds r
  )
  select
    f.id,
    f.new_priority
  from final_order f;

  /*
    Se tutto è già nell'ordine corretto,
    NON toccare nessuna riga.
  */
  select exists (
    select 1
    from pg_temp.compensatory_priority_plan p
    join public.waiver_compensatory_calls c
      on c.id = p.call_id
    where c.priority_order is distinct from p.new_priority
  )
  into v_needs_change;

  if not v_needs_change then
    return 0;
  end if;

  /*
    Azzera SOLO le righe che devono davvero cambiare.
    Manteniamo la protezione contro gli scambi 1 <-> 2.
  */
  update public.waiver_compensatory_calls c
  set priority_order = null
  from pg_temp.compensatory_priority_plan p
  where c.id = p.call_id
    and c.priority_order is distinct from p.new_priority;

  /*
    Scrive il nuovo ordine SOLO sulle righe azzerate/modificate.
  */
  update public.waiver_compensatory_calls c
  set
    priority_order = p.new_priority,
    updated_at = now()
  from pg_temp.compensatory_priority_plan p
  where c.id = p.call_id
    and c.priority_order is distinct from p.new_priority;

  get diagnostics v_updated = row_count;

  return v_updated;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reorder_my_compensatory_calls(p_assignments jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_team_id uuid;
  v_first public.waiver_compensatory_calls%rowtype;
  v_settings public.waiver_settings%rowtype;
  v_assignment_count integer;
  v_existing_count integer;
  v_distinct_priority_count integer;
  v_close_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto';
  end if;

  select p.team_id
  into v_team_id
  from public.profiles p
  where p.id = auth.uid();

  if v_team_id is null then
    raise exception 'Squadra non associata al profilo';
  end if;

  if p_assignments is null
     or jsonb_typeof(p_assignments) <> 'array'
     or jsonb_array_length(p_assignments) < 2 then
    raise exception 'Servono almeno due compensative da ordinare';
  end if;

  select
    count(*),
    count(distinct (item ->> 'call_id')),
    count(distinct ((item ->> 'priority_order')::integer))
  into
    v_assignment_count,
    v_existing_count,
    v_distinct_priority_count
  from jsonb_array_elements(p_assignments) as items(item);

  if v_assignment_count <> v_existing_count
     or v_assignment_count <> v_distinct_priority_count then
    raise exception 'Ogni chiamata e ogni posizione devono comparire una sola volta';
  end if;

  select w.*
  into v_first
  from public.waiver_compensatory_calls w
  join jsonb_array_elements(p_assignments) as items(item)
    on w.id = (item ->> 'call_id')::uuid
  limit 1;

  if v_first.id is null or v_first.team_id is distinct from v_team_id then
    raise exception 'Compensativa non valida per questa squadra';
  end if;

  perform w.id
  from public.waiver_compensatory_calls w
  where w.team_id = v_team_id
    and w.week is not distinct from v_first.week
    and w.phase is not distinct from v_first.phase
    and w.priority_tier = v_first.priority_tier
    and coalesce(w.status, 'pending') <> 'cancelled'
  order by w.id
  for update;

  if exists (
    select 1
    from jsonb_array_elements(p_assignments) as items(item)
    left join public.waiver_compensatory_calls w
      on w.id = (item ->> 'call_id')::uuid
    where w.id is null
       or w.team_id is distinct from v_team_id
       or w.week is distinct from v_first.week
       or w.phase is distinct from v_first.phase
       or w.priority_tier is distinct from v_first.priority_tier
       or coalesce(w.status, 'pending') <> 'pending'
  ) then
    raise exception 'Puoi ordinare soltanto chiamate pending della stessa settimana, fase e categoria';
  end if;

  select
    count(*),
    count(distinct w.priority_order)
  into
    v_existing_count,
    v_distinct_priority_count
  from public.waiver_compensatory_calls w
  where w.team_id = v_team_id
    and w.week is not distinct from v_first.week
    and w.phase is not distinct from v_first.phase
    and w.priority_tier = v_first.priority_tier
    and coalesce(w.status, 'pending') <> 'cancelled';

  if v_existing_count <> v_assignment_count
     or v_distinct_priority_count <> v_assignment_count then
    raise exception 'Devi assegnare tutte e sole le posizioni della tua squadra';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_assignments) as items(item)
    where (item ->> 'priority_order')::integer not in (
      select w.priority_order
      from public.waiver_compensatory_calls w
      where w.team_id = v_team_id
        and w.week is not distinct from v_first.week
        and w.phase is not distinct from v_first.phase
        and w.priority_tier = v_first.priority_tier
        and coalesce(w.status, 'pending') <> 'cancelled'
    )
  ) then
    raise exception 'Puoi usare soltanto le posizioni già appartenenti alla tua squadra';
  end if;

  select *
  into v_settings
  from public.waiver_settings
  order by id desc
  limit 1;

  if v_settings.id is null
     or v_first.week is distinct from v_settings.active_week
     or v_first.phase is distinct from v_settings.active_phase then
    raise exception 'Puoi ordinare soltanto le compensative della fase attiva';
  end if;

  v_close_at := case
    when v_first.priority_tier = 'high' then
      coalesce(v_settings.high_compensatory_close_at, v_settings.slot1_close_at)
    else
      v_settings.compensatory_close_at
  end;

  if v_close_at is not null and now() >= v_close_at then
    raise exception 'La finestra per ordinare queste compensative è chiusa';
  end if;

  -- Un allenatore può riordinare le proprie chiamate all'interno della stessa
  -- categoria, senza portare un'Injury Reserve davanti a una compensativa normale.
  if exists (
    select 1
    from jsonb_array_elements(p_assignments) as items(item)
    join public.waiver_compensatory_calls source_call
      on source_call.id = (item ->> 'call_id')::uuid
    join public.waiver_compensatory_calls destination_call
      on destination_call.team_id = v_team_id
      and destination_call.week is not distinct from v_first.week
      and destination_call.phase is not distinct from v_first.phase
      and destination_call.priority_tier = v_first.priority_tier
      and coalesce(destination_call.status, 'pending') <> 'cancelled'
      and destination_call.priority_order = (item ->> 'priority_order')::integer
    where
      (source_call.injury_reserve_id is not null
        or lower(coalesce(source_call.reason_type, '')) = 'injury_reserve')
      is distinct from
      (destination_call.injury_reserve_id is not null
        or lower(coalesce(destination_call.reason_type, '')) = 'injury_reserve')
  ) then
    raise exception 'Le Injury Reserve devono rimanere dopo le altre compensative: puoi invertire soltanto chiamate dello stesso tipo';
  end if;

  with assignments as (
    select
      (item ->> 'call_id')::uuid as call_id,
      (item ->> 'priority_order')::integer as priority_order
    from jsonb_array_elements(p_assignments) as items(item)
  )
  update public.waiver_compensatory_calls w
  set priority_order = a.priority_order,
      updated_at = now()
  from assignments a
  where w.id = a.call_id;
end;
$function$
;
