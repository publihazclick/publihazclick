-- =============================================================================
-- Migration 101: XZOOM EN VIVO
-- Plataforma de transmisiones en vivo con doble suscripción:
--   1) Anfitriones pagan mensual a Publihazclick para poder transmitir
--   2) Suscriptores pagan mensual al anfitrión para ver en vivo + grabaciones
-- Diseño: tablas independientes con prefijo xzoom_*, cero impacto en PTC/existente.
-- =============================================================================

-- 1. Añadir valores al enum user_role (no destructivo, IF NOT EXISTS)
--    Nota: ALTER TYPE ADD VALUE no puede usarse dentro de la misma transacción
--    donde se use el nuevo valor. Como no insertamos datos con esos roles en
--    esta migración, es seguro ejecutarlo al inicio.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'xzoom_host';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'xzoom_viewer';

-- =============================================================================
-- 2. xzoom_hosts — perfil público del anfitrión
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.xzoom_hosts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  slug                  TEXT NOT NULL UNIQUE,
  display_name          TEXT NOT NULL,
  bio                   TEXT,
  avatar_url            TEXT,
  cover_url             TEXT,
  category              TEXT,
  subscriber_price_cop  INTEGER NOT NULL DEFAULT 0 CHECK (subscriber_price_cop >= 0),
  currency              TEXT NOT NULL DEFAULT 'COP',
  is_active             BOOLEAN NOT NULL DEFAULT FALSE,
  livekit_room_name     TEXT NOT NULL UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT xzoom_hosts_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$')
);

