-- ═══════════════════════════════════════════════════════
-- MOVI CONDUCTOR: todas las features pro en una migración
-- ═══════════════════════════════════════════════════════

-- 1. ONLINE SESSIONS
CREATE TABLE IF NOT EXISTS public.ag_online_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  total_seconds INT,
  trips_count INT NOT NULL DEFAULT 0,
  earnings_cop INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_sessions_driver ON public.ag_online_sessions(driver_id, started_at DESC);
ALTER TABLE public.ag_online_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_sessions_owner" ON public.ag_online_sessions;
CREATE POLICY "ag_sessions_owner" ON public.ag_online_sessions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id WHERE d.id = driver_id AND u.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id WHERE d.id = driver_id AND u.auth_user_id = auth.uid()));

-- 2. WITHDRAWALS
CREATE TABLE IF NOT EXISTS public.ag_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  amount INT NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('bank','nequi','daviplata','efectivo')),
  payment_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  admin_notes TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_wd_driver ON public.ag_withdrawals(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ag_wd_pending ON public.ag_withdrawals(status) WHERE status = 'pending';
ALTER TABLE public.ag_withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_wd_owner_or_admin" ON public.ag_withdrawals;
CREATE POLICY "ag_wd_owner_or_admin" ON public.ag_withdrawals FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id WHERE d.id = driver_id AND u.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev'))
  );
DROP POLICY IF EXISTS "ag_wd_insert_owner" ON public.ag_withdrawals;
CREATE POLICY "ag_wd_insert_owner" ON public.ag_withdrawals FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id WHERE d.id = driver_id AND u.auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "ag_wd_update_admin" ON public.ag_withdrawals;
CREATE POLICY "ag_wd_update_admin" ON public.ag_withdrawals FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev')));

CREATE OR REPLACE FUNCTION public.ag_request_withdrawal(
  p_driver_id UUID, p_amount INT, p_method TEXT, p_details JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_balance INT; v_id UUID; v_user UUID;
BEGIN
  SELECT u.auth_user_id INTO v_user FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id WHERE d.id = p_driver_id;
  IF v_user != auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_amount < 20000 THEN RAISE EXCEPTION 'Mínimo 20.000 COP'; END IF;
  SELECT wallet_balance INTO v_balance FROM public.ag_drivers WHERE id = p_driver_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
  UPDATE public.ag_drivers SET wallet_balance = wallet_balance - p_amount WHERE id = p_driver_id;
  INSERT INTO public.ag_withdrawals (driver_id, amount, payment_method, payment_details)
  VALUES (p_driver_id, p_amount, p_method, COALESCE(p_details, '{}'::jsonb))
  RETURNING id INTO v_id;
  INSERT INTO public.ag_wallet_transactions (driver_id, type, amount, ref_id, description)
  VALUES (p_driver_id, 'withdrawal_request', -p_amount, v_id, 'Solicitud de retiro ' || p_method);
  RETURN v_id;
END;
$$;

-- 3. NIVELES + streaks
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'bronce' CHECK (level IN ('bronce','plata','oro','platino','diamante'));
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS level_points INT NOT NULL DEFAULT 0;
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS streak_days INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.ag_recalc_driver_level(p_driver_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_trips INT;
  v_rating NUMERIC;
  v_level TEXT;
  v_driver_user UUID;
BEGIN
  SELECT u.auth_user_id INTO v_driver_user
  FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id
  WHERE d.id = p_driver_id;

  SELECT COUNT(*) INTO v_trips
  FROM public.ag_trip_requests
  WHERE driver_id = p_driver_id AND status = 'completed';

  SELECT COALESCE(AVG(stars), 0) INTO v_rating
  FROM public.ag_trip_ratings
  WHERE rated_user_id = v_driver_user AND rated_by_role = 'passenger';

  v_level := CASE
    WHEN v_trips >= 1000 AND v_rating >= 4.8 THEN 'diamante'
    WHEN v_trips >= 500 AND v_rating >= 4.7 THEN 'platino'
    WHEN v_trips >= 200 AND v_rating >= 4.5 THEN 'oro'
    WHEN v_trips >= 50 AND v_rating >= 4.0 THEN 'plata'
    ELSE 'bronce'
  END;

  UPDATE public.ag_drivers SET level = v_level, level_points = v_trips WHERE id = p_driver_id;
  RETURN v_level;
END;
$$;

-- 4. QUESTS
CREATE TABLE IF NOT EXISTS public.ag_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  quest_type TEXT NOT NULL CHECK (quest_type IN ('trips_count','earnings_min','hours_online','weekend_active')),
  target INT NOT NULL,
  reward_cop INT NOT NULL,
  period TEXT NOT NULL DEFAULT 'weekly' CHECK (period IN ('daily','weekly','monthly','once')),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ag_quests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_quests_select_all" ON public.ag_quests;
CREATE POLICY "ag_quests_select_all" ON public.ag_quests FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "ag_quests_manage_admin" ON public.ag_quests;
CREATE POLICY "ag_quests_manage_admin" ON public.ag_quests FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev')));

CREATE TABLE IF NOT EXISTS public.ag_quest_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id UUID NOT NULL REFERENCES public.ag_quests(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  progress INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quest_id, driver_id)
);
CREATE INDEX IF NOT EXISTS idx_ag_qp_driver ON public.ag_quest_progress(driver_id);
ALTER TABLE public.ag_quest_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_qp_owner" ON public.ag_quest_progress;
CREATE POLICY "ag_qp_owner" ON public.ag_quest_progress FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id WHERE d.id = driver_id AND u.auth_user_id = auth.uid()));

