CREATE OR REPLACE FUNCTION public.conditional_respond_offer(p_offer_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_offer public.conditional_trade_offers%ROWTYPE;
  v_user_team uuid;
  v_counter public.future_draft_picks%ROWTYPE;
  v_candidate record;
  v_result record;
  v_right public.conditional_trade_rights%ROWTYPE;
  v_new_right_id uuid;
  v_mixed_legacy_id uuid;
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
  -- The classic assets and this right must settle in ONE database transaction.
  -- Any legacy rule failure rolls back BOTH legs and their future picks.
  IF jsonb_array_length(v_offer.mixed_assets)>0 THEN
    v_mixed_legacy_id:=public.conditional_apply_mixed_assets(p_offer_id);
  END IF;

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
$function$
