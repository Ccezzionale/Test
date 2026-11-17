-- Rollout of real conditional trades with automatic settlement consistency gate
-- and a reviewer queue. No data from the QA simulator is written here.
CREATE TABLE IF NOT EXISTS public.conditional_trade_reviews (
  offer_id uuid PRIMARY KEY REFERENCES public.conditional_trade_offers(id) ON DELETE CASCADE,
  right_id uuid REFERENCES public.conditional_trade_rights(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed')),
  automatic_check text NOT NULL DEFAULT 'ok' CHECK (automatic_check IN ('ok','attention')),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewer_id uuid,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conditional_trade_reviews_pending_idx
 ON public.conditional_trade_reviews(created_at DESC) WHERE status='pending';
ALTER TABLE public.conditional_trade_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conditional_trade_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.conditional_trade_reviews TO authenticated;
GRANT ALL ON public.conditional_trade_reviews TO service_role;
DROP POLICY IF EXISTS conditional_trade_reviews_admin_read ON public.conditional_trade_reviews;
CREATE POLICY conditional_trade_reviews_admin_read
 ON public.conditional_trade_reviews FOR SELECT TO authenticated
 USING (EXISTS (
   SELECT 1 FROM public.profiles p
   WHERE p.id=(SELECT auth.uid()) AND p.role IN ('admin','commissioner')
 ));

CREATE OR REPLACE FUNCTION public.conditional_trade_review_after_accept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE
 v_right public.conditional_trade_rights%ROWTYPE;
 v_count integer;
 v_locked integer;
 v_wrong integer;
 v_counter_owner uuid;
 v_transfer_count integer;
 v_profile record;
BEGIN
 IF NEW.status<>'accepted' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

 SELECT owner_team_id INTO v_counter_owner FROM public.future_draft_picks WHERE id=NEW.counter_pick_id;
 IF v_counter_owner IS DISTINCT FROM NEW.grantor_team_id THEN
   RAISE EXCEPTION 'Controllo automatico: la contropartita non appartiene al venditore. Scambio annullato.';
 END IF;

 IF NEW.rule_kind='right_transfer' THEN
   SELECT * INTO v_right FROM public.conditional_trade_rights WHERE id=NEW.existing_right_id;
   IF NOT FOUND OR v_right.status<>'active' OR v_right.holder_team_id IS DISTINCT FROM NEW.holder_team_id THEN
     RAISE EXCEPTION 'Controllo automatico: titolare del diritto rivenduto non corretto. Scambio annullato.';
   END IF;
   SELECT count(*) INTO v_transfer_count
     FROM public.conditional_trade_right_transfers
    WHERE offer_id=NEW.id AND right_id=NEW.existing_right_id
      AND from_team_id=NEW.grantor_team_id AND to_team_id=NEW.holder_team_id
      AND counter_pick_id=NEW.counter_pick_id;
   IF v_transfer_count<>1 THEN
     RAISE EXCEPTION 'Controllo automatico: storico della rivendita incoerente. Scambio annullato.';
   END IF;
 ELSE
   SELECT * INTO v_right FROM public.conditional_trade_rights WHERE source_offer_id=NEW.id;
   IF NOT FOUND OR v_right.status<>'active'
     OR v_right.grantor_team_id IS DISTINCT FROM NEW.grantor_team_id
     OR v_right.holder_team_id IS DISTINCT FROM NEW.holder_team_id
     OR v_right.rule_kind IS DISTINCT FROM NEW.rule_kind THEN
     RAISE EXCEPTION 'Controllo automatico: diritto appena creato incoerente. Scambio annullato.';
   END IF;
   SELECT count(*),count(*) FILTER(WHERE is_locked)
     INTO v_count,v_locked FROM public.conditional_trade_candidates WHERE right_id=v_right.id;
   IF v_count<>cardinality(NEW.candidate_pick_ids) OR v_locked<>v_count THEN
     RAISE EXCEPTION 'Controllo automatico: numero o vincolo delle pick candidate incoerente. Scambio annullato.';
   END IF;
   SELECT count(*) INTO v_wrong
     FROM public.conditional_trade_candidates c
     LEFT JOIN public.future_draft_picks fp ON fp.id=c.pick_id
     WHERE c.right_id=v_right.id
       AND (fp.owner_team_id IS DISTINCT FROM NEW.grantor_team_id
         OR NOT (c.pick_id=ANY(NEW.candidate_pick_ids)));
   IF v_wrong<>0 THEN
     RAISE EXCEPTION 'Controllo automatico: proprietario o identificativo delle candidate errato. Scambio annullato.';
   END IF;
 END IF;

 IF jsonb_array_length(COALESCE(NEW.mixed_assets,'[]'::jsonb))>0
    AND NEW.mixed_legacy_trade_id IS NULL THEN
    RAISE EXCEPTION 'Controllo automatico: componenti miste non collegate. Scambio annullato.';
 END IF;

 INSERT INTO public.conditional_trade_reviews
  (offer_id,right_id,status,automatic_check,snapshot)
 VALUES (
   NEW.id,v_right.id,'pending','ok',
   jsonb_build_object(
     'phase','accepted',
     'rule_kind',NEW.rule_kind,'rule_spec',NEW.rule_spec,
     'from_team_id',NEW.from_team_id,'to_team_id',NEW.to_team_id,
     'grantor_team_id',NEW.grantor_team_id,'holder_team_id',NEW.holder_team_id,
     'candidate_pick_ids',NEW.candidate_pick_ids,'counter_pick_id',NEW.counter_pick_id,
     'counter_owner_verified',true,'candidate_locks_verified',true,
     'mixed_assets',NEW.mixed_assets,'mixed_legacy_trade_id',NEW.mixed_legacy_trade_id,
     'right_status',v_right.status,'right_holder_verified',true
   )
 ) ON CONFLICT (offer_id) DO NOTHING;

 -- A quiet in-app notification for reviewers only; no mass-push or duplicate.
 INSERT INTO public.app_notifications(user_id,team_id,type,title,body,url,event_key)
 SELECT p.id,p.team_id,'trade','🔎 Trade condizionata da verificare',
   'Nuova trade '+NEW.rule_kind+' tra '||
      COALESCE((SELECT name FROM public.teams WHERE id=NEW.from_team_id),'Franchigia')||
      ' e '||
      COALESCE((SELECT name FROM public.teams WHERE id=NEW.to_team_id),'Franchigia')||
      '. Controllo automatico superato: verifica il contratto nella Trade Room.',
   'trade-room.html','trade:conditional:review:'||NEW.id::text
 FROM public.profiles p WHERE p.role IN ('admin','commissioner')
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.conditional_trade_review_after_accept() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS conditional_trade_after_accept_review ON public.conditional_trade_offers;
CREATE TRIGGER conditional_trade_after_accept_review
 AFTER UPDATE OF status ON public.conditional_trade_offers
 FOR EACH ROW WHEN (NEW.status='accepted')
 EXECUTE FUNCTION public.conditional_trade_review_after_accept();

CREATE OR REPLACE FUNCTION public.conditional_mark_offer_reviewed(p_offer_id uuid,p_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE v_role text;v_review public.conditional_trade_reviews%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Accesso richiesto.'; END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
 IF v_role IS NULL OR v_role NOT IN ('admin','commissioner') THEN
   RAISE EXCEPTION 'Solo un amministratore può verificare la trade.';
 END IF;
 IF length(COALESCE(p_note,''))>700 THEN RAISE EXCEPTION 'Nota troppo lunga.'; END IF;
 UPDATE public.conditional_trade_reviews
 SET status='reviewed',review_note=NULLIF(trim(p_note),''),
     reviewer_id=auth.uid(),reviewed_at=now()
 WHERE offer_id=p_offer_id AND status='pending' AND automatic_check='ok'
 RETURNING * INTO v_review;
 IF NOT FOUND THEN RAISE EXCEPTION 'Trade non presente nella coda o già verificata.'; END IF;
 RETURN jsonb_build_object('offer_id',v_review.offer_id,'status',v_review.status,
   'reviewed_at',v_review.reviewed_at);
END
$$;
REVOKE ALL ON FUNCTION public.conditional_mark_offer_reviewed(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conditional_mark_offer_reviewed(uuid,text) TO authenticated;