CREATE INDEX IF NOT EXISTS idx_xzoom_hosts_user_id ON public.xzoom_hosts(user_id);
CREATE INDEX IF NOT EXISTS idx_xzoom_hosts_active ON public.xzoom_hosts(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE public.xzoom_hosts IS 'Perfil público de anfitrión de XZOOM EN VIVO. is_active=TRUE solo si tiene suscripción de anfitrión activa.';
COMMENT ON COLUMN public.xzoom_hosts.subscriber_price_cop IS 'Precio mensual en COP que cobra el anfitrión a sus suscriptores.';
COMMENT ON COLUMN public.xzoom_hosts.livekit_room_name IS 'Nombre único de la sala en LiveKit (generado al crear el host).';

-- =============================================================================
-- 3. xzoom_host_subscriptions — anfitrión paga a Publihazclick
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.xzoom_host_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id             UUID NOT NULL REFERENCES public.xzoom_hosts(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'inactive'
                      CHECK (status IN ('inactive','pending','active','cancelled','expired')),
  price_usd           NUMERIC(10,2) NOT NULL DEFAULT 48.00,
  price_cop           INTEGER,
  currency            TEXT NOT NULL DEFAULT 'USD',
  started_at          TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  auto_renew          BOOLEAN NOT NULL DEFAULT TRUE,
  payment_method      TEXT NOT NULL DEFAULT 'epayco',
  payment_reference   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xzoom_host_subs_host_id ON public.xzoom_host_subscriptions(host_id);
CREATE INDEX IF NOT EXISTS idx_xzoom_host_subs_user_id ON public.xzoom_host_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_xzoom_host_subs_active
  ON public.xzoom_host_subscriptions(host_id, expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_xzoom_host_subs_reference
  ON public.xzoom_host_subscriptions(payment_reference) WHERE payment_reference IS NOT NULL;

COMMENT ON TABLE public.xzoom_host_subscriptions IS 'Suscripción mensual del anfitrión a XZOOM EN VIVO (pagada a Publihazclick).';

-- =============================================================================
-- 4. xzoom_viewer_subscriptions — suscriptor paga al anfitrión
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.xzoom_viewer_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  host_id             UUID NOT NULL REFERENCES public.xzoom_hosts(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'inactive'
                      CHECK (status IN ('inactive','pending','active','cancelled','expired')),
  price_cop           INTEGER NOT NULL CHECK (price_cop >= 0),
  currency            TEXT NOT NULL DEFAULT 'COP',
  commission_rate     NUMERIC(5,4) NOT NULL DEFAULT 0.1500 CHECK (commission_rate >= 0 AND commission_rate <= 1),
  platform_cop        INTEGER,
  host_earnings_cop   INTEGER,
  started_at          TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  auto_renew          BOOLEAN NOT NULL DEFAULT TRUE,
  payment_method      TEXT NOT NULL DEFAULT 'epayco',
  payment_reference   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xzoom_viewer_subs_viewer ON public.xzoom_viewer_subscriptions(viewer_user_id);
CREATE INDEX IF NOT EXISTS idx_xzoom_viewer_subs_host ON public.xzoom_viewer_subscriptions(host_id);
CREATE INDEX IF NOT EXISTS idx_xzoom_viewer_subs_reference
  ON public.xzoom_viewer_subscriptions(payment_reference) WHERE payment_reference IS NOT NULL;
-- Un suscriptor solo puede tener UNA suscripción activa por anfitrión
CREATE UNIQUE INDEX IF NOT EXISTS idx_xzoom_viewer_subs_active_unique
  ON public.xzoom_viewer_subscriptions(viewer_user_id, host_id) WHERE status = 'active';

COMMENT ON TABLE public.xzoom_viewer_subscriptions IS 'Suscripción mensual de un suscriptor a un anfitrión. Publihazclick retiene comisión (commission_rate).';
COMMENT ON COLUMN public.xzoom_viewer_subscriptions.commission_rate IS 'Comisión de Publihazclick (0.15 = 15%). El resto va al anfitrión.';

-- =============================================================================
-- 5. xzoom_scheduled_sessions — sesiones programadas por el anfitrión
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.xzoom_scheduled_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id           UUID NOT NULL REFERENCES public.xzoom_hosts(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0 AND duration_minutes <= 600),
  status            TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','live','ended','cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xzoom_scheduled_host_id ON public.xzoom_scheduled_sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_xzoom_scheduled_upcoming
  ON public.xzoom_scheduled_sessions(scheduled_at) WHERE status IN ('scheduled','live');

COMMENT ON TABLE public.xzoom_scheduled_sessions IS 'Sesiones programadas por un anfitrión en su sala fija. El anfitrión decide cuándo abrirlas.';

-- =============================================================================
-- 6. xzoom_live_sessions — instancias reales de transmisión (historial)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.xzoom_live_sessions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id                    UUID NOT NULL REFERENCES public.xzoom_hosts(id) ON DELETE CASCADE,
  scheduled_session_id       UUID REFERENCES public.xzoom_scheduled_sessions(id) ON DELETE SET NULL,
  livekit_room_name          TEXT NOT NULL,
  started_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at                   TIMESTAMPTZ,
  peak_viewers               INTEGER NOT NULL DEFAULT 0,
  total_unique_viewers       INTEGER NOT NULL DEFAULT 0,
  recording_status           TEXT NOT NULL DEFAULT 'pending'
                             CHECK (recording_status IN ('pending','processing','ready','failed','disabled')),
  recording_url              TEXT,
  recording_size_bytes       BIGINT,
  recording_duration_seconds INTEGER,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xzoom_live_host_id ON public.xzoom_live_sessions(host_id);
CREATE INDEX IF NOT EXISTS idx_xzoom_live_recordings_ready
  ON public.xzoom_live_sessions(host_id, created_at DESC) WHERE recording_status = 'ready';

COMMENT ON TABLE public.xzoom_live_sessions IS 'Historial de transmisiones reales. Una sesión programada puede generar una live_session; grabación queda vinculada a esta tabla.';

-- =============================================================================
-- 7. xzoom_session_viewers — registro de asistencia por transmisión
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.xzoom_session_viewers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id   UUID NOT NULL REFERENCES public.xzoom_live_sessions(id) ON DELETE CASCADE,
  viewer_user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at           TIMESTAMPTZ,
  duration_seconds  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_xzoom_session_viewers_session ON public.xzoom_session_viewers(live_session_id);
CREATE INDEX IF NOT EXISTS idx_xzoom_session_viewers_viewer ON public.xzoom_session_viewers(viewer_user_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.xzoom_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xzoom_host_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xzoom_viewer_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xzoom_scheduled_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xzoom_live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xzoom_session_viewers ENABLE ROW LEVEL SECURITY;

-- xzoom_hosts: cualquiera ve anfitriones activos (landing pública); dueño ve el suyo siempre
CREATE POLICY "xzoom_hosts_public_read"
  ON public.xzoom_hosts FOR SELECT
  USING (is_active = TRUE OR user_id = auth.uid());

CREATE POLICY "xzoom_hosts_owner_insert"
  ON public.xzoom_hosts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "xzoom_hosts_owner_update"
  ON public.xzoom_hosts FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- xzoom_host_subscriptions: dueño lee la suya; inserts/updates vía service role (edge functions)
CREATE POLICY "xzoom_host_subs_owner_read"
  ON public.xzoom_host_subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- xzoom_viewer_subscriptions: viewer lee las suyas; anfitrión lee las que apuntan a él
CREATE POLICY "xzoom_viewer_subs_viewer_read"
  ON public.xzoom_viewer_subscriptions FOR SELECT
  USING (viewer_user_id = auth.uid());

CREATE POLICY "xzoom_viewer_subs_host_read"
  ON public.xzoom_viewer_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.xzoom_hosts h
      WHERE h.id = xzoom_viewer_subscriptions.host_id AND h.user_id = auth.uid()
    )
  );

-- xzoom_scheduled_sessions: público lee si el anfitrión está activo; dueño lee siempre y gestiona
CREATE POLICY "xzoom_scheduled_public_read"
  ON public.xzoom_scheduled_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.xzoom_hosts h
      WHERE h.id = xzoom_scheduled_sessions.host_id
        AND (h.is_active = TRUE OR h.user_id = auth.uid())
    )
  );

CREATE POLICY "xzoom_scheduled_owner_write"
  ON public.xzoom_scheduled_sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.xzoom_hosts h
      WHERE h.id = xzoom_scheduled_sessions.host_id AND h.user_id = auth.uid()
    )
  );

