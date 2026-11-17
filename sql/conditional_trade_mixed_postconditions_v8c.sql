CREATE OR REPLACE FUNCTION public.conditional_apply_mixed_assets(p_offer_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE
  v_offer public.conditional_trade_offers%ROWTYPE;
  v_legacy_id uuid;
  v_draft_name text;
  v_item jsonb;
  v_label text;
  v_type text;
  v_asset_id text;
  v_result json;
BEGIN
  SELECT * INTO v_offer FROM public.conditional_trade_offers WHERE id=p_offer_id FOR UPDATE;
  IF NOT FOUND OR v_offer.status<>'pending' THEN
    RAISE EXCEPTION 'Proposta mista non disponibile.';
  END IF;
  PERFORM public.conditional_market_check(v_offer.from_team_id,v_offer.to_team_id);
  PERFORM public.conditional_validate_mixed_assets(p_offer_id);
  SELECT draft_name INTO v_draft_name
    FROM public.future_draft_picks WHERE id=v_offer.counter_pick_id;

  INSERT INTO public.trade_proposals
    (from_team,to_team,status,draft_name,message)
  VALUES (v_offer.from_team_id::text,v_offer.to_team_id::text,
          'pending',v_draft_name,
          '🔐 Componenti tradizionali della trade condizionata '||left(p_offer_id::text,8))
  RETURNING id INTO v_legacy_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_offer.mixed_assets) AS t(value)
  LOOP
    v_type:=v_item->>'asset_type';
    v_asset_id:=v_item->>'asset_id';
    IF v_type='player' THEN
      SELECT name INTO v_label FROM public.players WHERE id=v_asset_id::uuid;
    ELSIF v_type='future_pick' THEN
      SELECT 'Pick futura R'||p.round||' '||p.season||' · '||t.name
        INTO v_label FROM public.future_draft_picks p
        JOIN public.teams t ON t.id=p.original_team_id
        WHERE p.id=v_asset_id::uuid;
    ELSE
      v_label:='Chiamata waiver '||v_asset_id;
    END IF;
    IF v_label IS NULL THEN RAISE EXCEPTION 'Asset aggiuntivo non trovato.'; END IF;
    INSERT INTO public.trade_assets(proposal_id,side,asset_type,asset_id,asset_label)
    VALUES(v_legacy_id,v_item->>'side',v_type,v_asset_id,v_label);
  END LOOP;
  SELECT public.accept_trade(v_legacy_id) INTO v_result;
  IF v_result->>'status'<>'accepted' THEN
    RAISE EXCEPTION 'Il completamento degli asset aggiuntivi non è immediato: operazione annullata integralmente.';
  END IF;
  -- Critical postcondition: some legacy BEFORE UPDATE triggers (e.g.
  -- goalkeeper package rights) may keep the original owner even though
  -- the accepted trade reports success. Never commit half-transfers.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_offer.mixed_assets) AS t(item)
    JOIN public.players p ON p.id=(
      CASE WHEN t.item->>'asset_type'='player'
      THEN (t.item->>'asset_id')::uuid ELSE NULL::uuid END
    )
    WHERE p.owner_team_id IS DISTINCT FROM
      (CASE WHEN t.item->>'side'='from'
        THEN v_offer.to_team_id ELSE v_offer.from_team_id END)
  ) THEN
    RAISE EXCEPTION 'Un giocatore non è stato trasferito dal motore classico (possibile vincolo portieri). Intera trade annullata.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_offer.mixed_assets) AS t(item)
    JOIN public.future_draft_picks p ON p.id=(
      CASE WHEN t.item->>'asset_type'='future_pick'
      THEN (t.item->>'asset_id')::uuid ELSE NULL::uuid END
    )
    WHERE p.owner_team_id IS DISTINCT FROM
      (CASE WHEN t.item->>'side'='from'
        THEN v_offer.to_team_id ELSE v_offer.from_team_id END)
  ) THEN
    RAISE EXCEPTION 'Una pick futura aggiuntiva non è stata trasferita. Intera trade annullata.';
  END IF;
  UPDATE public.conditional_trade_offers
    SET mixed_legacy_trade_id=v_legacy_id,updated_at=now()
    WHERE id=p_offer_id;
  RETURN v_legacy_id;
END
$$;