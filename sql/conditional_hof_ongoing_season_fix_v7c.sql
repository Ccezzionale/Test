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
  IF v_season IS DISTINCT FROM v_current_season
     AND NOT EXISTS (
       SELECT 1 FROM public.conditional_trade_rights
       WHERE season=v_season
     ) THEN
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
  SELECT COUNT(*),MIN(id::text)::uuid INTO v_matches,v_winner_id
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

