
-- Deterministic, idempotent settlement of already accepted conditional rights.
-- Only FINAL snapshots can transfer the owed pick.
CREATE OR REPLACE FUNCTION public.conditional_try_resolve_right(p_right_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE
  v_right public.conditional_trade_rights%ROWTYPE;
  v_candidates uuid[];
  v_pick uuid;
  v_scope text;
  v_subject uuid;
  v_pos int;
  v_n int;
  v_top int;
  v_bottom int;
  v_kind text;
  v_mode text;
  v_comp text;
  v_row record;
  v_all_count int;
  v_final_count int;
  v_won boolean;
BEGIN
  SELECT * INTO v_right FROM public.conditional_trade_rights WHERE id=p_right_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;
  IF v_right.status<>'active' THEN
    RETURN jsonb_build_object('status',v_right.status,'right_id',p_right_id);
  END IF;
  SELECT ARRAY_AGG(pick_id ORDER BY pick_id) INTO v_candidates
    FROM public.conditional_trade_candidates
    WHERE right_id=p_right_id AND is_locked;
  IF COALESCE(array_length(v_candidates,1),0)<2 THEN
    RAISE EXCEPTION 'Diritto condizionato senza pick candidate vincolate.';
  END IF;
  v_kind:=v_right.rule_kind;
  IF v_kind='standing' THEN
    v_scope:=v_right.rule_spec->>'scope';
    v_subject:=(v_right.rule_spec->>'subject_team_id')::uuid;
    v_top:=(v_right.rule_spec->>'top_count')::int;
    v_bottom:=(v_right.rule_spec->>'bottom_count')::int;
    SELECT position INTO v_pos
    FROM public.conditional_official_standings
    WHERE season=v_right.season AND scope=v_scope
      AND team_id=v_subject AND is_final;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status','pending','reason','standing_not_final');
    END IF;
    IF v_scope='round_robin' THEN
      SELECT COUNT(*) INTO v_n FROM public.teams;
    ELSE
      SELECT COUNT(*) INTO v_n FROM public.teams
      WHERE conference=(SELECT conference FROM public.teams WHERE id=v_subject);
    END IF;
    IF v_pos<=v_top THEN
      v_pick:=(v_right.rule_spec->>'top_pick_id')::uuid;
    ELSIF v_pos>v_n-v_bottom THEN
      v_pick:=(v_right.rule_spec->>'bottom_pick_id')::uuid;
    ELSE
      v_pick:=NULLIF(v_right.rule_spec->>'middle_pick_id','')::uuid;
    END IF;
  ELSIF v_kind='ranked' THEN
    SELECT COUNT(*) INTO v_final_count
    FROM public.conditional_official_pick_positions
    WHERE season=v_right.season AND pick_id=ANY(v_candidates) AND is_final;
    IF v_final_count<>array_length(v_candidates,1) THEN
      RETURN jsonb_build_object('status','pending','reason','draft_order_not_final');
    END IF;
    SELECT pick_id INTO v_pick
      FROM public.conditional_official_pick_positions
      WHERE season=v_right.season AND pick_id=ANY(v_candidates) AND is_final
      ORDER BY
        CASE WHEN v_right.rule_spec->>'which'='best' THEN round_position END ASC NULLS LAST,
        CASE WHEN v_right.rule_spec->>'which'='worst' THEN round_position END DESC NULLS LAST
      LIMIT 1;
  ELSIF v_kind='trophy' THEN
    v_mode:=v_right.rule_spec->>'mode';
    v_subject:=(v_right.rule_spec->>'subject_team_id')::uuid;
    v_comp:=v_right.rule_spec->>'competition_id';
    IF v_mode='specific_trophy' THEN
      SELECT status,winner_team_id INTO v_row
      FROM public.conditional_official_trophies
      WHERE season=v_right.season AND competition_id=v_comp;
      IF NOT FOUND OR v_row.status<>'final' THEN
        RETURN jsonb_build_object('status','pending','reason','trophy_not_final');
      END IF;
      v_won:=v_row.winner_team_id=v_subject;
    ELSIF v_mode='any_trophy' THEN
      IF jsonb_typeof(v_right.rule_spec->'eligible_competition_ids')<>'array' THEN
        RAISE EXCEPTION 'Diritto senza il catalogo dei trofei ammissibili.';
      END IF;
      SELECT COUNT(*) INTO v_all_count
      FROM jsonb_array_elements_text(v_right.rule_spec->'eligible_competition_ids');
      IF v_all_count=0 THEN RAISE EXCEPTION 'Nessun trofeo ammissibile.'; END IF;
      SELECT COUNT(*) INTO v_final_count
      FROM public.conditional_official_trophies o
      WHERE o.season=v_right.season AND o.status='final'
        AND o.competition_id IN (
          SELECT jsonb_array_elements_text(v_right.rule_spec->'eligible_competition_ids')
        );
      SELECT EXISTS(
        SELECT 1 FROM public.conditional_official_trophies o
        WHERE o.season=v_right.season AND o.status='final'
          AND o.winner_team_id=v_subject
          AND o.competition_id IN (
            SELECT jsonb_array_elements_text(v_right.rule_spec->'eligible_competition_ids')
          )
      ) INTO v_won;
      IF NOT v_won AND v_final_count<>v_all_count THEN
        RETURN jsonb_build_object('status','pending','reason','other_trophies_still_open');
      END IF;
    ELSE
      RAISE EXCEPTION 'Clausola trofeo sconosciuta.';
    END IF;
    v_pick:=CASE WHEN v_won THEN (v_right.rule_spec->>'won_pick_id')::uuid
                 ELSE (v_right.rule_spec->>'not_won_pick_id')::uuid END;
  ELSE
    RAISE EXCEPTION 'Tipo di diritto sconosciuto.';
  END IF;
  IF v_pick IS NULL OR NOT (v_pick=ANY(v_candidates)) THEN
    RAISE EXCEPTION 'Pick dovuta non inclusa fra le candidate vincolate.';
  END IF;
  -- Lock the actual pick: competing normal trades cannot jump ahead.
  PERFORM 1 FROM public.future_draft_picks WHERE id=v_pick FOR UPDATE;
  IF NOT EXISTS (
    SELECT 1 FROM public.future_draft_picks
    WHERE id=v_pick AND owner_team_id=v_right.grantor_team_id
      AND status='active' AND COALESCE(pick_kind,'normal')='normal'
  ) THEN
    RAISE EXCEPTION 'La pick condizionata non è più presso il proprietario originale.';
  END IF;
  -- Release all locks first, then transfer exactly one pick, all in ONE transaction.
  UPDATE public.conditional_trade_candidates SET is_locked=false
    WHERE right_id=p_right_id AND is_locked;
  UPDATE public.future_draft_picks
    SET owner_team_id=v_right.holder_team_id,updated_at=now()
    WHERE id=v_pick;
  UPDATE public.conditional_trade_rights
    SET status='resolved',resolved_pick_id=v_pick,
        resolved_at=now(),updated_at=now()
    WHERE id=p_right_id;
  RETURN jsonb_build_object('status','resolved','right_id',p_right_id,'pick_id',v_pick);
END
$$;

CREATE OR REPLACE FUNCTION public.conditional_settle_ready_rights(p_season integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE v_rec record; v_result jsonb; v_count int:=0;
BEGIN
  FOR v_rec IN SELECT id FROM public.conditional_trade_rights
    WHERE season=p_season AND status='active' ORDER BY created_at,id
  LOOP
    v_result:=public.conditional_try_resolve_right(v_rec.id);
    IF v_result->>'status'='resolved' THEN v_count:=v_count+1; END IF;
  END LOOP;
  RETURN v_count;
END
$$;

CREATE OR REPLACE FUNCTION public.conditional_on_final_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
BEGIN
  IF TG_TABLE_NAME='conditional_official_trophies' THEN
    IF NEW.status='final' THEN
      PERFORM public.conditional_settle_ready_rights(NEW.season);
    END IF;
  ELSE
    IF NEW.is_final THEN
      PERFORM public.conditional_settle_ready_rights(NEW.season);
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER conditional_standings_finalize_rights
AFTER INSERT OR UPDATE OF is_final,position ON public.conditional_official_standings
FOR EACH ROW EXECUTE FUNCTION public.conditional_on_final_snapshot();

CREATE TRIGGER conditional_trophies_finalize_rights
AFTER INSERT OR UPDATE OF status,winner_team_id ON public.conditional_official_trophies
FOR EACH ROW EXECUTE FUNCTION public.conditional_on_final_snapshot();

CREATE TRIGGER conditional_pick_positions_finalize_rights
AFTER INSERT OR UPDATE OF is_final,round_position ON public.conditional_official_pick_positions
FOR EACH ROW EXECUTE FUNCTION public.conditional_on_final_snapshot();

REVOKE ALL ON FUNCTION public.conditional_try_resolve_right(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.conditional_settle_ready_rights(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.conditional_on_final_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conditional_try_resolve_right(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.conditional_settle_ready_rights(integer) TO service_role;
