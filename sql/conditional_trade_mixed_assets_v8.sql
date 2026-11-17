
-- Mixed conditional-trade contracts, all changes remain protected by
-- conditional_feature_settings.enabled=false until two-account E2E approval.
-- Ordinary trade RPCs/triggers are preserved and reused atomically.
ALTER TABLE public.conditional_trade_offers
  ADD COLUMN IF NOT EXISTS mixed_assets jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.conditional_trade_offers
  ADD COLUMN IF NOT EXISTS mixed_legacy_trade_id uuid
    REFERENCES public.trade_proposals(id);
ALTER TABLE public.conditional_trade_offers
  ADD COLUMN IF NOT EXISTS mixed_phase text;
ALTER TABLE public.conditional_trade_offers
  ADD CONSTRAINT conditional_mixed_assets_array_check
    CHECK (jsonb_typeof(mixed_assets)='array');
CREATE UNIQUE INDEX IF NOT EXISTS conditional_unique_mixed_legacy_trade
  ON public.conditional_trade_offers(mixed_legacy_trade_id)
  WHERE mixed_legacy_trade_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.conditional_validate_mixed_assets(p_offer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE
  v_offer public.conditional_trade_offers%ROWTYPE;
  v_config public.trade_settings%ROWTYPE;
  v_item jsonb;
  v_side text;
  v_type text;
  v_id text;
  v_owner uuid;
  v_player public.players%ROWTYPE;
  v_pick public.future_draft_picks%ROWTYPE;
  v_seen text[] := ARRAY[]::text[];
  v_from_players integer:=0;
  v_to_players integer:=0;
  v_from_future integer:=0;
  v_to_future integer:=0;
  v_from_u21 integer:=0;
  v_to_u21 integer:=0;
BEGIN
  SELECT * INTO v_offer FROM public.conditional_trade_offers WHERE id=p_offer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposta condizionata non trovata.'; END IF;
  SELECT * INTO v_config FROM public.trade_settings WHERE id=1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Impostazioni mercato non trovate.'; END IF;
  IF v_config.active_phase NOT IN ('conference_market','round_robin_market')
     OR v_offer.mixed_phase IS DISTINCT FROM v_config.active_phase THEN
    RAISE EXCEPTION 'Le trade miste condizionate sono per ora disponibili solo nei mercati dopo il Draft e nella stessa fase della proposta.';
  END IF;
  IF jsonb_typeof(v_offer.mixed_assets)<>'array'
     OR jsonb_array_length(v_offer.mixed_assets)<1
     OR jsonb_array_length(v_offer.mixed_assets)>24 THEN
    RAISE EXCEPTION 'Seleziona da 1 a 24 asset aggiuntivi per una trade mista.';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_offer.mixed_assets) AS t(value)
  LOOP
    IF jsonb_typeof(v_item)<>'object' OR
      (SELECT COUNT(*) FROM jsonb_object_keys(v_item))<>3 OR
      NOT (v_item ? 'side' AND v_item ? 'asset_type' AND v_item ? 'asset_id') THEN
      RAISE EXCEPTION 'Formato degli asset misti non valido.';
    END IF;
    v_side:=v_item->>'side';
    v_type:=v_item->>'asset_type';
    v_id:=v_item->>'asset_id';
    IF v_side NOT IN ('from','to') OR v_type NOT IN ('player','future_pick','waiver_call')
       OR v_id IS NULL OR length(v_id)>130 THEN
      RAISE EXCEPTION 'Tipo, lato o ID dell asset non valido.';
    END IF;
    IF (v_type||':'||v_id)=ANY(v_seen) THEN
      RAISE EXCEPTION 'Lo stesso asset è stato inserito più volte nella trade.';
    END IF;
    v_seen:=array_append(v_seen,v_type||':'||v_id);
    v_owner:=CASE WHEN v_side='from' THEN v_offer.from_team_id ELSE v_offer.to_team_id END;

    IF v_type='player' THEN
      SELECT * INTO v_player FROM public.players WHERE id=v_id::uuid;
      IF NOT FOUND OR v_player.owner_team_id IS DISTINCT FROM v_owner
         OR v_player.status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Giocatore non disponibile presso la squadra indicata.';
      END IF;
      IF v_side='from' THEN
        v_from_players:=v_from_players+1;
        IF COALESCE(v_player.is_u21_slot,false) THEN v_from_u21:=v_from_u21+1; END IF;
      ELSE
        v_to_players:=v_to_players+1;
        IF COALESCE(v_player.is_u21_slot,false) THEN v_to_u21:=v_to_u21+1; END IF;
      END IF;

    ELSIF v_type='future_pick' THEN
      SELECT * INTO v_pick FROM public.future_draft_picks WHERE id=v_id::uuid;
      IF NOT FOUND OR v_pick.owner_team_id IS DISTINCT FROM v_owner
         OR v_pick.status IS DISTINCT FROM 'active'
         OR COALESCE(v_pick.pick_kind,'normal')<>'normal'
         OR v_pick.season<>v_config.future_pick_season THEN
        RAISE EXCEPTION 'Pick aggiuntiva non disponibile presso il proprietario.';
      END IF;
      IF v_id::uuid=ANY(v_offer.candidate_pick_ids)
         OR v_id::uuid=v_offer.counter_pick_id THEN
        RAISE EXCEPTION 'Una pick non può apparire sia nel diritto che negli asset aggiuntivi.';
      END IF;
      IF EXISTS(SELECT 1 FROM public.conditional_trade_candidates
                WHERE pick_id=v_pick.id AND is_locked) THEN
        RAISE EXCEPTION 'Pick aggiuntiva vincolata a un altro contratto.';
      END IF;
      IF v_side='from' THEN v_from_future:=v_from_future+1;
      ELSE v_to_future:=v_to_future+1; END IF;

    ELSE -- waiver call
      IF split_part(v_id,':',4)<>'' OR
         public.waiver_call_right_owner(
           split_part(v_id,':',1),
           split_part(v_id,':',2)::integer,
           split_part(v_id,':',3)::uuid
         ) IS DISTINCT FROM v_owner THEN
        RAISE EXCEPTION 'Chiamata waiver non valida oppure non di proprietà della squadra.';
      END IF;
      IF public.waiver_call_package_block_reason(
           split_part(v_id,':',1),
           split_part(v_id,':',2)::integer,
           split_part(v_id,':',3)::uuid
         ) IS NOT NULL THEN
         RAISE EXCEPTION 'La chiamata waiver selezionata non è scambiabile.';
      END IF;
    END IF;
  END LOOP;

  -- The conditional right and its mandatory counter-pick already count 1:1.
  -- Any OTHER normal future picks must also balance independently.
  IF v_from_future<>v_to_future THEN
    RAISE EXCEPTION 'Le pick future extra devono rispettare il rapporto 1:1.';
  END IF;
  -- Keep classic completion completely atomic: no pending player cuts
  -- in mixed trades until cuts are integrated as a separate workflow.
  IF v_from_players<>v_to_players THEN
    RAISE EXCEPTION 'Le trade miste con svincoli differiti non sono ancora abilitate: serve lo stesso numero di giocatori per squadra.';
  END IF;
  IF v_from_u21<>v_to_u21 THEN
    RAISE EXCEPTION 'I giocatori U21 slot devono essere scambiati in rapporto 1:1.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.conditional_create_mixed_offer(
  p_to_team_id uuid,
  p_grantor_team_id uuid,
  p_rule_kind text,
  p_rule_spec jsonb,
  p_candidate_pick_ids uuid[],
  p_counter_pick_id uuid,
  p_extra_assets jsonb,
  p_existing_right_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE v_offer_id uuid; v_phase text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso richiesto.'; END IF;
  SELECT active_phase INTO v_phase FROM public.trade_settings WHERE id=1;
  IF v_phase NOT IN ('conference_market','round_robin_market') THEN
    RAISE EXCEPTION 'Le trade miste condizionate sono disponibili solo dopo il Draft.';
  END IF;
  IF p_extra_assets IS NULL OR jsonb_typeof(p_extra_assets)<>'array'
     OR jsonb_array_length(p_extra_assets)=0 THEN
    RAISE EXCEPTION 'Per questa funzione occorre almeno un asset aggiuntivo.';
  END IF;
  v_offer_id:=public.conditional_create_offer(
    p_to_team_id,p_grantor_team_id,p_rule_kind,
    p_rule_spec,p_candidate_pick_ids,p_counter_pick_id,p_existing_right_id);
  UPDATE public.conditional_trade_offers
    SET mixed_assets=p_extra_assets,mixed_phase=v_phase,updated_at=now()
    WHERE id=v_offer_id;
  PERFORM public.conditional_validate_mixed_assets(v_offer_id);
  RETURN v_offer_id;
END
$$;

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
  UPDATE public.conditional_trade_offers
    SET mixed_legacy_trade_id=v_legacy_id,updated_at=now()
    WHERE id=p_offer_id;
  RETURN v_legacy_id;
END
$$;

REVOKE ALL ON FUNCTION public.conditional_validate_mixed_assets(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.conditional_apply_mixed_assets(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.conditional_create_mixed_offer(
  uuid,uuid,text,jsonb,uuid[],uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.conditional_create_mixed_offer(
  uuid,uuid,text,jsonb,uuid[],uuid,jsonb,uuid) TO authenticated;