INSERT INTO public.ag_quests (title, description, quest_type, target, reward_cop, period, valid_until) VALUES
  ('Semana productiva', 'Completa 20 viajes esta semana', 'trips_count', 20, 30000, 'weekly', now() + interval '7 days'),
  ('Viernes de fin de semana', 'Trabaja 6 horas el viernes o sábado', 'hours_online', 6, 25000, 'weekly', now() + interval '7 days'),
  ('Conductor estrella', 'Gana $300.000 esta semana', 'earnings_min', 300000, 50000, 'weekly', now() + interval '7 days')
ON CONFLICT DO NOTHING;

-- 5. BLACKLIST pasajeros
CREATE TABLE IF NOT EXISTS public.ag_passenger_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  passenger_user_id UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, passenger_user_id)
);
CREATE INDEX IF NOT EXISTS idx_ag_bl_driver ON public.ag_passenger_blacklist(driver_id);
ALTER TABLE public.ag_passenger_blacklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_bl_owner" ON public.ag_passenger_blacklist;
CREATE POLICY "ag_bl_owner" ON public.ag_passenger_blacklist FOR ALL
  USING (EXISTS (SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id WHERE d.id = driver_id AND u.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id WHERE d.id = driver_id AND u.auth_user_id = auth.uid()));

-- 6. MULTI-VEHÍCULO
CREATE TABLE IF NOT EXISTS public.ag_driver_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('carro','moto','suv','van','camion')),
  brand TEXT, model TEXT, year INT, color TEXT, plate TEXT NOT NULL,
  photo_url TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_dv_driver ON public.ag_driver_vehicles(driver_id);
ALTER TABLE public.ag_driver_vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_dv_owner" ON public.ag_driver_vehicles;
CREATE POLICY "ag_dv_owner" ON public.ag_driver_vehicles FOR ALL
  USING (EXISTS (SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id WHERE d.id = driver_id AND u.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id WHERE d.id = driver_id AND u.auth_user_id = auth.uid()));

-- 7. ESTADOS VIAJE + paradas
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS driver_stage TEXT CHECK (driver_stage IN ('heading_to_pickup','arrived_at_pickup','picked_up','on_route','arrived_at_destination','completed'));
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS driver_started_at TIMESTAMPTZ;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS passenger_picked_at TIMESTAMPTZ;
ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS waypoints JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 8. TUTORIAL + auto-accept
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS tutorial_completed_at TIMESTAMPTZ;
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS auto_accept_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS auto_accept_min_price INT;
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS auto_accept_max_distance NUMERIC(5,2);

