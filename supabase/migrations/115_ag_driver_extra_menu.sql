-- =============================================================================
-- Migration 115: Movi — Expansión menú conductor
-- - Documentos del conductor (CRUD + vencimientos)
-- - Métricas aceptación/cancelación
-- - Objetos perdidos
-- - Desglose de tarifa en trip_requests
-- - Tags detallados en ratings
-- =============================================================================

-- =============================================================================
-- 1. DOCUMENTOS DEL CONDUCTOR
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ag_driver_documents (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id         uuid        NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  doc_type          text        NOT NULL
    CHECK (doc_type IN ('license','soat','tecnomecanica','cedula','vehicle_front','vehicle_back','insurance')),
  file_url          text        NOT NULL,
  file_path         text        NOT NULL,
  number            text,
  expires_at        date,
  status            text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired')),
  rejection_reason  text,
  reviewed_by       uuid        REFERENCES auth.users(id),
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, doc_type)
);
CREATE INDEX IF NOT EXISTS idx_ag_driver_docs_driver ON public.ag_driver_documents(driver_id);
CREATE INDEX IF NOT EXISTS idx_ag_driver_docs_expiry ON public.ag_driver_documents(expires_at) WHERE status = 'approved';

ALTER TABLE public.ag_driver_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ag_driver_docs_self" ON public.ag_driver_documents;
CREATE POLICY "ag_driver_docs_self" ON public.ag_driver_documents FOR ALL
  USING (
    driver_id IN (
      SELECT id FROM public.ag_drivers WHERE ag_user_id IN (
        SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Bucket de storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('movi-driver-docs', 'movi-driver-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "movi_docs_driver_rw" ON storage.objects;
CREATE POLICY "movi_docs_driver_rw" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'movi-driver-docs' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'movi-driver-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Trigger auto-expirar
CREATE OR REPLACE FUNCTION public.ag_mark_expired_docs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at < CURRENT_DATE AND NEW.status = 'approved' THEN
    NEW.status := 'expired';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ag_docs_expire ON public.ag_driver_documents;
CREATE TRIGGER trg_ag_docs_expire BEFORE INSERT OR UPDATE ON public.ag_driver_documents
  FOR EACH ROW EXECUTE FUNCTION public.ag_mark_expired_docs();

-- =============================================================================
-- 2. MÉTRICAS ACEPTACIÓN / CANCELACIÓN
-- =============================================================================
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS metric_offers_seen INT NOT NULL DEFAULT 0;
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS metric_offers_made INT NOT NULL DEFAULT 0;
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS metric_trips_accepted INT NOT NULL DEFAULT 0;
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS metric_trips_cancelled_self INT NOT NULL DEFAULT 0;
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS metric_trips_completed INT NOT NULL DEFAULT 0;
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS metric_window_start TIMESTAMPTZ NOT NULL DEFAULT now();

-- Eventos para timeline detallado (últimos 30d)
CREATE TABLE IF NOT EXISTS public.ag_driver_metric_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   uuid NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN ('offer_seen','offer_made','trip_accepted','trip_cancelled_self','trip_completed')),
  trip_id     uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_metric_events_driver ON public.ag_driver_metric_events(driver_id, created_at DESC);

ALTER TABLE public.ag_driver_metric_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_metric_events_self" ON public.ag_driver_metric_events;
CREATE POLICY "ag_metric_events_self" ON public.ag_driver_metric_events FOR ALL
  USING (
    driver_id IN (
      SELECT id FROM public.ag_drivers WHERE ag_user_id IN (
        SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- RPC registrar evento + actualizar contador
CREATE OR REPLACE FUNCTION public.ag_log_metric_event(p_event_type text, p_trip_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_driver_id uuid;
BEGIN
  SELECT d.id INTO v_driver_id
  FROM public.ag_drivers d
  JOIN public.ag_users u ON u.id = d.ag_user_id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_driver_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.ag_driver_metric_events (driver_id, event_type, trip_id)
  VALUES (v_driver_id, p_event_type, p_trip_id);

  UPDATE public.ag_drivers SET
    metric_offers_seen = metric_offers_seen + CASE WHEN p_event_type = 'offer_seen' THEN 1 ELSE 0 END,
    metric_offers_made = metric_offers_made + CASE WHEN p_event_type = 'offer_made' THEN 1 ELSE 0 END,
    metric_trips_accepted = metric_trips_accepted + CASE WHEN p_event_type = 'trip_accepted' THEN 1 ELSE 0 END,
    metric_trips_cancelled_self = metric_trips_cancelled_self + CASE WHEN p_event_type = 'trip_cancelled_self' THEN 1 ELSE 0 END,
    metric_trips_completed = metric_trips_completed + CASE WHEN p_event_type = 'trip_completed' THEN 1 ELSE 0 END
  WHERE id = v_driver_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_log_metric_event(text, uuid) TO authenticated;

-- RPC retornar métricas computadas
CREATE OR REPLACE FUNCTION public.ag_get_driver_metrics()
RETURNS TABLE (
  acceptance_rate numeric,
  cancellation_rate numeric,
  completion_rate numeric,
  offers_seen int,
  offers_made int,
  trips_accepted int,
  trips_cancelled int,
  trips_completed int,
  window_start timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_driver_id uuid;
  v_seen int; v_made int; v_accepted int; v_cancelled int; v_completed int;
  v_window timestamptz;
BEGIN
  SELECT d.id, d.metric_offers_seen, d.metric_offers_made, d.metric_trips_accepted,
         d.metric_trips_cancelled_self, d.metric_trips_completed, d.metric_window_start
    INTO v_driver_id, v_seen, v_made, v_accepted, v_cancelled, v_completed, v_window
  FROM public.ag_drivers d
  JOIN public.ag_users u ON u.id = d.ag_user_id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_driver_id IS NULL THEN RETURN; END IF;

  RETURN QUERY SELECT
    CASE WHEN v_seen = 0 THEN 0::numeric ELSE ROUND((v_made::numeric / v_seen) * 100, 1) END,
    CASE WHEN v_accepted = 0 THEN 0::numeric ELSE ROUND((v_cancelled::numeric / v_accepted) * 100, 1) END,
    CASE WHEN v_accepted = 0 THEN 0::numeric ELSE ROUND((v_completed::numeric / v_accepted) * 100, 1) END,
    v_seen, v_made, v_accepted, v_cancelled, v_completed, v_window;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_get_driver_metrics() TO authenticated;

-- =============================================================================
-- 3. OBJETOS PERDIDOS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ag_lost_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_request_id   uuid        NOT NULL REFERENCES public.ag_trip_requests(id) ON DELETE CASCADE,
  driver_id         uuid        NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  passenger_user_id uuid        NOT NULL REFERENCES public.ag_users(id) ON DELETE CASCADE,
  description       text        NOT NULL,
  photo_url         text,
  status            text        NOT NULL DEFAULT 'reported'
    CHECK (status IN ('reported','contacted','returned','closed')),
  driver_notes      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_lost_items_driver ON public.ag_lost_items(driver_id);
CREATE INDEX IF NOT EXISTS idx_ag_lost_items_passenger ON public.ag_lost_items(passenger_user_id);
CREATE INDEX IF NOT EXISTS idx_ag_lost_items_trip ON public.ag_lost_items(trip_request_id);

ALTER TABLE public.ag_lost_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ag_lost_driver" ON public.ag_lost_items;
CREATE POLICY "ag_lost_driver" ON public.ag_lost_items FOR ALL
  USING (
    driver_id IN (
      SELECT id FROM public.ag_drivers WHERE ag_user_id IN (
        SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "ag_lost_passenger_read" ON public.ag_lost_items;
CREATE POLICY "ag_lost_passenger_read" ON public.ag_lost_items FOR SELECT
  USING (
    passenger_user_id IN (
      SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()
    )
  );

-- Bucket fotos objetos perdidos (reutiliza si existe)
INSERT INTO storage.buckets (id, name, public)
VALUES ('movi-lost-items', 'movi-lost-items', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "movi_lost_upload" ON storage.objects;
CREATE POLICY "movi_lost_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'movi-lost-items');

-- =============================================================================
-- 4. DESGLOSE DE TARIFA EN ag_trip_requests
-- =============================================================================
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS base_fare INT;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS distance_fare INT;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS surge_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS surge_amount INT NOT NULL DEFAULT 0;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS commission_pct INT;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS commission_amount INT;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS driver_net INT;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS final_price INT;

-- Actualizar trigger para calcular breakdown al aceptar
CREATE OR REPLACE FUNCTION public.ag_on_offer_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_commission_pct    integer := 0;
  v_commission_amount integer := 0;
  v_final_price       integer := 0;
  v_tr                RECORD;
  v_base              integer := 5000; -- tarifa mínima / base
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN

    SELECT COALESCE(value::integer, 0) INTO v_commission_pct
    FROM public.platform_settings WHERE key = 'ag_commission_pct';

    v_commission_amount := CEIL(NEW.offered_price::numeric * v_commission_pct / 100.0)::integer;
    v_final_price := NEW.offered_price;

    UPDATE public.ag_trip_offers
    SET status = 'cancelled', updated_at = now()
    WHERE trip_request_id = NEW.trip_request_id AND id <> NEW.id AND status = 'pending';

    SELECT * INTO v_tr FROM public.ag_trip_requests WHERE id = NEW.trip_request_id;

    UPDATE public.ag_trip_requests SET
      status = 'accepted',
      driver_id = NEW.driver_id,
      accepted_offer_id = NEW.id,
      base_fare = v_base,
      distance_fare = GREATEST(0, v_final_price - v_base),
      commission_pct = v_commission_pct,
      commission_amount = v_commission_amount,
      driver_net = v_final_price - v_commission_amount,
      final_price = v_final_price,
      updated_at = now()
    WHERE id = NEW.trip_request_id;

    IF v_commission_amount > 0 THEN
      UPDATE public.ag_drivers SET wallet_balance = wallet_balance - v_commission_amount
      WHERE id = NEW.driver_id;

      INSERT INTO public.ag_wallet_transactions (driver_id, amount, type, trip_offer_id, description)
      VALUES (NEW.driver_id, -v_commission_amount, 'commission', NEW.id,
              'Comisión ' || v_commission_pct || '% — viaje $' || v_final_price);
    END IF;

    -- Registrar métrica aceptación
    INSERT INTO public.ag_driver_metric_events (driver_id, event_type, trip_id)
    VALUES (NEW.driver_id, 'trip_accepted', NEW.trip_request_id);
    UPDATE public.ag_drivers SET metric_trips_accepted = metric_trips_accepted + 1
    WHERE id = NEW.driver_id;

  END IF;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 5. TAGS DETALLADOS EN RATINGS
-- =============================================================================
ALTER TABLE public.ag_trip_ratings ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Hook: cuando se completa trip → registrar métrica + log lost-item vacío listo
CREATE OR REPLACE FUNCTION public.ag_complete_trip(p_trip_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_driver_id uuid;
BEGIN
  UPDATE public.ag_trip_requests
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_trip_request_id AND status = 'accepted'
  RETURNING driver_id INTO v_driver_id;

  IF v_driver_id IS NOT NULL THEN
    INSERT INTO public.ag_driver_metric_events (driver_id, event_type, trip_id)
    VALUES (v_driver_id, 'trip_completed', p_trip_request_id);
    UPDATE public.ag_drivers SET metric_trips_completed = metric_trips_completed + 1
    WHERE id = v_driver_id;
  END IF;
END;
$$;

-- RPC cancelar viaje (conductor) con tracking métrica
CREATE OR REPLACE FUNCTION public.ag_driver_cancel_trip(p_trip_request_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_driver_id uuid;
BEGIN
  SELECT d.id INTO v_driver_id
  FROM public.ag_drivers d
  JOIN public.ag_users u ON u.id = d.ag_user_id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'No driver'; END IF;

  UPDATE public.ag_trip_requests
  SET status = 'cancelled', cancelled_at = now(), updated_at = now()
  WHERE id = p_trip_request_id AND driver_id = v_driver_id AND status IN ('accepted');

  INSERT INTO public.ag_driver_metric_events (driver_id, event_type, trip_id)
  VALUES (v_driver_id, 'trip_cancelled_self', p_trip_request_id);
  UPDATE public.ag_drivers SET metric_trips_cancelled_self = metric_trips_cancelled_self + 1
  WHERE id = v_driver_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_driver_cancel_trip(uuid, text) TO authenticated;

-- =============================================================================
-- 6. AYUDA: vista unificada para detalle de viaje (desglose completo)
-- =============================================================================
CREATE OR REPLACE VIEW public.ag_trip_detail_v AS
SELECT
  tr.id,
  tr.passenger_user_id,
  tr.driver_id,
  tr.dest_name,
  tr.distance_km,
  tr.vehicle_type,
  tr.status,
  tr.offered_price,
  tr.final_price,
  tr.base_fare,
  tr.distance_fare,
  tr.surge_multiplier,
  tr.surge_amount,
  tr.commission_pct,
  tr.commission_amount,
  tr.driver_net,
  tr.created_at,
  tr.completed_at,
  pu.full_name AS passenger_name,
  pu.phone AS passenger_phone,
  (SELECT COALESCE(SUM(amount), 0) FROM public.ag_wallet_transactions
    WHERE type = 'commission' AND trip_offer_id = tr.accepted_offer_id) AS commission_charged
FROM public.ag_trip_requests tr
LEFT JOIN public.ag_users pu ON pu.id = tr.passenger_user_id;

GRANT SELECT ON public.ag_trip_detail_v TO authenticated;
