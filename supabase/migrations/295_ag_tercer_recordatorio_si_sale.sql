-- ════════════════════════════════════════════════════════════════════════════
-- 295 — El tercer recordatorio a los leads de conductor por fin puede salir
--
-- BUG medido el 2026-10-01: desde que existe el embudo (29 sep) salieron 54
-- recordatorios #1 y 13 #2, pero CERO #3. La regla medía el silencio desde
-- GREATEST(ultimo_in_at, ultimo_out_at), y cada recordatorio pone
-- ultimo_out_at = NOW(). O sea que los tiempos se SUMABAN:
--   #1 a los 20 min, #2 a 20 min + 3 h, #3 a 20 min + 3 h + 20 h ≈ 23 h 20 min
-- ...y la misma consulta exige ultimo_in_at > NOW() - 23 h (la ventana de
-- WhatsApp). Las dos condiciones no se cumplían nunca a la vez.
--
-- Arreglo: los tres toques se cuentan desde el ÚLTIMO MENSAJE DE LA PERSONA
-- (20 min / 3 h / 20 h, como siempre se pensó), y aparte se exige que el bot
-- lleve al menos 20 min sin escribirle -- eso cubre lo que GREATEST protegía:
-- no empujar a alguien justo después de que el bot le mandó algo.
--
-- Lo demás queda idéntico a la 294 (incluido excluir paso='descargo').
-- Aplicada vía Management API, NO db push (ver movi_migration_history_desync_danger).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ag_wa_lead_followups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_url    text;
  v_key    text;
  r        record;
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
    -- mismo es justo el bug que se reportó (migración 294).
    WHERE l.paso IN ('nombre','saludado','vehiculo','pitch')
      AND l.no_insistir = FALSE
      AND l.ultimo_in_at IS NOT NULL
      -- Ventana de Meta: SOLO contra su último mensaje entrante.
      AND l.ultimo_in_at > NOW() - interval '23 hours'
      AND l.nudges_enviados < 3
      -- Silencio de LA PERSONA, contado desde su último mensaje (no acumulado).
      AND NOW() - l.ultimo_in_at
            >= (ARRAY['20 minutes','3 hours','20 hours'])[l.nudges_enviados + 1]::interval
      -- Y el bot no le acaba de escribir.
      AND (l.ultimo_out_at IS NULL OR NOW() - l.ultimo_out_at >= interval '20 minutes')
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
  'Manda los recordatorios (20 min / 3 h / 20 h desde el ultimo mensaje de la persona) a los leads de conductor que se quedaron callados, dentro de la ventana de 24h de WhatsApp. Excluye paso=descargo. Migracion 295: antes los tiempos se sumaban y el #3 nunca salia.';