-- 9. ANALYTICS RPCs
CREATE OR REPLACE FUNCTION public.ag_driver_analytics(p_driver_id UUID, p_days INT DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_driver_user UUID;
  v_completed INT; v_total INT; v_cancelled INT;
  v_rating NUMERIC; v_ratings_n INT;
  v_hours BIGINT; v_tips INT;
  v_level TEXT; v_streak INT; v_wallet INT;
BEGIN
  SELECT u.auth_user_id INTO v_driver_user FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id WHERE d.id = p_driver_id;

  SELECT COUNT(*), COALESCE(SUM(offered_price), 0) INTO v_completed, v_total
  FROM public.ag_trip_requests WHERE driver_id = p_driver_id AND status = 'completed' AND created_at >= now() - (p_days || ' days')::interval;

  SELECT COUNT(*) INTO v_cancelled FROM public.ag_trip_requests
  WHERE driver_id = p_driver_id AND status = 'cancelled' AND created_at >= now() - (p_days || ' days')::interval;

  SELECT COALESCE(AVG(stars), 0)::numeric(3,2), COUNT(*) INTO v_rating, v_ratings_n
  FROM public.ag_trip_ratings
  WHERE rated_user_id = v_driver_user AND rated_by_role = 'passenger' AND created_at >= now() - (p_days || ' days')::interval;

  SELECT COALESCE(SUM(total_seconds), 0) / 3600 INTO v_hours
  FROM public.ag_online_sessions WHERE driver_id = p_driver_id AND started_at >= now() - (p_days || ' days')::interval;

  SELECT COALESCE(SUM(amount), 0) INTO v_tips
  FROM public.ag_wallet_transactions WHERE driver_id = p_driver_id AND type = 'tip' AND created_at >= now() - (p_days || ' days')::interval;

  SELECT level, streak_days, wallet_balance INTO v_level, v_streak, v_wallet FROM public.ag_drivers WHERE id = p_driver_id;

  RETURN jsonb_build_object(
    'completed_trips', v_completed, 'total_earned', v_total, 'cancelled_trips', v_cancelled,
    'avg_rating', v_rating, 'ratings_count', v_ratings_n, 'online_hours', v_hours,
    'tips_total', v_tips, 'level', v_level, 'streak_days', v_streak,
    'wallet_balance', v_wallet, 'days', p_days
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ag_driver_daily_earnings(p_driver_id UUID, p_days INT DEFAULT 14)
RETURNS TABLE (day DATE, trips BIGINT, earnings BIGINT) LANGUAGE sql SECURITY DEFINER AS $$
  WITH days AS (SELECT generate_series(current_date - (p_days - 1), current_date, '1 day'::interval)::date AS day),
  data AS (
    SELECT created_at::date AS day, COUNT(*)::bigint AS trips, COALESCE(SUM(offered_price), 0)::bigint AS earnings
    FROM public.ag_trip_requests
    WHERE driver_id = p_driver_id AND status = 'completed' AND created_at >= current_date - (p_days - 1)
    GROUP BY 1
  )
  SELECT d.day, COALESCE(x.trips, 0), COALESCE(x.earnings, 0) FROM days d LEFT JOIN data x ON x.day = d.day ORDER BY d.day;
$$;

-- 10. HEATMAP
CREATE OR REPLACE FUNCTION public.ag_heatmap_zones(p_lat_min DOUBLE PRECISION, p_lng_min DOUBLE PRECISION, p_lat_max DOUBLE PRECISION, p_lng_max DOUBLE PRECISION)
RETURNS TABLE (lat DOUBLE PRECISION, lng DOUBLE PRECISION, weight INT) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT origin_lat, origin_lng, COUNT(*)::int AS weight
  FROM public.ag_trip_requests
  WHERE created_at >= now() - interval '2 hours'
    AND origin_lat BETWEEN p_lat_min AND p_lat_max
    AND origin_lng BETWEEN p_lng_min AND p_lng_max
    AND status IN ('searching','completed','accepted')
  GROUP BY origin_lat, origin_lng;
$$;