CREATE POLICY "xzoom_scheduled_owner_update"
  ON public.xzoom_scheduled_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.xzoom_hosts h
      WHERE h.id = xzoom_scheduled_sessions.host_id AND h.user_id = auth.uid()
    )
  );

CREATE POLICY "xzoom_scheduled_owner_delete"
  ON public.xzoom_scheduled_sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.xzoom_hosts h
      WHERE h.id = xzoom_scheduled_sessions.host_id AND h.user_id = auth.uid()
    )
  );

-- xzoom_live_sessions: anfitrión dueño o suscriptor con suscripción activa al anfitrión
CREATE POLICY "xzoom_live_read_auth"
  ON public.xzoom_live_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.xzoom_hosts h
      WHERE h.id = xzoom_live_sessions.host_id AND h.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.xzoom_viewer_subscriptions vs
      WHERE vs.host_id = xzoom_live_sessions.host_id
        AND vs.viewer_user_id = auth.uid()
        AND vs.status = 'active'
        AND vs.expires_at > NOW()
    )
  );

-- xzoom_session_viewers: el propio viewer lee su registro, el anfitrión ve todo el suyo
CREATE POLICY "xzoom_session_viewers_read"
  ON public.xzoom_session_viewers FOR SELECT
  USING (
    viewer_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.xzoom_live_sessions ls
      JOIN public.xzoom_hosts h ON h.id = ls.host_id
      WHERE ls.id = xzoom_session_viewers.live_session_id AND h.user_id = auth.uid()
    )
  );

-- =============================================================================
-- TRIGGERS — updated_at automático
-- =============================================================================

CREATE OR REPLACE FUNCTION public.xzoom_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xzoom_hosts_updated_at ON public.xzoom_hosts;
CREATE TRIGGER trg_xzoom_hosts_updated_at
  BEFORE UPDATE ON public.xzoom_hosts
  FOR EACH ROW EXECUTE FUNCTION public.xzoom_set_updated_at();

DROP TRIGGER IF EXISTS trg_xzoom_host_subs_updated_at ON public.xzoom_host_subscriptions;
CREATE TRIGGER trg_xzoom_host_subs_updated_at
  BEFORE UPDATE ON public.xzoom_host_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.xzoom_set_updated_at();

DROP TRIGGER IF EXISTS trg_xzoom_viewer_subs_updated_at ON public.xzoom_viewer_subscriptions;
CREATE TRIGGER trg_xzoom_viewer_subs_updated_at
  BEFORE UPDATE ON public.xzoom_viewer_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.xzoom_set_updated_at();

DROP TRIGGER IF EXISTS trg_xzoom_scheduled_updated_at ON public.xzoom_scheduled_sessions;
CREATE TRIGGER trg_xzoom_scheduled_updated_at
  BEFORE UPDATE ON public.xzoom_scheduled_sessions
  FOR EACH ROW EXECUTE FUNCTION public.xzoom_set_updated_at();

-- =============================================================================
-- FUNCIÓN HELPER — verificar suscripción activa de viewer a host
-- Usada por edge functions para autorizar join a sala / descarga de grabación
-- =============================================================================

CREATE OR REPLACE FUNCTION public.xzoom_has_active_viewer_subscription(
  p_viewer_user_id UUID,
  p_host_id        UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.xzoom_viewer_subscriptions
    WHERE viewer_user_id = p_viewer_user_id
      AND host_id = p_host_id
      AND status = 'active'
      AND expires_at > NOW()
  );
$$;
