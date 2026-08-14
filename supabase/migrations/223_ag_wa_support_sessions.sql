-- Sesiones del bot de soporte para conductores por WhatsApp (número separado del
-- número de pedir viajes, ver memoria movi_whatsapp_support_number). Solo guarda si
-- la conversación ya fue escalada a un humano, para que el bot no siga respondiendo
-- automáticamente por encima de un asesor real.
CREATE TABLE IF NOT EXISTS ag_wa_support_sessions (
  wa_phone        text PRIMARY KEY,
  escalated       boolean NOT NULL DEFAULT false,
  escalated_at    timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
