-- Align conditional mixed trades with ordinary roster trades:
-- players transfer at ordinary trade completion, including the standard
-- mandatory cut and compensatory call; only the future pick remains contingent.
ALTER TABLE public.conditional_trade_offers
 DROP CONSTRAINT IF EXISTS conditional_trade_offers_status_check;
ALTER TABLE public.conditional_trade_offers
 ADD CONSTRAINT conditional_trade_offers_status_check
 CHECK(status IN ('pending','accepted_pending_cuts','accepted','rejected','cancelled'));
ALTER TABLE public.conditional_trade_rights
 DROP CONSTRAINT IF EXISTS conditional_trade_rights_status_check;
ALTER TABLE public.conditional_trade_rights
 ADD CONSTRAINT conditional_trade_rights_status_check
 CHECK(status IN ('pending_cuts','active','resolved','cancelled'));

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
  -- Unequal player counts follow the SAME legacy trade flow: when the
  -- receiver has extra players, accept_trade() requires a classic cut.
  -- Future conditional picks remain reserved until that cut completes.
  IF v_from_u21<>v_to_u21 THEN
    RAISE EXCEPTION 'I giocatori U21 slot devono essere scambiati in rapporto 1:1.';
  END IF;
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
  IF v_result->>'status' NOT IN ('accepted','accepted_pending_cuts') THEN
    RAISE EXCEPTION 'Gli asset classici non possono essere completati secondo le regole del mercato.';
  END IF;
  UPDATE public.conditional_trade_offers
    SET mixed_legacy_trade_id=v_legacy_id,updated_at=now()
    WHERE id=p_offer_id;
  RETURN v_legacy_id;
END
$$;


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
  v_legacy_status text;
  v_cut_team uuid;
  v_cuts_needed integer;
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
  -- During pending classic cuts, the counter pick is reserved by the
  -- accepted_pending_cuts offer and the candidate picks by the staged right.
  -- No second contract may reuse that counter pick.
  IF EXISTS (
    SELECT 1 FROM public.conditional_trade_offers prev
    WHERE prev.status='accepted_pending_cuts' AND prev.id<>v_offer.id
      AND prev.counter_pick_id=ANY(
        ARRAY[v_offer.counter_pick_id]::uuid[] || v_offer.candidate_pick_ids)
  ) THEN
    RAISE EXCEPTION 'Una pick selezionata è già riservata per una trade in attesa di svincoli.';
  END IF;

  -- Classic assets follow the ordinary trade rules, including cuts and
  -- compensatory waiver calls. The conditional pick is NOT transferred yet.
  IF jsonb_array_length(v_offer.mixed_assets)>0 THEN
    v_mixed_legacy_id:=public.conditional_apply_mixed_assets(p_offer_id);
    SELECT status INTO v_legacy_status FROM public.trade_proposals
      WHERE id=v_mixed_legacy_id;
    IF v_legacy_status='accepted_pending_cuts' THEN
      -- Freeze the contingent right so no official standings or Hall of Fame
      -- settlement can resolve it before the normal player trade completes.
      IF v_offer.rule_kind='right_transfer' THEN
        UPDATE public.conditional_trade_rights
        SET status='pending_cuts',updated_at=now()
        WHERE id=v_offer.existing_right_id AND status='active'
        RETURNING id INTO v_new_right_id;
        IF v_new_right_id IS NULL THEN
          RAISE EXCEPTION 'Il diritto non è disponibile per la rivendita.';
        END IF;
      ELSE
        INSERT INTO public.conditional_trade_rights(
          source_offer_id,season,draft_name,grantor_team_id,
          holder_team_id,rule_kind,rule_spec,status
        ) VALUES(
          p_offer_id,v_result.season,v_result.draft_name,
          v_offer.grantor_team_id,v_offer.holder_team_id,
          v_offer.rule_kind,v_offer.rule_spec,'pending_cuts'
        ) RETURNING id INTO v_new_right_id;
        INSERT INTO public.conditional_trade_candidates(right_id,pick_id,is_locked)
        SELECT v_new_right_id,id,true FROM unnest(v_offer.candidate_pick_ids) AS id;
      END IF;
      UPDATE public.conditional_trade_offers
      SET status='accepted_pending_cuts',
          mixed_legacy_trade_id=v_mixed_legacy_id,updated_at=now()
      WHERE id=p_offer_id;
      SELECT team_id,cuts_required-cuts_done INTO v_cut_team,v_cuts_needed
      FROM public.trade_required_cuts
      WHERE proposal_id=v_mixed_legacy_id AND status='pending'
      ORDER BY created_at DESC LIMIT 1;
      IF v_cut_team IS NULL OR v_cuts_needed IS NULL OR v_cuts_needed<1 THEN
        RAISE EXCEPTION 'La trade necessita uno svincolo ma non è stato registrato.';
      END IF;
      RETURN jsonb_build_object(
        'status','accepted_pending_cuts','offer_id',p_offer_id,
        'right_id',v_new_right_id,'legacy_trade_id',v_mixed_legacy_id,
        'cut_team_id',v_cut_team,'cuts_required',v_cuts_needed);
    ELSIF v_legacy_status IS DISTINCT FROM 'accepted' THEN
      RAISE EXCEPTION 'La componente classica della trade non è stata completata.';
    END IF;
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
$function$;

