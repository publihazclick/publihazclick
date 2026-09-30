-- ============================================================================
-- Migración 293: dejar de preguntar "¿ya descargaste?" a quien ya dijo que sí
-- (2026-09-30).
--
-- ── EL BUG, REPORTADO POR EL USUARIO ────────────────────────────────────────
-- "Vi que te dicen 'ya descargué la app' y sigues preguntando si ya
-- descargaron." Tenía razón: `ag_wa_lead_followups()` incluye el paso
-- 'descargo' en su lista de recordatorios --
--     WHERE l.paso IN ('nombre','saludado','vehiculo','pitch','descargo')
-- -- y 'descargo' es EXACTAMENTE el paso que significa "la persona ya
-- confirmó que descargó la app" (lo pone leadYaDescargo() cuando alguien toca
-- el botón "Ya la descargué" o escribe algo como "ya me registré"). El
-- recordatorio que dispara para ese paso es el genérico
-- "¿Alcanzaste a descargar la app?" -- la misma pregunta que la persona ya
-- respondió.
--
-- Confirmado en producción antes del arreglo: 2 leads ya en paso 'descargo'
-- (573237203939 y 573187856116) con nudges_enviados = 2 cada uno -- ya habían
-- recibido DOS recordatorios de más, y les faltaba el tercero (a las 20h).
-- Uno de ellos, 573187856116, había escrito explícitamente "Ya me registre" y
-- "Ya estoy claro de todo" antes de seguir recibiendo la pregunta.
--
-- ── EL ARREGLO ─────────────────────────────────────────────────────────────
-- Se quita 'descargo' de la lista de pasos que disparan recordatorio. Una vez
-- que alguien confirma la descarga, el embudo ya cumplió su función -- si
-- tiene dudas del registro en sí, eso lo atiende el FAQ normal cuando escriba,
-- no un recordatorio automático insistiendo en algo que ya pasó.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ag_wa_lead_followups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r        RECORD;
  v_url    TEXT;
  v_key    TEXT;
  v_count  integer := 0;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url'     LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN 0; END IF;

  PERFORM ag_leads_marcar_registrados();

  FOR r IN
    SELECT l.wa_phone, l.nombre_dado, l.paso, l.vehiculo, l.nudges_enviados
    FROM ag_driver_leads l
    -- 'descargo' fuera: ya confirmó que descargó, seguir preguntándole lo
    -- mismo es justo el bug que se reportó.
    WHERE l.paso IN ('nombre','saludado','vehiculo','pitch')
      AND l.no_insistir = FALSE
      AND l.ultimo_in_at IS NOT NULL
      -- Ventana de Meta: SOLO contra su último mensaje entrante.
      AND l.ultimo_in_at > NOW() - interval '23 hours'
      AND l.nudges_enviados < 3
      -- Silencio: desde la última vez que alguno de los dos habló (migración 287).
      AND NOW() - GREATEST(l.ultimo_in_at, COALESCE(l.ultimo_out_at, l.ultimo_in_at))
            >= (ARRAY['20 minutes','3 hours','20 hours'])[l.nudges_enviados + 1]::interval
      AND (l.ultimo_nudge_at IS NULL OR NOW() - l.ultimo_nudge_at >= interval '15 minutes')
    ORDER BY l.ultimo_in_at ASC
    LIMIT 40
  LOOP
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/ag-whatsapp',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object(
        '_internal_event', 'lead_followup',
        'wa_phone',        r.wa_phone,
        'wa_name',         r.nombre_dado,
        'paso',            r.paso,
        'vehiculo',        r.vehiculo,
        'numero_nudge',    r.nudges_enviados + 1
      )::jsonb,
      timeout_milliseconds := 8000
    );

    UPDATE ag_driver_leads
       SET nudges_enviados = nudges_enviados + 1,
           ultimo_nudge_at = NOW(),
           ultimo_out_at   = NOW(),
           updated_at      = NOW()
     WHERE wa_phone = r.wa_phone;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.ag_wa_lead_followups() IS
  'Manda los recordatorios (20 min / 3 h / 20 h) a los leads de conductor que se quedaron callados, siempre dentro de la ventana de 24h de WhatsApp. Excluye paso=descargo: quien ya confirmo la descarga no debe seguir recibiendo esa pregunta. Migracion 293.';

-- Los 2 leads ya afectados: apagarles el contador para que no les llegue el
-- tercer recordatorio que ya tenían en cola.
UPDATE public.ag_driver_leads
   SET nudges_enviados = 3
 WHERE paso = 'descargo' AND nudges_enviados < 3;
