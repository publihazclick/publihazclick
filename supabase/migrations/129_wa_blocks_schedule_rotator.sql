-- =============================================================================
-- Migración 129: bloques, ventana horaria, días permitidos y rotador de mensajes
-- =============================================================================
-- 1) División en bloques: al iniciar la campaña, el worker reparte los
--    destinatarios en N bloques y procesa uno a la vez. current_block indica
--    cuál está enviándose ahora.
-- 2) Ventana horaria: schedule_start/end_time (ej 09:00 / 18:00) y
--    schedule_days (0=domingo, 6=sábado) limitan cuándo puede enviar el worker.
-- 3) Rotador: wa_templates.content_variants contiene textos alternativos.
--    El worker elige uno aleatorio (incluyendo el content base) por mensaje
--    para reducir detección como spam.
-- =============================================================================

-- ── Campañas ────────────────────────────────────────────────────────────────
ALTER TABLE wa_campaigns
  ADD COLUMN IF NOT EXISTS block_count            int   NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_block          int   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schedule_start_time    time,
  ADD COLUMN IF NOT EXISTS schedule_end_time      time,
  ADD COLUMN IF NOT EXISTS schedule_days          int[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS schedule_timezone      text  NOT NULL DEFAULT 'America/Bogota';

-- Validaciones: block_count >= 1
ALTER TABLE wa_campaigns
  DROP CONSTRAINT IF EXISTS wa_campaigns_block_count_check;
ALTER TABLE wa_campaigns
  ADD CONSTRAINT wa_campaigns_block_count_check CHECK (block_count >= 1);

-- ── Mensajes de campaña ─────────────────────────────────────────────────────
ALTER TABLE wa_campaign_messages
  ADD COLUMN IF NOT EXISTS block_index int NOT NULL DEFAULT 0;

-- Índice para que el worker pueda filtrar rápido por bloque
CREATE INDEX IF NOT EXISTS wa_campaign_messages_block_idx
  ON wa_campaign_messages (campaign_id, block_index, status);

-- ── Plantillas (rotador) ────────────────────────────────────────────────────
ALTER TABLE wa_templates
  ADD COLUMN IF NOT EXISTS content_variants text[] NOT NULL DEFAULT '{}';

-- ── Función auxiliar: ¿la campaña está en ventana horaria AHORA? ────────────
-- Devuelve true si:
--   - no tiene ventana (schedule_start/end ambos NULL), o
--   - la hora actual en la TZ de la campaña cae dentro de [start, end]
--     Y el día de la semana está permitido (schedule_days vacío = todos)
CREATE OR REPLACE FUNCTION wa_campaign_in_window(c wa_campaigns)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  now_local timestamptz;
  current_t time;
  current_dow int;
BEGIN
  -- Si no hay ventana definida, siempre se puede enviar
  IF c.schedule_start_time IS NULL OR c.schedule_end_time IS NULL THEN
    RETURN true;
  END IF;

  now_local   := now() AT TIME ZONE c.schedule_timezone;
  current_t   := now_local::time;
  current_dow := EXTRACT(DOW FROM now_local)::int;  -- 0=dom ... 6=sab

  -- Día debe estar permitido (si el array está vacío, todos valen)
  IF array_length(c.schedule_days, 1) IS NOT NULL
     AND NOT (current_dow = ANY (c.schedule_days)) THEN
    RETURN false;
  END IF;

  -- Comparación de horas. Soporta ventanas que cruzan medianoche
  -- (ej 22:00–02:00) aunque lo normal es 09:00–18:00.
  IF c.schedule_start_time <= c.schedule_end_time THEN
    RETURN current_t >= c.schedule_start_time AND current_t <= c.schedule_end_time;
  ELSE
    RETURN current_t >= c.schedule_start_time OR current_t <= c.schedule_end_time;
  END IF;
END;
$$;
