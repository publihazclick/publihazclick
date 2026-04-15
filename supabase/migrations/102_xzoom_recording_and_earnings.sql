-- =============================================================================
-- Migration 102: XZOOM — grabación automática + ganancias al anfitrión
-- - Añade livekit_egress_id a xzoom_live_sessions
-- - RPC xzoom_credit_host_earnings: acredita el 85% al balance del anfitrión
--   cuando un suscriptor activa una suscripción viewer
-- =============================================================================

-- 1. Añadir columna para tracking del egress (grabación)
ALTER TABLE public.xzoom_live_sessions
ADD COLUMN IF NOT EXISTS livekit_egress_id TEXT;

CREATE INDEX IF NOT EXISTS idx_xzoom_live_egress
  ON public.xzoom_live_sessions(livekit_egress_id)
  WHERE livekit_egress_id IS NOT NULL;

COMMENT ON COLUMN public.xzoom_live_sessions.livekit_egress_id IS
  'ID de la sesión de egress (grabación) en LiveKit Cloud. NULL si no se está grabando.';

-- 2. RPC: acreditar ganancias del anfitrión al completarse una suscripción viewer
CREATE OR REPLACE FUNCTION public.xzoom_credit_host_earnings(
  p_subscription_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host_earnings   INTEGER;
  v_host_user_id    UUID;
  v_host_id         UUID;
  v_already_credited BOOLEAN;
BEGIN
  -- Leer datos de la suscripción + host
  SELECT vs.host_earnings_cop, vs.host_id, h.user_id
    INTO v_host_earnings, v_host_id, v_host_user_id
  FROM public.xzoom_viewer_subscriptions vs
  JOIN public.xzoom_hosts h ON h.id = vs.host_id
  WHERE vs.id = p_subscription_id;

  IF v_host_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'subscription_not_found');
  END IF;

  IF v_host_earnings IS NULL OR v_host_earnings <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_earnings');
  END IF;

  -- Acreditar al balance + total_earned del perfil del anfitrión
  UPDATE public.profiles
  SET balance      = COALESCE(balance, 0) + v_host_earnings,
      total_earned = COALESCE(total_earned, 0) + v_host_earnings,
      updated_at   = NOW()
  WHERE id = v_host_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'host_user_id', v_host_user_id,
    'amount_cop', v_host_earnings
  );
END;
$$;

COMMENT ON FUNCTION public.xzoom_credit_host_earnings(UUID) IS
  'Acredita las ganancias (host_earnings_cop) de una suscripción viewer al balance del anfitrión. Llamada desde epayco-webhook tras activar la suscripción.';

GRANT EXECUTE ON FUNCTION public.xzoom_credit_host_earnings(UUID) TO service_role;
