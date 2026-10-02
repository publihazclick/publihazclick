-- ════════════════════════════════════════════════════════════════════════════
-- 297 — Recordatorio de viaje para otro momento (WhatsApp de pasajeros)
--
-- Caso real 2026-10-01 (…833): pidió carro al aeropuerto "para mañana a las 9".
-- El bot no lo entendió, creó el viaje para YA y un conductor salió a buscarlo.
--
-- Decisión del usuario: NO programar viajes (comprometer a un conductor con horas
-- de anticipación es riesgoso con la flota de hoy), sino RECORDAR: 30 min antes de
-- la hora, el bot le escribe al pasajero el resumen con [Pedir] y se pide en ese
-- momento, a un conductor que esté cerca.
--
-- Límite de WhatsApp: solo se le puede escribir dentro de las 24 h de su último
-- mensaje. El bot no crea recordatorios que caigan después de eso (lo dice de
-- frente), y el cron vuelve a revisar la ventana en el momento de enviar.
-- Aplicada vía Management API, NO db push (ver movi_migration_history_desync_danger).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ag_wa_sessions
  ADD COLUMN IF NOT EXISTS programado_para timestamptz;

COMMENT ON COLUMN public.ag_wa_sessions.programado_para IS
  'Hora a la que el pasajero dijo que necesita el viaje (si no es para ya). Migración 297.';

CREATE TABLE IF NOT EXISTS public.ag_wa_recordatorios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_phone       text NOT NULL,
  viaje_at       timestamptz NOT NULL,
  recordar_at    timestamptz NOT NULL,
  service_type   text NOT NULL DEFAULT 'carro',
  origin_lat     double precision NOT NULL,
  origin_lng     double precision NOT NULL,
  origin_address text NOT NULL,
  dest_name      text NOT NULL,
  dest_lat       double precision NOT NULL,
  dest_lng       double precision NOT NULL,
  estado         text NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente','enviado','ventana_cerrada','cancelado')),
  enviado_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ag_wa_recordatorios_pendientes
  ON public.ag_wa_recordatorios (recordar_at) WHERE estado = 'pendiente';

-- Solo la service role (la edge function y el cron). Nadie más la lee.
ALTER TABLE public.ag_wa_recordatorios ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ag_wa_recordatorios IS
  'Recordatorios de viaje para otro momento: 30 min antes el bot le manda al pasajero el resumen con [Pedir]. Migración 297.';

-- Cron: cada 2 minutos manda los que ya tocan. Mismo patrón que ag_wa_lead_followups.
CREATE OR REPLACE FUNCTION public.ag_wa_enviar_recordatorios()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url   text;
  v_key   text;
  r       record;
  v_count integer := 0;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url'     LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN 0; END IF;

  FOR r IN
    SELECT id, wa_phone FROM ag_wa_recordatorios
    WHERE estado = 'pendiente' AND recordar_at <= NOW()
    ORDER BY recordar_at
    LIMIT 20
  LOOP
    -- Se marca ANTES de llamar: si la función tarda o falla, el siguiente ciclo no lo
    -- vuelve a mandar (un recordatorio repetido es peor que uno perdido). La función
    -- lo pasa a 'ventana_cerrada' si ya no se le puede escribir.
    UPDATE ag_wa_recordatorios SET estado = 'enviado', enviado_at = NOW() WHERE id = r.id;
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/ag-whatsapp',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object(
        '_internal_event', 'recordatorio_viaje',
        'wa_phone',        r.wa_phone,
        'recordatorio_id', r.id
      )::jsonb,
      timeout_milliseconds := 8000
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

SELECT cron.schedule('movi-recordatorios-viaje', '*/2 * * * *', 'SELECT public.ag_wa_enviar_recordatorios();');
