
-- Automatic trophy publication for competitions that are literally standings:
-- Conference League / Championship, Round Robin and regular-season Campionato.
CREATE OR REPLACE FUNCTION public.conditional_sync_regular_titles(p_season integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE v_conf_count int;v_rr_count int;v_winners int:=0;v_champion uuid;
BEGIN
  SELECT COUNT(*) INTO v_conf_count FROM public.conditional_official_standings
    WHERE season=p_season AND scope='conference' AND is_final;
  SELECT COUNT(*) INTO v_rr_count FROM public.conditional_official_standings
    WHERE season=p_season AND scope='round_robin' AND is_final;

  IF v_conf_count=16 THEN
    INSERT INTO public.conditional_official_trophies(
      season,competition_id,status,winner_team_id,finalized_at,updated_at)
    SELECT p_season,
      CASE WHEN t.conference='Conference League' THEN 'conference_league'
           ELSE 'conference_championship' END,
      'final',s.team_id,now(),now()
    FROM public.conditional_official_standings s
    JOIN public.teams t ON t.id=s.team_id
    WHERE s.season=p_season AND s.scope='conference' AND s.is_final AND s.position=1
    ON CONFLICT(season,competition_id) DO UPDATE SET
      status='final',winner_team_id=EXCLUDED.winner_team_id,
      finalized_at=EXCLUDED.finalized_at,updated_at=now()
    WHERE public.conditional_official_trophies.winner_team_id IS NULL
      OR public.conditional_official_trophies.winner_team_id=EXCLUDED.winner_team_id;
    v_winners:=v_winners+2;
  END IF;

  IF v_rr_count=16 THEN
    INSERT INTO public.conditional_official_trophies(
      season,competition_id,status,winner_team_id,finalized_at,updated_at)
    SELECT p_season,'round_robin','final',s.team_id,now(),now()
    FROM public.conditional_official_standings s
    WHERE s.season=p_season AND s.scope='round_robin' AND s.is_final AND s.position=1
    ON CONFLICT(season,competition_id) DO UPDATE SET
      status='final',winner_team_id=EXCLUDED.winner_team_id,
      finalized_at=EXCLUDED.finalized_at,updated_at=now()
    WHERE public.conditional_official_trophies.winner_team_id IS NULL
      OR public.conditional_official_trophies.winner_team_id=EXCLUDED.winner_team_id;
    v_winners:=v_winners+1;
  END IF;

  IF v_conf_count=16 AND v_rr_count=16 THEN
    WITH games AS (
      SELECT t.id,t.name,r.points_for,r.points_against,
        CASE WHEN r.points_for<66 THEN 0 ELSE 1+floor((r.points_for-66)/6)::int END gf,
        CASE WHEN r.points_against<66 THEN 0 ELSE 1+floor((r.points_against-66)/6)::int END ga
      FROM public.teams t JOIN public.fantacalcio_results r
        ON regexp_replace(translate(lower(trim(t.name)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
          =regexp_replace(translate(lower(trim(r.team)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
      WHERE r.phase='Regular' AND r.conference IN ('Conf A','Conf B','Unificata')
    ), total AS (
      SELECT id,name,
        SUM(CASE WHEN gf>ga THEN 3 WHEN gf=ga THEN 1 ELSE 0 END) points,
        SUM(points_for) magic,SUM(gf) gf,SUM(ga) ga
      FROM games GROUP BY id,name
    )
    SELECT id INTO v_champion FROM total
      ORDER BY points DESC,magic DESC,gf DESC,ga ASC,name ASC LIMIT 1;
    IF v_champion IS NOT NULL THEN
      INSERT INTO public.conditional_official_trophies(
        season,competition_id,status,winner_team_id,finalized_at,updated_at)
      VALUES(p_season,'campionato','final',v_champion,now(),now())
      ON CONFLICT(season,competition_id) DO UPDATE SET
        status='final',winner_team_id=EXCLUDED.winner_team_id,
        finalized_at=EXCLUDED.finalized_at,updated_at=now()
      WHERE public.conditional_official_trophies.winner_team_id IS NULL
        OR public.conditional_official_trophies.winner_team_id=EXCLUDED.winner_team_id;
      v_winners:=v_winners+1;
    END IF;
  END IF;
  RETURN v_winners;
END
$$;

CREATE OR REPLACE FUNCTION public.conditional_after_final_standings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE v_season integer;
BEGIN
  -- Snapshots are imported for exactly one future-pick season at a time.
  SELECT MAX(season) INTO v_season FROM public.conditional_official_standings
    WHERE is_final;
  IF v_season IS NOT NULL THEN
    PERFORM public.conditional_sync_regular_titles(v_season);
  END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER conditional_after_standings_publish_titles
AFTER INSERT OR UPDATE ON public.conditional_official_standings
FOR EACH STATEMENT EXECUTE FUNCTION public.conditional_after_final_standings();

REVOKE ALL ON FUNCTION public.conditional_sync_regular_titles(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.conditional_after_final_standings() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conditional_sync_regular_titles(integer) TO service_role;
