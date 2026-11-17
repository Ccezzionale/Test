
-- Atomic conditional trade offers. This module deliberately does NOT replace
-- accept_trade(), preserving all legacy trade and player rules.
CREATE OR REPLACE FUNCTION public.conditional_market_check(p_a uuid,p_b uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE v_settings record; v_ca text; v_cb text;
BEGIN
  SELECT * INTO v_settings FROM public.trade_settings WHERE id=1;
  IF NOT FOUND OR NOT COALESCE(v_settings.market_open,false) THEN
    RAISE EXCEPTION 'Mercato chiuso.';
  END IF;
  IF v_settings.market_open_at IS NOT NULL AND clock_timestamp()<v_settings.market_open_at THEN
    RAISE EXCEPTION 'La finestra del mercato non è ancora aperta.';
  END IF;
  IF v_settings.market_close_at IS NOT NULL AND clock_timestamp()>v_settings.market_close_at THEN
    RAISE EXCEPTION 'La finestra del mercato è terminata.';
  END IF;
  IF p_a=p_b OR p_a IS NULL OR p_b IS NULL THEN
    RAISE EXCEPTION 'Servono due franchigie diverse.';
  END IF;
  SELECT conference INTO v_ca FROM public.teams WHERE id=p_a;
  SELECT conference INTO v_cb FROM public.teams WHERE id=p_b;
  IF v_ca IS NULL OR v_cb IS NULL THEN
    RAISE EXCEPTION 'Franchigia non valida.';
  END IF;
  -- Cross-conference conversion of conditional rights is still not supported:
  -- avoid silently bypassing the existing bonus inter-conference mechanics.
  IF v_ca IS DISTINCT FROM v_cb THEN
    RAISE EXCEPTION 'Trade condizionata fra Conference diverse non ancora supportata.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.conditional_validate_terms(
 p_grantor uuid,p_holder uuid,p_rule_kind text,p_rule jsonb,
 p_candidates uuid[],p_counter_pick uuid,p_existing_right uuid DEFAULT NULL
)
RETURNS TABLE(season integer,draft_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE
  v_settings record;
  v_first record;
  v_pick record;
  v_counter record;
  v_right record;
  v_len integer;
  v_round integer;
  v_scope text;
  v_subject uuid;
  v_n integer;
  v_top integer;
  v_bottom integer;
  v_id uuid;
  v_mode text;
  v_trophy text;
  v_subject_conf text;
  v_valid_trophies text[] := ARRAY[
   'playoff','campionato','crash_out','highlander','conference_league',
   'conference_championship','round_robin','supercoppa'];
BEGIN
  PERFORM public.conditional_market_check(p_grantor,p_holder);
  SELECT * INTO v_settings FROM public.trade_settings WHERE id=1;
  SELECT * INTO v_counter FROM public.future_draft_picks
    WHERE id=p_counter_pick;
  IF NOT FOUND OR v_counter.owner_team_id<>p_holder OR v_counter.status IS DISTINCT FROM 'active'
     OR COALESCE(v_counter.pick_kind,'normal')<>'normal'
     OR v_counter.season<>v_settings.future_pick_season
  THEN
    RAISE EXCEPTION 'La pick di contropartita non è più disponibile presso la franchigia indicata.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.conditional_trade_candidates WHERE pick_id=p_counter_pick AND is_locked) THEN
    RAISE EXCEPTION 'La pick di contropartita è già vincolata a un diritto.';
  END IF;
  IF p_rule_kind='right_transfer' THEN
    IF p_existing_right IS NULL THEN
      RAISE EXCEPTION 'Diritto originale obbligatorio per la rivendita.';
    END IF;
    IF COALESCE(array_length(p_candidates,1),0)<>0 THEN
      RAISE EXCEPTION 'La rivendita trasferisce il diritto, non le pick candidate.';
    END IF;
    SELECT * INTO v_right FROM public.conditional_trade_rights WHERE id=p_existing_right;
    IF NOT FOUND OR v_right.status<>'active' OR v_right.holder_team_id<>p_grantor THEN
      RAISE EXCEPTION 'Il diritto non è più attivo o non appartiene al venditore.';
    END IF;
    IF v_counter.draft_name<>v_right.draft_name OR v_counter.season<>v_right.season THEN
      RAISE EXCEPTION 'La pick di contropartita non appartiene al Draft del diritto.';
    END IF;
    RETURN QUERY SELECT v_right.season,v_right.draft_name;
    RETURN;
  END IF;
  IF p_rule_kind NOT IN ('standing','ranked','trophy') OR p_existing_right IS NOT NULL THEN
    RAISE EXCEPTION 'Tipo di condizione non valido.';
  END IF;
  IF p_rule IS NULL OR jsonb_typeof(p_rule)<>'object' THEN
    RAISE EXCEPTION 'Clausola della trade non valida.';
  END IF;
  v_len:=COALESCE(array_length(p_candidates,1),0);
  IF v_len<2 OR v_len>8 OR (SELECT COUNT(DISTINCT u) FROM unnest(p_candidates) AS u)<>v_len THEN
    RAISE EXCEPTION 'Servono da 2 a 8 pick candidate diverse.';
  END IF;
  SELECT * INTO v_first FROM public.future_draft_picks WHERE id=p_candidates[1];
  IF NOT FOUND THEN RAISE EXCEPTION 'Pick candidata non trovata.'; END IF;
  v_round:=v_first.round;
  FOR v_pick IN
    SELECT * FROM public.future_draft_picks WHERE id=ANY(p_candidates) ORDER BY id
  LOOP
    IF v_pick.owner_team_id<>p_grantor OR v_pick.status IS DISTINCT FROM 'active'
       OR COALESCE(v_pick.pick_kind,'normal')<>'normal'
       OR v_pick.season<>v_settings.future_pick_season
       OR v_pick.draft_name<>v_first.draft_name
    THEN
      RAISE EXCEPTION 'Una pick candidata non è disponibile presso il proprietario o appartiene a un Draft differente.';
    END IF;
    IF p_rule_kind='ranked' AND v_pick.round<>v_round THEN
      RAISE EXCEPTION 'Per migliore/peggiore le pick devono essere tutte dello stesso round.';
    END IF;
    IF EXISTS(SELECT 1 FROM public.conditional_trade_candidates WHERE pick_id=v_pick.id AND is_locked) THEN
      RAISE EXCEPTION 'Una pick candidata è già vincolata a un diritto.';
    END IF;
  END LOOP;
  IF (SELECT COUNT(*) FROM public.future_draft_picks WHERE id=ANY(p_candidates))<>v_len THEN
    RAISE EXCEPTION 'Una o più pick candidate non esistono.';
  END IF;
  IF v_counter.draft_name<>v_first.draft_name THEN
    RAISE EXCEPTION 'Per questa versione le pick devono appartenere alla stessa Conference.';
  END IF;
  IF p_rule_kind='ranked' THEN
    IF p_rule->>'which' NOT IN ('worst','best') THEN
      RAISE EXCEPTION 'Indicare la scelta migliore o peggiore.';
    END IF;
  ELSIF p_rule_kind='standing' THEN
    v_scope:=p_rule->>'scope';
    v_subject:=NULLIF(p_rule->>'subject_team_id','')::uuid;
    v_top:=(p_rule->>'top_count')::int;
    v_bottom:=(p_rule->>'bottom_count')::int;
    IF v_subject IS NULL OR v_scope NOT IN ('conference','round_robin')
       OR v_top IS NULL OR v_bottom IS NULL OR v_top<1 OR v_bottom<1 THEN
      RAISE EXCEPTION 'Condizione sulla classifica incompleta.';
    END IF;
    SELECT conference INTO v_subject_conf FROM public.teams WHERE id=v_subject;
    IF NOT FOUND THEN RAISE EXCEPTION 'Squadra della classifica non trovata.'; END IF;
    SELECT COUNT(*) INTO v_n FROM public.teams
      WHERE v_scope='round_robin' OR conference=v_subject_conf;
    IF v_top+v_bottom>v_n THEN
      RAISE EXCEPTION 'Le fasce della classifica si sovrappongono.';
    END IF;
    FOREACH v_id IN ARRAY ARRAY[
      NULLIF(p_rule->>'top_pick_id','')::uuid,
      NULLIF(p_rule->>'bottom_pick_id','')::uuid
    ] LOOP
      IF v_id IS NULL OR NOT (v_id=ANY(p_candidates)) THEN
        RAISE EXCEPTION 'La clausola deve indicare pick possedute per entrambe le fasce.';
      END IF;
    END LOOP;
    IF v_top+v_bottom<v_n AND
       (NULLIF(p_rule->>'middle_pick_id','') IS NULL OR
        NOT ((p_rule->>'middle_pick_id')::uuid=ANY(p_candidates))) THEN
      RAISE EXCEPTION 'È necessaria una scelta anche per i piazzamenti intermedi.';
    END IF;
  ELSIF p_rule_kind='trophy' THEN
    v_mode:=p_rule->>'mode';
    v_subject:=NULLIF(p_rule->>'subject_team_id','')::uuid;
    IF v_subject IS NULL OR v_mode NOT IN ('any_trophy','specific_trophy') THEN
      RAISE EXCEPTION 'Clausola premio non valida.';
    END IF;
    SELECT conference INTO v_subject_conf FROM public.teams WHERE id=v_subject;
    IF NOT FOUND THEN RAISE EXCEPTION 'Squadra del trofeo non trovata.'; END IF;
    IF v_len<>2 THEN
      RAISE EXCEPTION 'La condizione premio richiede due pick alternative.';
    END IF;
    FOREACH v_id IN ARRAY ARRAY[
      NULLIF(p_rule->>'won_pick_id','')::uuid,
      NULLIF(p_rule->>'not_won_pick_id','')::uuid
    ] LOOP
      IF v_id IS NULL OR NOT(v_id=ANY(p_candidates)) THEN
        RAISE EXCEPTION 'Mancano le pick per vittoria e mancata vittoria.';
      END IF;
    END LOOP;
    IF p_rule->>'won_pick_id'=p_rule->>'not_won_pick_id' THEN
      RAISE EXCEPTION 'Le due pick devono essere differenti.';
    END IF;
    IF v_mode='specific_trophy' THEN
      v_trophy:=p_rule->>'competition_id';
      IF v_trophy IS NULL OR NOT(v_trophy=ANY(v_valid_trophies)) THEN
        RAISE EXCEPTION 'Trofeo specifico sconosciuto.';
      END IF;
      IF (v_trophy='conference_league' AND v_subject_conf<>'Conference League')
        OR (v_trophy='conference_championship' AND v_subject_conf<>'Conference Championship') THEN
        RAISE EXCEPTION 'La squadra non partecipa alla Conference scelta.';
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT v_first.season,v_first.draft_name;
END
$$;

CREATE OR REPLACE FUNCTION public.conditional_create_offer(
  p_to_team_id uuid,
  p_grantor_team_id uuid,
  p_rule_kind text,
  p_rule_spec jsonb,
  p_candidate_pick_ids uuid[],
  p_counter_pick_id uuid,
  p_existing_right_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE v_from uuid; v_holder uuid; v_spec jsonb; v_comp_ids text[]; v_conf text; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso richiesto.'; END IF;
  SELECT team_id INTO v_from FROM public.profiles WHERE id=auth.uid();
  IF v_from IS NULL THEN RAISE EXCEPTION 'Profilo franchigia non trovato.'; END IF;
  IF p_to_team_id IS NULL OR p_to_team_id=v_from THEN
    RAISE EXCEPTION 'Scegli una franchigia avversaria.';
  END IF;
  IF p_grantor_team_id NOT IN (v_from,p_to_team_id) THEN
    RAISE EXCEPTION 'Il proprietario del diritto deve partecipare alla trade.';
  END IF;
  v_holder:=CASE WHEN p_grantor_team_id=v_from THEN p_to_team_id ELSE v_from END;
  v_spec:=COALESCE(p_rule_spec,'{}'::jsonb);
  -- Snapshot immutable of the exact trophy set for "any trophy".
  IF p_rule_kind='trophy' AND v_spec->>'mode'='any_trophy' THEN
    SELECT conference INTO v_conf FROM public.teams WHERE id=(v_spec->>'subject_team_id')::uuid;
    v_comp_ids:=ARRAY['playoff','campionato','crash_out','highlander','round_robin','supercoppa'];
    IF v_conf='Conference League' THEN
      v_comp_ids:=array_append(v_comp_ids,'conference_league');
    ELSIF v_conf='Conference Championship' THEN
      v_comp_ids:=array_append(v_comp_ids,'conference_championship');
    END IF;
    v_spec:=jsonb_set(v_spec,'{eligible_competition_ids}',to_jsonb(v_comp_ids),true);
  END IF;
  PERFORM * FROM public.conditional_validate_terms(
    p_grantor_team_id,v_holder,p_rule_kind,v_spec,
    COALESCE(p_candidate_pick_ids,'{}'::uuid[]),p_counter_pick_id,p_existing_right_id
  );
  INSERT INTO public.conditional_trade_offers(
    from_team_id,to_team_id,grantor_team_id,holder_team_id,
    rule_kind,rule_spec,candidate_pick_ids,counter_pick_id,
    existing_right_id,created_by
  )
  VALUES (
    v_from,p_to_team_id,p_grantor_team_id,v_holder,
    p_rule_kind,v_spec,COALESCE(p_candidate_pick_ids,'{}'::uuid[]),
    p_counter_pick_id,p_existing_right_id,auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.conditional_respond_offer(
 p_offer_id uuid,p_accept boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE
  v_offer public.conditional_trade_offers%ROWTYPE;
  v_user_team uuid;
  v_counter public.future_draft_picks%ROWTYPE;
  v_candidate record;
  v_result record;
  v_right public.conditional_trade_rights%ROWTYPE;
  v_new_right_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso richiesto.'; END IF;
  SELECT team_id INTO v_user_team FROM public.profiles WHERE id=auth.uid();
  IF v_user_team IS NULL THEN RAISE EXCEPTION 'Profilo franchigia non trovato.'; END IF;
  SELECT * INTO v_offer FROM public.conditional_trade_offers
    WHERE id=p_offer_id FOR UPDATE;
  IF NOT FOUND OR v_offer.status<>'pending' THEN
    RAISE EXCEPTION 'Questa proposta non è più disponibile.';
  END IF;
  IF v_offer.to_team_id<>v_user_team THEN
    RAISE EXCEPTION 'Solo il destinatario può rispondere a questa proposta.';
  END IF;
  IF NOT COALESCE(p_accept,false) THEN
    UPDATE public.conditional_trade_offers
      SET status='rejected',updated_at=now()
    WHERE id=p_offer_id;
    RETURN jsonb_build_object('status','rejected','offer_id',p_offer_id);
  END IF;
  PERFORM public.conditional_market_check(v_offer.from_team_id,v_offer.to_team_id);
  -- Serialize every pick that could take part in this contract.
  FOR v_candidate IN SELECT id FROM public.future_draft_picks
    WHERE id=ANY(v_offer.candidate_pick_ids) OR id=v_offer.counter_pick_id
    ORDER BY id FOR UPDATE
  LOOP
    NULL;
  END LOOP;
  IF v_offer.rule_kind='right_transfer' THEN
    SELECT * INTO v_right FROM public.conditional_trade_rights
      WHERE id=v_offer.existing_right_id FOR UPDATE;
    IF NOT FOUND OR v_right.status<>'active'
      OR v_right.holder_team_id<>v_offer.grantor_team_id THEN
      RAISE EXCEPTION 'Il diritto è già stato ceduto o risolto.';
    END IF;
  END IF;
  SELECT * INTO v_result FROM public.conditional_validate_terms(
    v_offer.grantor_team_id,v_offer.holder_team_id,
    v_offer.rule_kind,v_offer.rule_spec,v_offer.candidate_pick_ids,
    v_offer.counter_pick_id,v_offer.existing_right_id
  );
  -- The consideration goes from the buyer of the right to its seller.
  UPDATE public.future_draft_picks
    SET owner_team_id=v_offer.grantor_team_id,updated_at=now()
    WHERE id=v_offer.counter_pick_id AND owner_team_id=v_offer.holder_team_id
      AND status='active' AND COALESCE(pick_kind,'normal')='normal';
  IF NOT FOUND THEN RAISE EXCEPTION 'La contropartita non è più disponibile.'; END IF;
  IF v_offer.rule_kind='right_transfer' THEN
    UPDATE public.conditional_trade_rights
      SET holder_team_id=v_offer.holder_team_id,updated_at=now()
      WHERE id=v_offer.existing_right_id;
    INSERT INTO public.conditional_trade_right_transfers(
      right_id,offer_id,from_team_id,to_team_id,counter_pick_id
    )
    VALUES(v_offer.existing_right_id,p_offer_id,
           v_offer.grantor_team_id,v_offer.holder_team_id,v_offer.counter_pick_id);
    v_new_right_id:=v_offer.existing_right_id;
  ELSE
    INSERT INTO public.conditional_trade_rights(
      source_offer_id,season,draft_name,grantor_team_id,
      holder_team_id,rule_kind,rule_spec
    )
    VALUES(p_offer_id,v_result.season,v_result.draft_name,
           v_offer.grantor_team_id,v_offer.holder_team_id,
           v_offer.rule_kind,v_offer.rule_spec)
      RETURNING id INTO v_new_right_id;
    INSERT INTO public.conditional_trade_candidates(right_id,pick_id,is_locked)
      SELECT v_new_right_id,id,true
      FROM unnest(v_offer.candidate_pick_ids) AS id;
  END IF;
  UPDATE public.conditional_trade_offers
    SET status='accepted',accepted_at=now(),updated_at=now()
    WHERE id=p_offer_id;
  RETURN jsonb_build_object('status','accepted','offer_id',p_offer_id,
     'right_id',v_new_right_id);
END
$$;

CREATE OR REPLACE FUNCTION public.conditional_cancel_offer(p_offer_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE v_team uuid; v_from uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso richiesto.'; END IF;
  SELECT team_id INTO v_team FROM public.profiles WHERE id=auth.uid();
  SELECT from_team_id INTO v_from FROM public.conditional_trade_offers
    WHERE id=p_offer_id AND status='pending' FOR UPDATE;
  IF v_team IS NULL OR v_from IS DISTINCT FROM v_team THEN
    RAISE EXCEPTION 'Solo il mittente può annullare una proposta in attesa.';
  END IF;
  UPDATE public.conditional_trade_offers SET status='cancelled',updated_at=now()
    WHERE id=p_offer_id;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION public.conditional_market_check(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.conditional_validate_terms(uuid,uuid,text,jsonb,uuid[],uuid,uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.conditional_create_offer(uuid,uuid,text,jsonb,uuid[],uuid,uuid)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.conditional_respond_offer(uuid,boolean)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.conditional_cancel_offer(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.conditional_create_offer(uuid,uuid,text,jsonb,uuid[],uuid,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.conditional_respond_offer(uuid,boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.conditional_cancel_offer(uuid)
  TO authenticated;
