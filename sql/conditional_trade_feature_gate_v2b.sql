
CREATE TABLE IF NOT EXISTS public.conditional_feature_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id=1),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.conditional_feature_settings (id,enabled)
 VALUES(1,false) ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.conditional_feature_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY conditional_feature_settings_read
 ON public.conditional_feature_settings FOR SELECT TO authenticated USING(true);
REVOKE ALL ON public.conditional_feature_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.conditional_feature_settings TO authenticated;
GRANT ALL ON public.conditional_feature_settings TO service_role;
CREATE OR REPLACE FUNCTION public.conditional_market_check(p_a uuid,p_b uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE v_settings record; v_ca text; v_cb text;
BEGIN
  IF NOT COALESCE((SELECT enabled FROM public.conditional_feature_settings WHERE id=1),false) THEN
    RAISE EXCEPTION 'Le trade condizionate sono ancora in fase di collaudo. Nessuna operazione reale è abilitata.';
  END IF;
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
  IF v_ca IS DISTINCT FROM v_cb THEN
    RAISE EXCEPTION 'Trade condizionata fra Conference diverse non ancora supportata.';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION public.conditional_market_check(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
