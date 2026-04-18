-- =============================================================================
-- Migration 116: Movi — Expansión completa rol pasajero (paridad Uber/inDriver)
-- =============================================================================

-- =============================================================================
-- 1. Métodos de pago guardados
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ag_payment_methods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.ag_users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('card','nequi','daviplata','bancolombia','efectivo')),
  label       text NOT NULL,
  last4       text,
  brand       text,
  account     text,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_pm_user ON public.ag_payment_methods(user_id);

ALTER TABLE public.ag_payment_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_pm_self" ON public.ag_payment_methods;
CREATE POLICY "ag_pm_self" ON public.ag_payment_methods FOR ALL
  USING (user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()));

-- Solo un default por usuario
CREATE OR REPLACE FUNCTION public.ag_pm_enforce_default() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.ag_payment_methods SET is_default = false
    WHERE user_id = NEW.user_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ag_pm_default ON public.ag_payment_methods;
CREATE TRIGGER trg_ag_pm_default BEFORE INSERT OR UPDATE OF is_default ON public.ag_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.ag_pm_enforce_default();

-- =============================================================================
-- 2. Wallet pasajero (saldo recargable)
-- =============================================================================
ALTER TABLE public.ag_users ADD COLUMN IF NOT EXISTS passenger_wallet_balance INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.ag_passenger_wallet_tx (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.ag_users(id) ON DELETE CASCADE,
  amount       int NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('recharge','trip_payment','refund','bonus','loyalty_redeem')),
  trip_id      uuid REFERENCES public.ag_trip_requests(id) ON DELETE SET NULL,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_pwtx_user ON public.ag_passenger_wallet_tx(user_id, created_at DESC);

