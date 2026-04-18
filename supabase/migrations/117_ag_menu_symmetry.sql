-- =============================================================================
-- Migration 117: Movi — Simetría menús pasajero↔conductor
-- Pasajero: blacklist conductores
-- Conductor: settings generales (notify/privacy) separados
-- =============================================================================

-- =============================================================================
-- 1. BLACKLIST DE CONDUCTORES (pasajero bloquea conductor)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ag_driver_blacklist (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_user_id uuid NOT NULL REFERENCES public.ag_users(id) ON DELETE CASCADE,
  driver_id         uuid NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (passenger_user_id, driver_id)
);
CREATE INDEX IF NOT EXISTS idx_ag_dbl_passenger ON public.ag_driver_blacklist(passenger_user_id);
CREATE INDEX IF NOT EXISTS idx_ag_dbl_driver ON public.ag_driver_blacklist(driver_id);

ALTER TABLE public.ag_driver_blacklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_dbl_self" ON public.ag_driver_blacklist;
CREATE POLICY "ag_dbl_self" ON public.ag_driver_blacklist FOR ALL
  USING (passenger_user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()))
  WITH CHECK (passenger_user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()));

-- =============================================================================
-- 2. Columnas de configuración / notificaciones para ag_users y ag_drivers
-- =============================================================================
ALTER TABLE public.ag_users ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.ag_users ADD COLUMN IF NOT EXISTS tutorial_completed_at TIMESTAMPTZ;
ALTER TABLE public.ag_users ADD COLUMN IF NOT EXISTS notify_sound BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.ag_users ADD COLUMN IF NOT EXISTS notify_vibration BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.ag_users ADD COLUMN IF NOT EXISTS notify_new_offers BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.ag_users ADD COLUMN IF NOT EXISTS hide_phone BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.ag_users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'es';

-- Driver: asegurar columnas de notify/privacy independientes (ya existen algunas)
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS notify_new_requests BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS notify_trip_updates BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS notify_earnings BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.ag_drivers ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'es';

-- =============================================================================
-- 3. RPC: actualizar settings unificados
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ag_update_user_settings(
  p_notify_sound boolean DEFAULT NULL,
  p_notify_vibration boolean DEFAULT NULL,
  p_notify_new_offers boolean DEFAULT NULL,
  p_hide_phone boolean DEFAULT NULL,
  p_language text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user uuid;
BEGIN
  SELECT id INTO v_user FROM public.ag_users WHERE auth_user_id = auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'No user'; END IF;
  UPDATE public.ag_users SET
    notify_sound = COALESCE(p_notify_sound, notify_sound),
    notify_vibration = COALESCE(p_notify_vibration, notify_vibration),
    notify_new_offers = COALESCE(p_notify_new_offers, notify_new_offers),
    hide_phone = COALESCE(p_hide_phone, hide_phone),
    language = COALESCE(p_language, language)
  WHERE id = v_user;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_update_user_settings(boolean,boolean,boolean,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ag_update_driver_notify_settings(
  p_notify_new_requests boolean DEFAULT NULL,
  p_notify_trip_updates boolean DEFAULT NULL,
  p_notify_earnings boolean DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.ag_drivers SET
    notify_new_requests = COALESCE(p_notify_new_requests, notify_new_requests),
    notify_trip_updates = COALESCE(p_notify_trip_updates, notify_trip_updates),
    notify_earnings = COALESCE(p_notify_earnings, notify_earnings)
  WHERE ag_user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_update_driver_notify_settings(boolean,boolean,boolean) TO authenticated;

-- =============================================================================
-- 4. Reportar problema conductor: usa ag_reports existente
-- (ya tiene reporter_user_id + trip_id + type + description + status)
-- =============================================================================
-- Nada que crear. Solo confirmar que conductor puede insertar en ag_reports.
