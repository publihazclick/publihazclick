-- ═══════════════════════════════════════════════════════
-- MOVI: SOS / Emergencias + features Mes 1
-- ═══════════════════════════════════════════════════════

-- Contactos de emergencia del usuario
CREATE TABLE IF NOT EXISTS public.ag_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  relationship TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_ec_user ON public.ag_emergency_contacts(user_id);
ALTER TABLE public.ag_emergency_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_ec_self" ON public.ag_emergency_contacts;
CREATE POLICY "ag_ec_self" ON public.ag_emergency_contacts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Eventos SOS / pánico
CREATE TABLE IF NOT EXISTS public.ag_sos_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES public.ag_trips(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved','false_alarm')),
  notified_contacts INTEGER NOT NULL DEFAULT 0,
  notified_admin BOOLEAN NOT NULL DEFAULT FALSE,
  admin_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_sos_status ON public.ag_sos_events(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ag_sos_user ON public.ag_sos_events(user_id);
ALTER TABLE public.ag_sos_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ag_sos_insert_self" ON public.ag_sos_events;
CREATE POLICY "ag_sos_insert_self" ON public.ag_sos_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ag_sos_select_self_or_admin" ON public.ag_sos_events;
CREATE POLICY "ag_sos_select_self_or_admin" ON public.ag_sos_events FOR SELECT
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev')));

DROP POLICY IF EXISTS "ag_sos_update_admin" ON public.ag_sos_events;
CREATE POLICY "ag_sos_update_admin" ON public.ag_sos_events FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev')));

-- Compartir viaje en vivo con contactos (link público temporal)
CREATE TABLE IF NOT EXISTS public.ag_trip_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.ag_trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_shares_token ON public.ag_trip_shares(share_token);
ALTER TABLE public.ag_trip_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_shares_select_all" ON public.ag_trip_shares;
CREATE POLICY "ag_shares_select_all" ON public.ag_trip_shares FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "ag_shares_insert_self" ON public.ag_trip_shares;
CREATE POLICY "ag_shares_insert_self" ON public.ag_trip_shares FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Favoritos de direcciones
CREATE TABLE IF NOT EXISTS public.ag_favorite_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  icon TEXT DEFAULT 'home',
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_fav_user ON public.ag_favorite_addresses(user_id, sort_order);
ALTER TABLE public.ag_favorite_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_fav_self" ON public.ag_favorite_addresses;
CREATE POLICY "ag_fav_self" ON public.ag_favorite_addresses FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Viajes programados
CREATE TABLE IF NOT EXISTS public.ag_scheduled_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  origin_address TEXT NOT NULL,
  origin_lat DOUBLE PRECISION NOT NULL,
  origin_lng DOUBLE PRECISION NOT NULL,
  destination_address TEXT NOT NULL,
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  vehicle_type TEXT,
  suggested_price INTEGER,
  payment_method TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','notified','completed','cancelled','expired')),
  trip_id UUID REFERENCES public.ag_trips(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_sched_user ON public.ag_scheduled_trips(user_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_ag_sched_upcoming ON public.ag_scheduled_trips(scheduled_for) WHERE status = 'pending';
ALTER TABLE public.ag_scheduled_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_sched_self" ON public.ag_scheduled_trips;
CREATE POLICY "ag_sched_self" ON public.ag_scheduled_trips FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Paradas múltiples (waypoints) para un viaje
ALTER TABLE public.ag_trips ADD COLUMN IF NOT EXISTS waypoints JSONB NOT NULL DEFAULT '[]'::jsonb;
-- waypoints: [{address, lat, lng, order}]

-- Propinas del viaje (al conductor)
ALTER TABLE public.ag_trips ADD COLUMN IF NOT EXISTS tip_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.ag_trips ADD COLUMN IF NOT EXISTS tip_paid_at TIMESTAMPTZ;

-- RPC: abrir SOS
CREATE OR REPLACE FUNCTION public.ag_trigger_sos(
  p_user_id UUID, p_trip_id UUID DEFAULT NULL,
  p_lat DOUBLE PRECISION DEFAULT NULL, p_lng DOUBLE PRECISION DEFAULT NULL,
  p_accuracy DOUBLE PRECISION DEFAULT NULL, p_message TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.ag_sos_events (user_id, trip_id, lat, lng, accuracy_m, message)
  VALUES (p_user_id, p_trip_id, p_lat, p_lng, p_accuracy, p_message)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- RPC: crear trip share (token temporal)
CREATE OR REPLACE FUNCTION public.ag_create_trip_share(p_user_id UUID, p_trip_id UUID, p_hours INT DEFAULT 4)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_token TEXT;
BEGIN
  v_token := encode(gen_random_bytes(16), 'base64');
  v_token := replace(replace(replace(v_token, '/', '_'), '+', '-'), '=', '');
  INSERT INTO public.ag_trip_shares (trip_id, user_id, share_token, expires_at)
  VALUES (p_trip_id, p_user_id, v_token, now() + (p_hours || ' hours')::interval);
  RETURN v_token;
END;
$$;
