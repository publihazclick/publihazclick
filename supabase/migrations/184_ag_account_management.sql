-- =============================================================================
-- Migration 184: Cambio de número de celular + baja de cuenta (self-service)
-- Pedido explícito del usuario 2026-08-04, para el menú de conductor y pasajero.
-- =============================================================================

-- ── Baja de cuenta: marcador propio, distinto de is_blocked (que es para
--    moderación/admin) -- así no se confunden los dos motivos ──────────────
ALTER TABLE public.ag_users
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── RPC: dar de baja la cuenta propia ─────────────────────────────────────
-- No borra nada (se conserva el historial de viajes/comisiones por temas
-- contables) -- solo bloquea el login y saca al conductor de línea. Rechaza
-- si hay un viaje sin terminar (como conductor o como pasajero) para no
-- dejar a alguien colgado a mitad de un servicio.
CREATE OR REPLACE FUNCTION public.ag_deactivate_account(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user       record;
  v_driver_id  uuid;
  v_active     integer;
BEGIN
  SELECT * INTO v_user FROM public.ag_users WHERE id = p_user_id;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cuenta no encontrada');
  END IF;

  -- BUG REAL evitado antes de desplegar: sin este chequeo, cualquier sesión
  -- autenticada podía dar de baja la cuenta de OTRO usuario con solo mandar
  -- su id -- SECURITY DEFINER se salta RLS, así que la validación de dueño
  -- tiene que estar adentro de la función misma.
  IF v_user.auth_user_id IS NULL OR v_user.auth_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  IF v_user.is_deleted THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cuenta ya estaba dada de baja');
  END IF;

  SELECT id INTO v_driver_id FROM public.ag_drivers WHERE ag_user_id = p_user_id;

  SELECT COUNT(*) INTO v_active
  FROM public.ag_trip_requests
  WHERE status NOT IN ('completed', 'cancelled')
    AND (passenger_user_id = p_user_id OR (v_driver_id IS NOT NULL AND driver_id = v_driver_id));

  IF v_active > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tienes un viaje sin terminar. Termínalo o cancélalo antes de dar de baja tu cuenta.');
  END IF;

  UPDATE public.ag_users SET is_deleted = true, deleted_at = now() WHERE id = p_user_id;

  IF v_driver_id IS NOT NULL THEN
    UPDATE public.ag_drivers SET is_online = false WHERE id = v_driver_id;
  END IF;

  IF v_user.auth_user_id IS NOT NULL THEN
    DELETE FROM public.ag_push_subs WHERE user_id = v_user.auth_user_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── Índice para no barrer toda la tabla al validar "cuenta ya tomada" en
--    el cambio de número (ag-change-phone hace un SELECT por phone) ────────
CREATE INDEX IF NOT EXISTS ag_users_phone_idx ON public.ag_users(phone) WHERE is_deleted = false;