ALTER TABLE public.ag_passenger_wallet_tx ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_pwtx_self" ON public.ag_passenger_wallet_tx;
CREATE POLICY "ag_pwtx_self" ON public.ag_passenger_wallet_tx FOR SELECT
  USING (user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.ag_passenger_wallet_credit(p_amount int, p_kind text, p_desc text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM public.ag_users WHERE auth_user_id = auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No user'; END IF;
  UPDATE public.ag_users SET passenger_wallet_balance = passenger_wallet_balance + p_amount
    WHERE id = v_user_id;
  INSERT INTO public.ag_passenger_wallet_tx (user_id, amount, kind, description)
  VALUES (v_user_id, p_amount, p_kind, p_desc);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_passenger_wallet_credit(int, text, text) TO authenticated;

-- =============================================================================
-- 3. Columnas avanzadas en ag_trip_requests
-- =============================================================================
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS accessibility JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS trip_category TEXT NOT NULL DEFAULT 'economy' CHECK (trip_category IN ('economy','comfort','premium','xl'));
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS estimated_duration_min INT;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS for_other JSONB;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS tip_amount INT NOT NULL DEFAULT 0;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS passenger_note TEXT;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- =============================================================================
-- 4. Lealtad / nivel pasajero
-- =============================================================================
ALTER TABLE public.ag_users ADD COLUMN IF NOT EXISTS loyalty_points INT NOT NULL DEFAULT 0;
ALTER TABLE public.ag_users ADD COLUMN IF NOT EXISTS total_trips_as_passenger INT NOT NULL DEFAULT 0;
ALTER TABLE public.ag_users ADD COLUMN IF NOT EXISTS passenger_level TEXT NOT NULL DEFAULT 'bronce' CHECK (passenger_level IN ('bronce','plata','oro','platino','diamante'));

CREATE OR REPLACE FUNCTION public.ag_passenger_level_from_trips(p_trips int) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_trips >= 200 THEN 'diamante'
    WHEN p_trips >= 100 THEN 'platino'
    WHEN p_trips >= 50  THEN 'oro'
    WHEN p_trips >= 15  THEN 'plata'
    ELSE 'bronce'
  END;
$$;

-- Trigger en completar viaje: +10 puntos por viaje, actualizar contador y nivel
CREATE OR REPLACE FUNCTION public.ag_complete_trip(p_trip_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_driver_id uuid;
  v_passenger_id uuid;
  v_final_price int;
  v_new_trips int;
BEGIN
  UPDATE public.ag_trip_requests
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_trip_request_id AND status = 'accepted'
  RETURNING driver_id, passenger_user_id, COALESCE(final_price, offered_price)
  INTO v_driver_id, v_passenger_id, v_final_price;

  IF v_driver_id IS NOT NULL THEN
    INSERT INTO public.ag_driver_metric_events (driver_id, event_type, trip_id)
    VALUES (v_driver_id, 'trip_completed', p_trip_request_id);
    UPDATE public.ag_drivers SET metric_trips_completed = metric_trips_completed + 1
    WHERE id = v_driver_id;
  END IF;

  IF v_passenger_id IS NOT NULL THEN
    UPDATE public.ag_users
    SET total_trips_as_passenger = total_trips_as_passenger + 1,
        loyalty_points = loyalty_points + 10,
        passenger_level = public.ag_passenger_level_from_trips(total_trips_as_passenger + 1)
    WHERE id = v_passenger_id
    RETURNING total_trips_as_passenger INTO v_new_trips;
  END IF;
END;
$$;

-- =============================================================================
-- 5. Propinas RPC
-- =============================================================================
DROP FUNCTION IF EXISTS public.ag_tip_driver(uuid, integer);
DROP FUNCTION IF EXISTS public.ag_tip_driver(uuid, int);
CREATE OR REPLACE FUNCTION public.ag_tip_driver(p_trip_request_id uuid, p_amount int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_driver_id uuid;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount>0'; END IF;
  UPDATE public.ag_trip_requests
    SET tip_amount = tip_amount + p_amount
    WHERE id = p_trip_request_id
    RETURNING driver_id INTO v_driver_id;
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'trip not found'; END IF;
  UPDATE public.ag_drivers SET wallet_balance = wallet_balance + p_amount
    WHERE id = v_driver_id;
  INSERT INTO public.ag_wallet_transactions (driver_id, amount, type, description)
  VALUES (v_driver_id, p_amount, 'refund', 'Propina del pasajero viaje ' || p_trip_request_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_tip_driver(uuid, int) TO authenticated;

-- =============================================================================
-- 6. Reportes de problemas — usa ag_reports existente, solo agrega trip_id
-- =============================================================================
ALTER TABLE public.ag_reports ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES public.ag_trip_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ag_reports_trip ON public.ag_reports(trip_id);

ALTER TABLE public.ag_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_reports_self" ON public.ag_reports;
CREATE POLICY "ag_reports_self" ON public.ag_reports FOR ALL
  USING (reporter_user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()))
  WITH CHECK (reporter_user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()));

-- =============================================================================
-- 7. Cuentas corporativas
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ag_corporate_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  nit         text,
  owner_user_id uuid NOT NULL REFERENCES public.ag_users(id) ON DELETE CASCADE,
  monthly_budget INT NOT NULL DEFAULT 0,
  monthly_used   INT NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ag_corporate_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corporate_id    uuid NOT NULL REFERENCES public.ag_corporate_accounts(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.ag_users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  monthly_limit   INT,
  added_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (corporate_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ag_corp_members_user ON public.ag_corporate_members(user_id);

ALTER TABLE public.ag_corporate_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ag_corporate_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ag_corp_member_access" ON public.ag_corporate_accounts;
CREATE POLICY "ag_corp_member_access" ON public.ag_corporate_accounts FOR ALL
  USING (
    id IN (
      SELECT corporate_id FROM public.ag_corporate_members
      WHERE user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "ag_corp_members_self" ON public.ag_corporate_members;
CREATE POLICY "ag_corp_members_self" ON public.ag_corporate_members FOR ALL
  USING (user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()));

-- =============================================================================
-- 8. RPC rechazar oferta individual
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ag_passenger_reject_offer(p_offer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_passenger uuid;
BEGIN
  SELECT tr.passenger_user_id INTO v_passenger
  FROM public.ag_trip_offers o
  JOIN public.ag_trip_requests tr ON tr.id = o.trip_request_id
  WHERE o.id = p_offer_id;
  IF v_passenger IS NULL THEN RAISE EXCEPTION 'offer not found'; END IF;
  IF v_passenger NOT IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not your trip';
  END IF;
  UPDATE public.ag_trip_offers SET status = 'rejected', updated_at = now()
    WHERE id = p_offer_id AND status = 'pending';
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_passenger_reject_offer(uuid) TO authenticated;

-- =============================================================================
-- 9. RPC repetir viaje
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ag_passenger_repeat_trip(p_previous_trip_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_new_id uuid; v_old RECORD; v_passenger uuid;
BEGIN
  SELECT id INTO v_passenger FROM public.ag_users WHERE auth_user_id = auth.uid();
  SELECT * INTO v_old FROM public.ag_trip_requests
    WHERE id = p_previous_trip_id AND passenger_user_id = v_passenger;
  IF v_old IS NULL THEN RAISE EXCEPTION 'trip not found'; END IF;
  INSERT INTO public.ag_trip_requests
    (passenger_user_id, origin_lat, origin_lng, dest_name, dest_lat, dest_lng,
     distance_km, vehicle_type, offered_price, payment_method, status,
     trip_category, accessibility)
  VALUES
    (v_passenger, v_old.origin_lat, v_old.origin_lng, v_old.dest_name, v_old.dest_lat, v_old.dest_lng,
     v_old.distance_km, v_old.vehicle_type, v_old.offered_price, v_old.payment_method, 'searching',
     v_old.trip_category, v_old.accessibility)
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_passenger_repeat_trip(uuid) TO authenticated;

-- =============================================================================
-- 10. Vista detalle viaje desde perspectiva pasajero
-- =============================================================================
CREATE OR REPLACE VIEW public.ag_passenger_trip_detail_v AS
SELECT
  tr.id,
  tr.passenger_user_id,
  tr.driver_id,
  tr.dest_name,
  tr.distance_km,
  tr.estimated_duration_min,
  tr.vehicle_type,
  tr.trip_category,
  tr.status,
  tr.offered_price,
  tr.final_price,
  tr.base_fare,
  tr.distance_fare,
  tr.surge_multiplier,
  tr.surge_amount,
  tr.tip_amount,
  tr.payment_method,
  tr.created_at,
  tr.completed_at,
  tr.cancelled_at,
  tr.driver_stage,
  du.full_name AS driver_name,
  du.phone AS driver_phone,
  d.plate AS driver_plate,
  d.vehicle_brand AS driver_vehicle_brand,
  d.vehicle_model AS driver_vehicle_model,
  d.vehicle_color AS driver_vehicle_color,
  (SELECT AVG(stars)::numeric(3,2) FROM public.ag_trip_ratings
    WHERE rated_user_id = du.id AND rated_by_role = 'passenger') AS driver_rating,
  (SELECT COUNT(*) FROM public.ag_trip_ratings
    WHERE rated_user_id = du.id AND rated_by_role = 'passenger') AS driver_rating_count
FROM public.ag_trip_requests tr
LEFT JOIN public.ag_drivers d ON d.id = tr.driver_id
LEFT JOIN public.ag_users du ON du.id = d.ag_user_id;

GRANT SELECT ON public.ag_passenger_trip_detail_v TO authenticated;

-- =============================================================================
-- 11. Rating agregado del conductor (para mostrar en oferta)
-- =============================================================================
CREATE OR REPLACE VIEW public.ag_driver_public_v AS
SELECT
  d.id AS driver_id,
  d.ag_user_id,
  d.plate, d.vehicle_brand, d.vehicle_model, d.vehicle_color, d.vehicle_year,
  d.level,
  u.full_name AS driver_name,
  u.selfie_url AS driver_photo,
  (SELECT AVG(stars)::numeric(3,2) FROM public.ag_trip_ratings
    WHERE rated_user_id = u.id AND rated_by_role = 'passenger') AS rating_avg,
  (SELECT COUNT(*) FROM public.ag_trip_ratings
    WHERE rated_user_id = u.id AND rated_by_role = 'passenger') AS rating_count,
  (SELECT COUNT(*) FROM public.ag_trip_requests
    WHERE driver_id = d.id AND status = 'completed') AS trips_completed
FROM public.ag_drivers d
JOIN public.ag_users u ON u.id = d.ag_user_id
WHERE d.status = 'approved';

GRANT SELECT ON public.ag_driver_public_v TO authenticated;

-- =============================================================================
-- 12. RPC editar perfil pasajero
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ag_update_passenger_profile(
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_selfie_url text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user uuid;
BEGIN
  SELECT id INTO v_user FROM public.ag_users WHERE auth_user_id = auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'No user'; END IF;
  UPDATE public.ag_users SET
    full_name = COALESCE(p_full_name, full_name),
    phone = COALESCE(p_phone, phone),
    city = COALESCE(p_city, city),
    selfie_url = COALESCE(p_selfie_url, selfie_url),
    updated_at = now()
  WHERE id = v_user;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_update_passenger_profile(text,text,text,text) TO authenticated;

-- =============================================================================
-- 13. Vista objetos olvidados desde perspectiva pasajero
-- =============================================================================
-- Ya tiene RLS en 115, solo grant view helper
CREATE OR REPLACE VIEW public.ag_passenger_lost_items_v AS
SELECT
  li.id, li.trip_request_id, li.description, li.photo_url, li.status, li.created_at, li.updated_at,
  du.full_name AS driver_name, du.phone AS driver_phone,
  d.plate AS driver_plate
FROM public.ag_lost_items li
JOIN public.ag_drivers d ON d.id = li.driver_id
JOIN public.ag_users du ON du.id = d.ag_user_id;

GRANT SELECT ON public.ag_passenger_lost_items_v TO authenticated;

-- =============================================================================
-- 14. Configuración categorías (multiplicadores)
-- =============================================================================
INSERT INTO public.platform_settings (key, value) VALUES
  ('ag_category_comfort_mult', '1.3'),
  ('ag_category_premium_mult', '1.7'),
  ('ag_category_xl_mult', '1.5')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- 15. Bucket para fotos perfil pasajero (reutiliza si ya existe)
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('movi-passenger-profile', 'movi-passenger-profile', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "movi_profile_upload" ON storage.objects;
CREATE POLICY "movi_profile_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'movi-passenger-profile');
