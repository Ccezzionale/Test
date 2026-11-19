-- Correct inverted guard on classic completed player cuts.
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
 IF NEW.status<>'accepted' OR OLD.status IS DISTINCT FROM 'accepted_pending_cuts'
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
