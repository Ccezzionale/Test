
-- Safe end-of-regular-season importer. It NEVER publishes a final position
-- while any team is missing a required game (14 Conference, 15 Round Robin).
CREATE OR REPLACE FUNCTION public.conditional_sync_regular_results()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE
  v_season integer;
  v_conf_ready boolean:=false;
  v_rr_ready boolean:=false;
  v_result jsonb;
BEGIN
  SELECT future_pick_season INTO v_season FROM public.trade_settings WHERE id=1;
  IF v_season IS NULL THEN RETURN jsonb_build_object('status','missing_season'); END IF;
  WITH games AS (
    SELECT t.id,t.conference,COUNT(DISTINCT r.gw) AS n,
      COUNT(DISTINCT r.gw) FILTER(WHERE r.points_for IS NOT NULL
        AND r.points_against IS NOT NULL AND (r.points_for<>0 OR r.points_against<>0)) AS valid_n
    FROM public.teams t
    LEFT JOIN public.fantacalcio_results r
      ON regexp_replace(translate(lower(trim(t.name)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
         =regexp_replace(translate(lower(trim(r.team)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
      AND r.phase='Regular' AND r.conference IN ('Conf A','Conf B')
    GROUP BY t.id,t.conference
  )
  SELECT COUNT(*)=16 AND MIN(n)=14 AND MAX(n)=14 AND MIN(valid_n)=14 AND MAX(valid_n)=14
    AND COUNT(*) FILTER(WHERE conference='Conference League')=8
    AND COUNT(*) FILTER(WHERE conference='Conference Championship')=8
  INTO v_conf_ready FROM games;

  WITH games AS (
    SELECT t.id,COUNT(DISTINCT r.gw) AS n,
      COUNT(DISTINCT r.gw) FILTER(WHERE r.points_for IS NOT NULL
        AND r.points_against IS NOT NULL AND (r.points_for<>0 OR r.points_against<>0)) AS valid_n
    FROM public.teams t
    LEFT JOIN public.fantacalcio_results r
      ON regexp_replace(translate(lower(trim(t.name)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
         =regexp_replace(translate(lower(trim(r.team)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
      AND r.phase='Regular' AND r.conference='Unificata'
    GROUP BY t.id
  )
  SELECT COUNT(*)=16 AND MIN(n)=15 AND MAX(n)=15 AND MIN(valid_n)=15 AND MAX(valid_n)=15
  INTO v_rr_ready FROM games;

  IF COALESCE(v_conf_ready,false) THEN
    WITH games AS (
      SELECT t.id,t.name,t.conference,r.points_for,r.points_against,
        CASE WHEN r.points_for<66 THEN 0 ELSE 1+floor((r.points_for-66)/6)::int END gf,
        CASE WHEN r.points_against<66 THEN 0 ELSE 1+floor((r.points_against-66)/6)::int END ga
      FROM public.teams t JOIN public.fantacalcio_results r
        ON regexp_replace(translate(lower(trim(t.name)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
          =regexp_replace(translate(lower(trim(r.team)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
      WHERE r.phase='Regular' AND r.conference IN ('Conf A','Conf B')
    ), totals AS (
      SELECT id,name,conference,
        SUM(CASE WHEN gf>ga THEN 3 WHEN gf=ga THEN 1 ELSE 0 END) points,
        SUM(points_for) magic,SUM(gf) gf,SUM(ga) ga
      FROM games GROUP BY id,name,conference
    ), ranked AS (
      SELECT id,ROW_NUMBER() OVER (
        PARTITION BY conference ORDER BY points DESC,magic DESC,gf DESC,ga ASC,name ASC
      ) AS place FROM totals
    )
    INSERT INTO public.conditional_official_standings(season,scope,team_id,position,is_final,updated_at)
      SELECT v_season,'conference',id,place,true,now() FROM ranked
    ON CONFLICT (season,scope,team_id) DO UPDATE SET
      position=EXCLUDED.position,is_final=true,updated_at=now();
  END IF;

  IF COALESCE(v_rr_ready,false) THEN
    WITH games AS (
      SELECT t.id,t.name,r.points_for,r.points_against,
        CASE WHEN r.points_for<66 THEN 0 ELSE 1+floor((r.points_for-66)/6)::int END gf,
        CASE WHEN r.points_against<66 THEN 0 ELSE 1+floor((r.points_against-66)/6)::int END ga
      FROM public.teams t JOIN public.fantacalcio_results r
        ON regexp_replace(translate(lower(trim(t.name)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
          =regexp_replace(translate(lower(trim(r.team)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
      WHERE r.phase='Regular' AND r.conference='Unificata'
    ), totals AS (
      SELECT id,name,
        SUM(CASE WHEN gf>ga THEN 3 WHEN gf=ga THEN 1 ELSE 0 END) points,
        SUM(points_for) magic,SUM(gf) gf,SUM(ga) ga
      FROM games GROUP BY id,name
    ), ranked AS (
      SELECT id,ROW_NUMBER() OVER (
        ORDER BY points DESC,magic DESC,gf DESC,ga ASC,name ASC
      ) AS place FROM totals
    )
    INSERT INTO public.conditional_official_standings(season,scope,team_id,position,is_final,updated_at)
      SELECT v_season,'round_robin',id,place,true,now() FROM ranked
    ON CONFLICT (season,scope,team_id) DO UPDATE SET
      position=EXCLUDED.position,is_final=true,updated_at=now();
  END IF;

  IF COALESCE(v_conf_ready,false) AND COALESCE(v_rr_ready,false) THEN
    WITH games AS (
      SELECT t.id,t.name,t.conference,r.points_for,r.points_against,
        CASE WHEN r.points_for<66 THEN 0 ELSE 1+floor((r.points_for-66)/6)::int END gf,
        CASE WHEN r.points_against<66 THEN 0 ELSE 1+floor((r.points_against-66)/6)::int END ga
      FROM public.teams t JOIN public.fantacalcio_results r
        ON regexp_replace(translate(lower(trim(t.name)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
          =regexp_replace(translate(lower(trim(r.team)),'áàèéíìòóúù','aaeeiioouu'),'\s+','','g')
      WHERE r.phase='Regular' AND r.conference IN ('Conf A','Conf B','Unificata')
    ), totals AS (
      SELECT id,name,conference,
        SUM(CASE WHEN gf>ga THEN 3 WHEN gf=ga THEN 1 ELSE 0 END) points,
        SUM(points_for) magic,SUM(gf) gf,SUM(ga) ga
      FROM games GROUP BY id,name,conference
    ), positions AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY conference ORDER BY points ASC,magic ASC,gf ASC,ga DESC,name DESC
        ) AS worst_first
      FROM totals
    )
    INSERT INTO public.conditional_official_pick_positions(
      season,pick_id,round_position,is_final,updated_at)
    SELECT fp.season,fp.id,
      CASE WHEN fp.round%2=1 THEN pos.worst_first::int ELSE (9-pos.worst_first)::int END,
      true,now()
    FROM public.future_draft_picks fp
    JOIN positions pos ON pos.id=fp.original_team_id
    WHERE fp.season=v_season AND fp.status='active' AND COALESCE(fp.pick_kind,'normal')='normal'
    ON CONFLICT(season,pick_id) DO UPDATE SET
      round_position=EXCLUDED.round_position,is_final=true,updated_at=now();
  END IF;
  RETURN jsonb_build_object('conference_final',COALESCE(v_conf_ready,false),
    'round_robin_final',COALESCE(v_rr_ready,false),'season',v_season);
END
$$;

CREATE OR REPLACE FUNCTION public.conditional_refresh_results_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
BEGIN
  PERFORM public.conditional_sync_regular_results();
  RETURN NULL;
END
$$;
CREATE TRIGGER conditional_after_results_import
AFTER INSERT OR UPDATE OR DELETE ON public.fantacalcio_results
FOR EACH STATEMENT EXECUTE FUNCTION public.conditional_refresh_results_trigger();

REVOKE ALL ON FUNCTION public.conditional_sync_regular_results() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.conditional_refresh_results_trigger() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conditional_sync_regular_results() TO service_role;
