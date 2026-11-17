
-- Hall of Fame is the SOLE authority for trophy-based conditional trades.
-- A title becomes final only when the admin's existing
-- hof_finalize_competition() writes hall_of_fame_finalizations.
-- Season format Hall of Fame 2026-2027 => future-pick season 2027.
-- Do not infer a trophy winner from bracket/standings in parallel.

DROP TRIGGER IF EXISTS conditional_after_standings_publish_titles
  ON public.conditional_official_standings;
DROP TRIGGER IF EXISTS conditional_after_highlander_eliminations
  ON public.highlander_eliminations;

-- Older experimental automations are no longer callable by public clients
-- or the Data API (they are preserved only in schema history).
REVOKE ALL ON FUNCTION public.conditional_sync_regular_titles(integer)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.conditional_sync_highlander_result()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.conditional_hof_competition_key(p_key text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='public','pg_temp'
AS $$
  SELECT CASE p_key
    WHEN 'playoff' THEN 'playoff'
    WHEN 'campionato' THEN 'campionato'
    WHEN 'crash_out_cup' THEN 'crash_out'
    WHEN 'highlander' THEN 'highlander'
    WHEN 'conference_league' THEN 'conference_league'
    WHEN 'conference_championship' THEN 'conference_championship'
    WHEN 'round_robin' THEN 'round_robin'
    WHEN 'supercoppa' THEN 'supercoppa'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.conditional_hof_normalize_team(p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='public','pg_temp'
AS $$
  SELECT regexp_replace(
    translate(lower(btrim(COALESCE(p_name,''))),
      'àáâäèéêëìíîïòóôöùúûü','aaaaeeeeiiiioooouuuu'),
    '[^a-z0-9]', '', 'g'
  );
$$;

-- The existing Hall of Fame supports reopening/correcting a result.
-- Never silently undo an already-settled conditional trade.
-- Block correction/reopening if a finished title influenced a settled right.
CREATE OR REPLACE FUNCTION public.conditional_hof_guard_finalized_title_change()
RETURNS trigger
LANGUAGE plpgsql SET search_path='public','pg_temp'
AS $$
DECLARE
  v_season integer;
  v_comp text;
  v_changed boolean;
BEGIN
  IF TG_OP='UPDATE' THEN
    v_changed:=NEW.season IS DISTINCT FROM OLD.season
      OR NEW.competition_key IS DISTINCT FROM OLD.competition_key
      OR NEW.podium IS DISTINCT FROM OLD.podium;
    IF NOT v_changed THEN RETURN NEW; END IF;
  END IF;
  v_comp:=public.conditional_hof_competition_key(OLD.competition_key);
  IF v_comp IS NULL THEN
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF OLD.season !~ '^[0-9]{4}-[0-9]{4}$' THEN
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;
  v_season:=right(OLD.season,4)::int;

  IF EXISTS (
    SELECT 1
    FROM public.conditional_trade_rights r
    WHERE r.season=v_season
      AND r.status='resolved'
      AND r.rule_kind='trophy'
      AND (
        (r.rule_spec->>'mode'='specific_trophy'
         AND r.rule_spec->>'competition_id'=v_comp)
        OR
        (r.rule_spec->>'mode'='any_trophy'
         AND r.rule_spec->'eligible_competition_ids' ? v_comp)
      )
  ) THEN
    RAISE EXCEPTION 'Trofeo già utilizzato per liquidare una trade condizionata: la riapertura richiede una rettifica amministrativa delle pick.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.conditional_hof_finalization_sync()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE
  v_comp text;
  v_season integer;
  v_current_season integer;
  v_winner_name text;
  v_winner_id uuid;
  v_matches integer;
  v_winners integer;
BEGIN
  v_comp:=public.conditional_hof_competition_key(
    CASE WHEN TG_OP='DELETE' THEN OLD.competition_key ELSE NEW.competition_key END
  );
  IF v_comp IS NULL THEN
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;
  v_season:=right(
    CASE WHEN TG_OP='DELETE' THEN OLD.season ELSE NEW.season END,4)::int;
  SELECT future_pick_season INTO v_current_season
  FROM public.trade_settings WHERE id=1;
  -- Historical Hall of Fame records belong to discontinued rosters,
  -- never assign a 2027 pick based on a 2025-2026 title.
  IF v_season IS DISTINCT FROM v_current_season THEN
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP='DELETE' THEN
    UPDATE public.conditional_official_trophies
      SET status='in_progress',winner_team_id=NULL,
          finalized_at=NULL,updated_at=now()
    WHERE season=v_season AND competition_id=v_comp;
    RETURN OLD;
  END IF;

  IF NEW.podium IS NULL OR jsonb_typeof(NEW.podium)<>'array' THEN
    RAISE EXCEPTION 'Podio della Hall of Fame non valido.';
  END IF;
  SELECT COUNT(*),MIN(btrim(item->>'team_name'))
  INTO v_winners,v_winner_name
  FROM jsonb_array_elements(NEW.podium) item
  WHERE (item->>'position')::integer=1;
  IF v_winners<>1 OR v_winner_name IS NULL OR v_winner_name='' THEN
    RAISE EXCEPTION 'La finalizzazione deve contenere un unico campione al primo posto.';
  END IF;
  SELECT COUNT(*),MIN(id) INTO v_matches,v_winner_id
  FROM public.teams
  WHERE public.conditional_hof_normalize_team(name)
        =public.conditional_hof_normalize_team(v_winner_name);
  IF v_matches<>1 THEN
    RAISE EXCEPTION 'Impossibile identificare in modo univoco il campione "%" nelle franchigie attuali.',v_winner_name;
  END IF;

  INSERT INTO public.conditional_official_trophies(
    season,competition_id,status,winner_team_id,finalized_at,updated_at
  ) VALUES(
    v_season,v_comp,'final',v_winner_id,NEW.finalized_at,now()
  )
  ON CONFLICT(season,competition_id) DO UPDATE SET
    status='final',winner_team_id=EXCLUDED.winner_team_id,
    finalized_at=EXCLUDED.finalized_at,updated_at=now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER conditional_hof_before_reopen_or_correct
BEFORE DELETE OR UPDATE ON public.hall_of_fame_finalizations
FOR EACH ROW EXECUTE FUNCTION public.conditional_hof_guard_finalized_title_change();

CREATE TRIGGER conditional_hof_after_finalize
AFTER INSERT OR UPDATE OR DELETE ON public.hall_of_fame_finalizations
FOR EACH ROW EXECUTE FUNCTION public.conditional_hof_finalization_sync();

REVOKE ALL ON FUNCTION public.conditional_hof_competition_key(text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.conditional_hof_normalize_team(text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.conditional_hof_guard_finalized_title_change()
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.conditional_hof_finalization_sync()
  FROM PUBLIC,anon,authenticated;
