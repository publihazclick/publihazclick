-- ============================================================================
-- 237: Registro de mensajes de WhatsApp (Movi) para el panel de soporte
--
-- Hasta ahora solo se guardaba texto de conversaciones del número de soporte
-- a conductores (ag_wa_support_log). El número principal (pedidos de viaje de
-- pasajeros) solo guardaba estado estructurado (ag_wa_sessions), sin
-- transcripción legible. Esta tabla guarda CADA mensaje (entrante y saliente)
-- de ambos números, para poder verlos como conversación en el panel admin.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ag_wa_message_log (
  id          BIGSERIAL PRIMARY KEY,
  wa_phone    TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('conductor', 'pasajero')),
  direction   TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  msg_type    TEXT NOT NULL DEFAULT 'text',
  body        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ag_wa_message_log_phone_created
  ON ag_wa_message_log(wa_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ag_wa_message_log_role_created
  ON ag_wa_message_log(role, created_at DESC);

-- RLS habilitado sin políticas (igual que ag_wa_support_log): nadie con la
-- clave anon/authenticated puede leer esto directo. El panel admin lee vía
-- ag-admin-action, que usa service_role y valida admin/dev contra el JWT real
-- de publihazclick server-side (el admin nunca tiene sesión en el proyecto de
-- Movi -- ver el comentario al inicio de ag-admin-action/index.ts).
ALTER TABLE ag_wa_message_log ENABLE ROW LEVEL SECURITY;

-- ── Resumen de conversaciones (última línea por número), para el panel ────────
-- Se usa desde ag-admin-action con service_role, así que no depende de RLS.
CREATE OR REPLACE FUNCTION ag_wa_conversations_summary(p_role TEXT)
RETURNS TABLE (
  wa_phone    TEXT,
  last_body   TEXT,
  last_dir    TEXT,
  last_type   TEXT,
  last_at     TIMESTAMPTZ,
  msg_count   BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT DISTINCT ON (wa_phone)
    wa_phone, body, direction, msg_type, created_at,
    COUNT(*) OVER (PARTITION BY wa_phone)
  FROM ag_wa_message_log
  WHERE role = p_role
  ORDER BY wa_phone, created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION ag_wa_conversations_summary(TEXT) TO service_role;
