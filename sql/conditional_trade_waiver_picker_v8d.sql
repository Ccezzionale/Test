
-- Read-only trade chooser: reveal only currently tradable waiver packages
-- owned by the two participants in the same conference.
CREATE OR REPLACE FUNCTION public.conditional_available_waiver_calls(
 p_owner_team_id uuid,p_weeks_ahead integer DEFAULT 14
)
RETURNS TABLE(asset_id text, week integer, origin_team_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE v_auth_team uuid;v_auth_conf text;v_owner_conf text;v_phase text;
BEGIN
  SELECT team_id INTO v_auth_team FROM public.profiles WHERE id=auth.uid();
  IF v_auth_team IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta.'; END IF;
  SELECT conference INTO v_auth_conf FROM public.teams WHERE id=v_auth_team;
  SELECT conference INTO v_owner_conf FROM public.teams WHERE id=p_owner_team_id;
  IF v_auth_conf IS NULL OR v_owner_conf IS NULL OR v_auth_conf<>v_owner_conf
    OR v_auth_team=p_owner_team_id AND false THEN
    RAISE EXCEPTION 'Le chiamate possono essere visualizzate solo fra franchigie della stessa Conference.';
  END IF;
  IF (SELECT active_phase FROM public.trade_settings WHERE id=1)
     NOT IN ('conference_market','round_robin_market') THEN
    RETURN;
  END IF;
  SELECT active_phase INTO v_phase FROM public.waiver_settings ORDER BY id DESC LIMIT 1;
  IF v_phase IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH weeks AS (
    SELECT generate_series(s.active_week,s.active_week+LEAST(GREATEST(p_weeks_ahead,0),14))::int n
    FROM public.waiver_settings s ORDER BY s.id DESC LIMIT 1
  )
  SELECT v_phase||':'||w.n||':'||t.id::text AS asset_id,
    w.n,t.name AS origin_team_name
  FROM weeks w CROSS JOIN public.teams t
  WHERE public.waiver_call_right_owner(v_phase,w.n,t.id)=p_owner_team_id
    AND (lower(v_phase)<>'conference' OR t.conference=v_owner_conf)
    AND public.waiver_call_package_block_reason(v_phase,w.n,t.id) IS NULL
  ORDER BY w.n,t.name LIMIT 120;
END $$;
REVOKE ALL ON FUNCTION public.conditional_available_waiver_calls(uuid,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.conditional_available_waiver_calls(uuid,integer)
  TO authenticated;