-- Counterpick is reserved while the normal player trade awaits a cut.
-- Candidate picks already use conditional_trade_candidates locks.
CREATE OR REPLACE FUNCTION public.conditional_guard_locked_future_pick()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE v_offer record;
BEGIN
 IF (NEW.owner_team_id IS DISTINCT FROM OLD.owner_team_id
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.round IS DISTINCT FROM OLD.round
    OR NEW.draft_name IS DISTINCT FROM OLD.draft_name
    OR NEW.original_team_id IS DISTINCT FROM OLD.original_team_id) THEN
    IF EXISTS (SELECT 1 FROM public.conditional_trade_candidates c
        WHERE c.pick_id=OLD.id AND c.is_locked) THEN
      RAISE EXCEPTION 'Pick vincolata a una trade condizionata: non può essere trasferita o modificata separatamente.';
    END IF;
    SELECT o.id,o.grantor_team_id,o.holder_team_id,o.mixed_legacy_trade_id
    INTO v_offer FROM public.conditional_trade_offers o
    WHERE o.counter_pick_id=OLD.id AND o.status='accepted_pending_cuts'
    ORDER BY o.created_at LIMIT 1;
    IF FOUND AND NOT (
        NEW.owner_team_id=v_offer.grantor_team_id
        AND OLD.owner_team_id=v_offer.holder_team_id
        AND NEW.status IS NOT DISTINCT FROM OLD.status
        AND NEW.round IS NOT DISTINCT FROM OLD.round
        AND NEW.draft_name IS NOT DISTINCT FROM OLD.draft_name
        AND NEW.original_team_id IS NOT DISTINCT FROM OLD.original_team_id
        AND EXISTS (
          SELECT 1 FROM public.trade_proposals t
          WHERE t.id=v_offer.mixed_legacy_trade_id AND t.status='accepted'
          AND EXISTS (SELECT 1 FROM public.trade_required_cuts c
             WHERE c.proposal_id=t.id AND c.status='completed')
          AND NOT EXISTS (SELECT 1 FROM public.trade_required_cuts c
             WHERE c.proposal_id=t.id AND c.status='pending')
        )
      ) THEN
        RAISE EXCEPTION 'Pick di contropartita riservata a una trade condizionata in attesa di svincoli.';
    END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.conditional_guard_locked_future_pick() FROM PUBLIC,anon,authenticated;

-- When the normal trade is completed by cut_trade_players(), activate
-- the conditional right and transfer the mandatory counterpick atomically.
CREATE OR REPLACE FUNCTION public.conditional_finalize_after_classic_cuts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE
 v_offer public.conditional_trade_offers%ROWTYPE;
 v_right public.conditional_trade_rights%ROWTYPE;
 v_counter public.future_draft_picks%ROWTYPE;
 v_bad integer;
 v_count integer;
 v_locked integer;
