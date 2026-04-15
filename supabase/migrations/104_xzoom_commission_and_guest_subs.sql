-- =============================================================================
-- Migración 104: XZOOM EN VIVO — comisión dinámica + suscripciones de invitados
--
-- Cambios de negocio:
-- 1. Ya NO se cobra al anfitrión. Se activa por defecto al crear su perfil.
-- 2. La plataforma cobra una comisión porcentual sobre cada suscripción viewer.
--    El % es editable por admin en platform_settings.xzoom_commission_rate (default 0.12).
-- 3. Los visitantes que llegan por el link privado del anfitrión pueden suscribirse
--    y pagar SIN tener cuenta previa. Tras validar el pago, el webhook crea el
--    usuario en Supabase Auth con el email del pago y le envía un link para
--    setear su contraseña.
-- =============================================================================

-- 1. Valor por defecto 12% en platform_settings
INSERT INTO platform_settings (key, value)
VALUES ('xzoom_commission_rate', '0.12')
ON CONFLICT (key) DO NOTHING;

-- 2. xzoom_hosts: los anfitriones quedan activos al crear el perfil (sin paywall)
ALTER TABLE public.xzoom_hosts ALTER COLUMN is_active SET DEFAULT TRUE;
-- Activar a los que hayan quedado inactivos por el modelo anterior
UPDATE public.xzoom_hosts SET is_active = TRUE WHERE is_active IS DISTINCT FROM TRUE;

-- 3. xzoom_viewer_subscriptions: permitir suscripciones de visitantes (sin cuenta aún)
ALTER TABLE public.xzoom_viewer_subscriptions
  ALTER COLUMN viewer_user_id DROP NOT NULL;

ALTER TABLE public.xzoom_viewer_subscriptions
  ADD COLUMN IF NOT EXISTS guest_email      TEXT,
  ADD COLUMN IF NOT EXISTS guest_full_name  TEXT,
  ADD COLUMN IF NOT EXISTS activation_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.xzoom_viewer_subscriptions.guest_email IS
  'Email del visitante que pagó sin tener cuenta todavía. Al activar el pago, el webhook crea el auth user con este email y envía link de activación.';
COMMENT ON COLUMN public.xzoom_viewer_subscriptions.guest_full_name IS
  'Nombre del visitante capturado en la landing privada del anfitrión antes de pagar.';
COMMENT ON COLUMN public.xzoom_viewer_subscriptions.activation_sent_at IS
  'Timestamp del envío del email de activación al visitante tras pagar.';

-- Índice para búsqueda rápida por guest email
CREATE INDEX IF NOT EXISTS idx_xzoom_viewer_subs_guest_email
  ON public.xzoom_viewer_subscriptions(guest_email)
  WHERE guest_email IS NOT NULL;

-- 4. RPC helper: vincular una sub guest a un user_id (lo llama el webhook tras crear el auth user)
CREATE OR REPLACE FUNCTION public.xzoom_link_guest_subscription(
  p_subscription_id UUID,
  p_user_id         UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.xzoom_viewer_subscriptions
  SET viewer_user_id = p_user_id,
      activation_sent_at = COALESCE(activation_sent_at, NOW()),
      updated_at = NOW()
  WHERE id = p_subscription_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.xzoom_link_guest_subscription(UUID, UUID) TO service_role;

-- 5. Política RLS: permitir INSERT públicos a xzoom_viewer_subscriptions SOLO cuando
--    se crea como guest (viewer_user_id NULL y guest_email presente). La edge function
--    usa service_role así que esto no aplica para ella, pero por si acaso.
-- (Las políticas existentes siguen vigentes para users autenticados.)
