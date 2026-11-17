
-- Highlander result adapter: the winner exists only when all other
-- registered franchises have been eliminated. No guessed finalist.
CREATE OR REPLACE FUNCTION public.conditional_sync_highlander_result()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE
  v_source_season text;
  v_pick_season integer;
  v_team_count integer;
  v_eliminated integer;
  v_survivor_id uuid;
  v_survivors integer;
BEGIN
  SELECT MAX(season) INTO v_source_season
    FROM public.highlander_eliminations WHERE season ~ '^[0-9]{4}$';
  IF v_source_season IS NULL THEN RETURN jsonb_build_object('status','pending','reason','no_eliminations'); END IF;
  v_pick_season:=v_source_season::int+1;
  SELECT COUNT(*) INTO v_team_count FROM public.teams;
  SELECT COUNT(DISTINCT regexp_replace(
      translate(lower(trim(team_name)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g'))
    INTO v_eliminated FROM public.highlander_eliminations
    WHERE season=v_source_season;
  IF v_team_count<2 OR v_eliminated<>v_team_count-1 THEN
    RETURN jsonb_build_object('status','pending','eliminated',v_eliminated,'teams',v_team_count);
  END IF;
  SELECT COUNT(*), MIN(t.id) INTO v_survivors,v_survivor_id
  FROM public.teams t
  WHERE NOT EXISTS(
    SELECT 1 FROM public.highlander_eliminations e
    WHERE e.season=v_source_season
      AND regexp_replace(translate(lower(trim(e.team_name)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
       =regexp_replace(translate(lower(trim(t.name)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
  );
  IF v_survivors<>1 THEN
    RETURN jsonb_build_object('status','pending','reason','unmatched_team_names');
  END IF;
  INSERT INTO public.conditional_official_trophies(
    season,competition_id,status,winner_team_id,finalized_at,updated_at)
  VALUES(v_pick_season,'highlander','final',v_survivor_id,now(),now())
  ON CONFLICT(season,competition_id) DO UPDATE
    SET status='final',winner_team_id=EXCLUDED.winner_team_id,
        finalized_at=EXCLUDED.finalized_at,updated_at=now()
    WHERE public.conditional_official_trophies.winner_team_id IS NULL
       OR public.conditional_official_trophies.winner_team_id=EXCLUDED.winner_team_id;
  RETURN jsonb_build_object('status','final','season',v_pick_season,'winner_team_id',v_survivor_id);
END
$$;

CREATE OR REPLACE FUNCTION public.conditional_after_highlander_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
BEGIN
  PERFORM public.conditional_sync_highlander_result();
  RETURN NULL;
END
$$;
CREATE TRIGGER conditional_after_highlander_eliminations
AFTER INSERT OR UPDATE OR DELETE ON public.highlander_eliminations
FOR EACH STATEMENT EXECUTE FUNCTION public.conditional_after_highlander_update();
REVOKE ALL ON FUNCTION public.conditional_sync_highlander_result() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.conditional_after_highlander_update() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conditional_sync_highlander_result() TO service_role;
