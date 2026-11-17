
-- Lega degli Eroi: conditional-pick contracts. Additive schema only.
-- No existing trade functions, proposals or draft rows are modified.
CREATE TABLE IF NOT EXISTS public.conditional_trade_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_team_id uuid NOT NULL REFERENCES public.teams(id),
  to_team_id uuid NOT NULL REFERENCES public.teams(id),
  grantor_team_id uuid NOT NULL REFERENCES public.teams(id),
  holder_team_id uuid NOT NULL REFERENCES public.teams(id),
  rule_kind text NOT NULL CHECK (rule_kind IN ('standing','ranked','trophy','right_transfer')),
  rule_spec jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rule_spec)='object'),
  candidate_pick_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  counter_pick_id uuid NOT NULL REFERENCES public.future_draft_picks(id),
  existing_right_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conditional_trade_offers_parties_distinct CHECK (from_team_id<>to_team_id),
  CONSTRAINT conditional_trade_offers_sides_distinct CHECK (grantor_team_id<>holder_team_id)
);

CREATE TABLE IF NOT EXISTS public.conditional_trade_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_offer_id uuid NOT NULL UNIQUE REFERENCES public.conditional_trade_offers(id),
  season integer NOT NULL,
  draft_name text NOT NULL,
  grantor_team_id uuid NOT NULL REFERENCES public.teams(id),
  holder_team_id uuid NOT NULL REFERENCES public.teams(id),
  rule_kind text NOT NULL CHECK (rule_kind IN ('standing','ranked','trophy')),
  rule_spec jsonb NOT NULL CHECK (jsonb_typeof(rule_spec)='object'),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','resolved','cancelled')),
  resolved_pick_id uuid REFERENCES public.future_draft_picks(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conditional_trade_rights_sides_distinct CHECK (grantor_team_id<>holder_team_id)
);
ALTER TABLE public.conditional_trade_offers
  ADD CONSTRAINT conditional_trade_offers_existing_right_fkey
  FOREIGN KEY (existing_right_id) REFERENCES public.conditional_trade_rights(id);

CREATE TABLE IF NOT EXISTS public.conditional_trade_candidates (
  right_id uuid NOT NULL REFERENCES public.conditional_trade_rights(id) ON DELETE CASCADE,
  pick_id uuid NOT NULL REFERENCES public.future_draft_picks(id) ON DELETE RESTRICT,
  is_locked boolean NOT NULL DEFAULT true,
  PRIMARY KEY (right_id,pick_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS conditional_unique_locked_future_pick
  ON public.conditional_trade_candidates(pick_id) WHERE is_locked;
CREATE INDEX IF NOT EXISTS conditional_right_candidates_lookup
  ON public.conditional_trade_candidates(right_id) WHERE is_locked;

CREATE TABLE IF NOT EXISTS public.conditional_trade_right_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  right_id uuid NOT NULL REFERENCES public.conditional_trade_rights(id),
  offer_id uuid NOT NULL UNIQUE REFERENCES public.conditional_trade_offers(id),
  from_team_id uuid NOT NULL REFERENCES public.teams(id),
  to_team_id uuid NOT NULL REFERENCES public.teams(id),
  counter_pick_id uuid NOT NULL REFERENCES public.future_draft_picks(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The following tables are FINAL result snapshots, never manual guesses.
CREATE TABLE IF NOT EXISTS public.conditional_official_standings (
  season integer NOT NULL,
  scope text NOT NULL CHECK (scope IN ('conference','round_robin')),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  position integer NOT NULL CHECK (position>=1),
  is_final boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(season,scope,team_id)
);
CREATE TABLE IF NOT EXISTS public.conditional_official_trophies (
  season integer NOT NULL,
  competition_id text NOT NULL CHECK (competition_id IN (
    'playoff','campionato','crash_out','highlander',
    'conference_league','conference_championship','round_robin','supercoppa'
  )),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','final')),
  winner_team_id uuid REFERENCES public.teams(id),
  finalized_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(season,competition_id),
  CONSTRAINT conditional_trophy_final_has_winner CHECK(status <> 'final' OR winner_team_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.conditional_official_pick_positions (
  season integer NOT NULL,
  pick_id uuid NOT NULL REFERENCES public.future_draft_picks(id),
  round_position integer NOT NULL CHECK(round_position>=1),
  is_final boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(season,pick_id)
);

-- Protect candidate picks against any normal or parallel trade.
CREATE OR REPLACE FUNCTION public.conditional_guard_locked_future_pick()
RETURNS trigger LANGUAGE plpgsql SET search_path='public','pg_temp' AS $$
BEGIN
  IF (NEW.owner_team_id IS DISTINCT FROM OLD.owner_team_id
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.round IS DISTINCT FROM OLD.round
      OR NEW.draft_name IS DISTINCT FROM OLD.draft_name
      OR NEW.original_team_id IS DISTINCT FROM OLD.original_team_id)
     AND EXISTS (
       SELECT 1 FROM public.conditional_trade_candidates c
       WHERE c.pick_id=OLD.id AND c.is_locked
     )
  THEN
    RAISE EXCEPTION 'Pick vincolata a una trade condizionata: non può essere trasferita o modificata separatamente.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER conditional_guard_locked_future_pick_update
BEFORE UPDATE OF owner_team_id,status,round,draft_name,original_team_id
ON public.future_draft_picks
FOR EACH ROW EXECUTE FUNCTION public.conditional_guard_locked_future_pick();

-- Public app may READ contracts and live statuses; only SECURITY DEFINER
-- RPCs (installed separately) and trusted importers may write.
ALTER TABLE public.conditional_trade_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conditional_trade_rights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conditional_trade_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conditional_trade_right_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conditional_official_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conditional_official_trophies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conditional_official_pick_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY conditional_offers_read_participants ON public.conditional_trade_offers
  FOR SELECT TO authenticated USING (
    from_team_id=(SELECT public.current_team_id()) OR
    to_team_id=(SELECT public.current_team_id()) OR
    status='accepted'
  );
CREATE POLICY conditional_rights_read_league ON public.conditional_trade_rights
  FOR SELECT TO authenticated USING (true);
CREATE POLICY conditional_candidates_read_league ON public.conditional_trade_candidates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY conditional_right_transfers_read_league ON public.conditional_trade_right_transfers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY conditional_standings_read_league ON public.conditional_official_standings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY conditional_trophies_read_league ON public.conditional_official_trophies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY conditional_pick_positions_read_league ON public.conditional_official_pick_positions
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON TABLE
  public.conditional_trade_offers,public.conditional_trade_rights,
  public.conditional_trade_candidates,public.conditional_trade_right_transfers,
  public.conditional_official_standings,public.conditional_official_trophies,
  public.conditional_official_pick_positions
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE
  public.conditional_trade_offers,public.conditional_trade_rights,
  public.conditional_trade_candidates,public.conditional_trade_right_transfers,
  public.conditional_official_standings,public.conditional_official_trophies,
  public.conditional_official_pick_positions
  TO authenticated;
GRANT ALL ON TABLE
  public.conditional_trade_offers,public.conditional_trade_rights,
  public.conditional_trade_candidates,public.conditional_trade_right_transfers,
  public.conditional_official_standings,public.conditional_official_trophies,
  public.conditional_official_pick_positions
  TO service_role;
REVOKE ALL ON FUNCTION public.conditional_guard_locked_future_pick() FROM PUBLIC,anon,authenticated;
