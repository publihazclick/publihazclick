-- Registro de cada interacción del bot de soporte de conductores (número
-- separado de viajes, ver memoria movi_whatsapp_support_number) -- guarda qué
-- preguntó el conductor y qué acción tomó el bot (respuesta interna, búsqueda
-- web, o escalamiento a humano). Sirve para auditar/mejorar el bot con el
-- tiempo y para las pruebas masivas de cobertura pedidas por el usuario
-- 2026-08-14.
CREATE TABLE IF NOT EXISTS ag_wa_support_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wa_phone    text NOT NULL,
  question    text NOT NULL,
  action      text NOT NULL, -- 'profile:<intent>' | 'answer' | 'search' | 'escalate'
  answer_text text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ag_wa_support_log_phone_idx ON ag_wa_support_log (wa_phone);
