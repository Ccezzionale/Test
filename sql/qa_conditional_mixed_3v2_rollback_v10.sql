-- QA only, always wraps actual Golden Knights/PokerMantra live data in ROLLBACK.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','fa9d5ad2-53ba-4de5-adc9-c0a79bfacfb5',true);
SELECT set_config('request.jwt.claims',(SELECT jsonb_build_object('sub',id,'email',email,'role','authenticated')::text FROM public.profiles WHERE id=auth.uid()),true);
SELECT set_config('app.qa_offer',public.conditional_create_mixed_offer(
'22711001-b5ab-47a4-a251-d041f239f397'::uuid,
'99ff32eb-10ae-4631-be7c-f45bf672b178'::uuid,
'ranked','{"which":"best"}'::jsonb,
ARRAY['a97f07a0-ab6d-44ed-8c5b-c60e99df7aca'::uuid,
'09e1343d-543a-4dda-8572-51d2200bb094'::uuid,
'ce175bfb-1c44-4fb2-8982-e0c29b9268d5'::uuid],
'41468db1-3f5c-435d-8fc3-b15780280b47'::uuid,
jsonb_build_array(
jsonb_build_object('side','from','asset_type','player','asset_id','7955b556-db8e-4406-82d9-8f5bcddec63b'),
jsonb_build_object('side','from','asset_type','player','asset_id','a4db0897-f63f-44c5-87ea-f82f616ff768'),
jsonb_build_object('side','from','asset_type','player','asset_id','77b11707-e34a-49e4-973b-e1b5751fa1e8'),
jsonb_build_object('side','to','asset_type','player','asset_id','a2eca6b4-09a1-477d-95ee-f82dbddcadfd'),
jsonb_build_object('side','to','asset_type','player','asset_id','9220530a-911e-45b0-b8de-0f7faae20e10')
))::text,true);
SELECT set_config('request.jwt.claim.sub','6bedee05-7752-4167-a207-2bfdd14fa99b',true);
SELECT set_config('request.jwt.claims',(SELECT jsonb_build_object('sub',id,'email',email,'role','authenticated')::text FROM public.profiles WHERE id=auth.uid()),true);
SELECT set_config('app.qa_accept',public.conditional_respond_offer(current_setting('app.qa_offer')::uuid,true)::text,true);
RESET ROLE;
DO $$
DECLARE v_status text;v_right text;v_legacy text;v_cuts int;v_locks int;
BEGIN
 SELECT status,mixed_legacy_trade_id::text INTO v_status,v_legacy
 FROM public.conditional_trade_offers WHERE id=current_setting('app.qa_offer')::uuid;
 SELECT status INTO v_right FROM public.conditional_trade_rights WHERE source_offer_id=current_setting('app.qa_offer')::uuid;
 SELECT cuts_required INTO v_cuts FROM public.trade_required_cuts WHERE proposal_id=v_legacy::uuid;
 SELECT count(*) INTO v_locks FROM public.conditional_trade_candidates c JOIN public.conditional_trade_rights r ON r.id=c.right_id
 WHERE r.source_offer_id=current_setting('app.qa_offer')::uuid AND c.is_locked;
 IF v_status<>'accepted_pending_cuts' OR v_right<>'pending_cuts' OR v_cuts<>1 OR v_locks<>3
 THEN RAISE EXCEPTION 'PRE-CUT STATE FAILED: offer %, right %, cuts %, locks %',v_status,v_right,v_cuts,v_locks;END IF;
 -- Only a real completion of the classic trade may transfer the reserved R4.
 BEGIN
  UPDATE public.future_draft_picks SET owner_team_id='99ff32eb-10ae-4631-be7c-f45bf672b178'::uuid
    WHERE id='41468db1-3f5c-435d-8fc3-b15780280b47'::uuid;
  RAISE EXCEPTION 'Unprotected counter pick';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE 'Pick di contropartita riservata%' THEN RAISE; END IF;
 END;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','6bedee05-7752-4167-a207-2bfdd14fa99b',true);
SELECT set_config('request.jwt.claims',(SELECT jsonb_build_object('sub',id,'email',email,'role','authenticated')::text FROM public.profiles WHERE id=auth.uid()),true);
SELECT set_config('app.qa_cut',public.cut_trade_players(
 (SELECT mixed_legacy_trade_id FROM public.conditional_trade_offers
 WHERE id=current_setting('app.qa_offer')::uuid),
 ARRAY['cfb883a0-d777-4d9a-8f26-031369b174ae'::uuid]
)::text,true);
RESET ROLE;
DO $$
DECLARE o record;
BEGIN
 SELECT o.status AS offer_status,t.status AS classic_status,r.status AS right_status,
   (SELECT count(*) FROM public.conditional_trade_reviews z WHERE z.offer_id=o.id) reviewer_rows,
   (SELECT count(*) FROM public.conditional_trade_candidates c WHERE c.right_id=r.id AND c.is_locked) locks,
   (SELECT owner_team_id FROM public.future_draft_picks WHERE id=o.counter_pick_id) counter_owner,
   (SELECT count(*) FROM public.players WHERE id IN(
      '7955b556-db8e-4406-82d9-8f5bcddec63b'::uuid,
      'a4db0897-f63f-44c5-87ea-f82f616ff768'::uuid,
      '77b11707-e34a-49e4-973b-e1b5751fa1e8'::uuid)
      AND owner_team_id='22711001-b5ab-47a4-a251-d041f239f397'::uuid) golden_players_moved,
   (SELECT count(*) FROM public.players WHERE id IN(
      'a2eca6b4-09a1-477d-95ee-f82dbddcadfd'::uuid,
      '9220530a-911e-45b0-b8de-0f7faae20e10'::uuid)
      AND owner_team_id='99ff32eb-10ae-4631-be7c-f45bf672b178'::uuid) poker_players_moved,
   (SELECT count(*) FROM public.waiver_compensatory_calls WHERE source_trade_id=t.id
      AND team_id='99ff32eb-10ae-4631-be7c-f45bf672b178'::uuid) compensative_calls,
   (SELECT count(*) FROM public.trade_cut_players WHERE proposal_id=t.id) cut_history
 INTO o
 FROM public.conditional_trade_offers o
 JOIN public.trade_proposals t ON t.id=o.mixed_legacy_trade_id
 JOIN public.conditional_trade_rights r ON r.source_offer_id=o.id
 WHERE o.id=current_setting('app.qa_offer')::uuid;
 IF o.offer_status<>'accepted' OR o.classic_status<>'accepted'
   OR o.right_status<>'active' OR o.reviewer_rows<>1 OR o.locks<>3
   OR o.counter_owner<>'99ff32eb-10ae-4631-be7c-f45bf672b178'::uuid
   OR o.golden_players_moved<>3 OR o.poker_players_moved<>2
   OR o.compensative_calls<>1 OR o.cut_history<>1
 THEN RAISE EXCEPTION 'POST-CUT FAILED: %',row_to_json(o); END IF;
END $$;
SELECT 'PASS: Golden Knights 3 vs PokerMantra 2; cut, players, compensative, right, three pick locks (ROLLBACK)' AS test;
ROLLBACK;