BEGIN
 IF NEW.status<>'accepted' OR OLD.status IS NOT DISTINCT FROM 'accepted_pending_cuts'
 THEN RETURN NEW; END IF;
 SELECT * INTO v_offer FROM public.conditional_trade_offers
 WHERE mixed_legacy_trade_id=NEW.id AND status='accepted_pending_cuts'
 FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.trade_required_cuts
  WHERE proposal_id=NEW.id AND status='completed')
  OR EXISTS (SELECT 1 FROM public.trade_required_cuts
  WHERE proposal_id=NEW.id AND status='pending') THEN
  RAISE EXCEPTION 'La trade classica non ha ancora completato gli svincoli.';
 END IF;
 SELECT * INTO v_counter FROM public.future_draft_picks
 WHERE id=v_offer.counter_pick_id FOR UPDATE;
 IF NOT FOUND OR v_counter.owner_team_id IS DISTINCT FROM v_offer.holder_team_id
   OR v_counter.status<>'active'
   OR COALESCE(v_counter.pick_kind,'normal')<>'normal' THEN
   RAISE EXCEPTION 'La pick di contropartita non è più disponibile: chiusura annullata.';
 END IF;
 IF v_offer.rule_kind='right_transfer' THEN
  SELECT * INTO v_right FROM public.conditional_trade_rights
    WHERE id=v_offer.existing_right_id FOR UPDATE;
 ELSE
  SELECT * INTO v_right FROM public.conditional_trade_rights
    WHERE source_offer_id=v_offer.id FOR UPDATE;
 END IF;
 IF NOT FOUND OR v_right.status<>'pending_cuts' THEN
  RAISE EXCEPTION 'Il diritto riservato per questa trade non è più disponibile.';
 END IF;
 SELECT count(*),count(*) FILTER(WHERE is_locked) INTO v_count,v_locked
 FROM public.conditional_trade_candidates WHERE right_id=v_right.id;
 IF v_count<2 OR v_locked<>v_count THEN
  RAISE EXCEPTION 'Le pick candidate non sono più integralmente vincolate.';
 END IF;
 SELECT count(*) INTO v_bad FROM public.conditional_trade_candidates c
 JOIN public.future_draft_picks fp ON fp.id=c.pick_id
 WHERE c.right_id=v_right.id AND fp.owner_team_id IS DISTINCT FROM v_right.grantor_team_id;
 IF v_bad<>0 THEN RAISE EXCEPTION 'Proprietario pick candidate incoerente: chiusura annullata.'; END IF;

 UPDATE public.future_draft_picks
 SET owner_team_id=v_offer.grantor_team_id,updated_at=now()
 WHERE id=v_offer.counter_pick_id AND owner_team_id=v_offer.holder_team_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Impossibile assegnare la pick di contropartita.'; END IF;

 IF v_offer.rule_kind='right_transfer' THEN
   UPDATE public.conditional_trade_rights
   SET holder_team_id=v_offer.holder_team_id,status='active',updated_at=now()
   WHERE id=v_right.id;
   INSERT INTO public.conditional_trade_right_transfers(
      right_id,offer_id,from_team_id,to_team_id,counter_pick_id)
   VALUES(v_right.id,v_offer.id,v_offer.grantor_team_id,
      v_offer.holder_team_id,v_offer.counter_pick_id);
 ELSE
   UPDATE public.conditional_trade_rights
   SET status='active',updated_at=now() WHERE id=v_right.id;
 END IF;
 UPDATE public.conditional_trade_offers
 SET status='accepted',accepted_at=now(),updated_at=now()
 WHERE id=v_offer.id;
 -- If an official result arrived while the cut was pending, settle now.
 PERFORM public.conditional_try_resolve_right(v_right.id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.conditional_finalize_after_classic_cuts() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS conditional_classic_cuts_finalized ON public.trade_proposals;
CREATE TRIGGER conditional_classic_cuts_finalized
 AFTER UPDATE OF status ON public.trade_proposals
 FOR EACH ROW WHEN (NEW.status='accepted' AND OLD.status='accepted_pending_cuts')
 EXECUTE FUNCTION public.conditional_finalize_after_classic_cuts();

-- No status changes are allowed on user input; only the existing
-- SECURITY DEFINER trade RPCs/triggers can reach these states.
