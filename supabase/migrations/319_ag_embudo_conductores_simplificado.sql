-- 319: embudo de conductores simplificado (pedido del usuario 2026-10-05)
--
-- "cuando alguien escribe por primera vez al soporte de whatsapp de conductores tu respondes con el
-- saludo ... esperamos que la persona nos responda ... luego mandas el segundo mensaje ... quita el
-- botón ya la descargué ... todo lo demás omítelo a no ser que el usuario pregunte algo puntual".
--
-- Antes, ag_wa_lead_followups mandaba hasta 3 "¿sigues ahí?" (20 min, 3 h y 20 h) en cualquier paso.
-- Ahora el cron manda solo esto, y cada cosa UNA vez:
--   1. paso 'nombre', 15 min sin contestar el saludo  -> el link de descarga igual (evento lead_followup).
--   2. paso 'pitch', 3 h con el link sin pedir el código en la app -> un recordatorio con el link.
--      Si pidió el código (pidio_codigo_at, migración 318) ya la descargó: nunca se le recuerda.
--   3. registrado sin recargar -> el "gana invitando" corto (evento lead_invita_gana), a las 24 h del
--      registro o antes si se le va a cerrar la ventana de 24 h de WhatsApp (21 h desde su último
--      mensaje), pero nunca antes de 2 h de registrado. Si recarga antes, sale con la recarga.
--
-- Nunca se le escribe si pidió que no (no_insistir) o si el dueño le escribió a mano en los últimos
-- 30 minutos.

ALTER TABLE public.ag_driver_leads
  ADD COLUMN IF NOT EXISTS recordatorio_descarga_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invita_gana_at           TIMESTAMPTZ;

COMMENT ON COLUMN public.ag_driver_leads.recordatorio_descarga_at IS
  'Cuándo se le mandó el único recordatorio "¿Pudiste descargar la app?" (migración 319).';
COMMENT ON COLUMN public.ag_driver_leads.invita_gana_at IS
  'Cuándo se le mandó el "gana invitando" (una vez en la vida; migración 319).';

-- Quien ya recibió recordatorios con el sistema viejo no recibe uno más con el nuevo.
UPDATE public.ag_driver_leads
   SET recordatorio_descarga_at = COALESCE(ultimo_nudge_at, NOW())
 WHERE paso = 'pitch' AND nudges_enviados > 0 AND recordatorio_descarga_at IS NULL;

CREATE OR REPLACE FUNCTION public.ag_wa_lead_followups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- 1 y 2: el link a los 15 min sin respuesta al saludo, y el único recordatorio a las 3 h.
  FOR r IN
    SELECT l.wa_phone, l.paso
    FROM ag_driver_leads l
    WHERE l.no_insistir = FALSE
      AND l.ultimo_in_at IS NOT NULL
      -- Ventana de Meta: SOLO contra su último mensaje entrante.
      AND l.ultimo_in_at > NOW() - interval '23 hours'
      AND (
            (l.paso = 'nombre'
              AND l.nudges_enviados = 0
              AND NOW() - l.ultimo_in_at >= interval '15 minutes'
              AND (l.ultimo_out_at IS NULL OR NOW() - l.ultimo_out_at >= interval '15 minutes'))
         OR (l.paso = 'pitch'
              AND l.pidio_codigo_at IS NULL
              AND l.recordatorio_descarga_at IS NULL
              AND NOW() - l.ultimo_in_at >= interval '3 hours'
              AND (l.ultimo_out_at IS NULL OR NOW() - l.ultimo_out_at >= interval '3 hours'))
          )
      AND NOT EXISTS (
            SELECT 1 FROM ag_wa_message_log m
             WHERE m.wa_phone = l.wa_phone AND m.role = 'conductor' AND m.direction = 'out'
               AND m.sent_by = 'admin' AND m.created_at > NOW() - interval '30 minutes')
    ORDER BY l.ultimo_in_at ASC
    LIMIT 40
  LOOP
    -- Se marca ANTES del envío: net.http_post sale recién al terminar la transacción, así que la
    -- próxima vuelta del cron (5 min) ya no lo vuelve a tomar.
    UPDATE ag_driver_leads
       SET nudges_enviados          = nudges_enviados + 1,
           recordatorio_descarga_at = CASE WHEN r.paso = 'pitch' THEN NOW() ELSE recordatorio_descarga_at END,
           ultimo_nudge_at          = NOW(),
           ultimo_out_at            = NOW(),
           updated_at               = NOW()
     WHERE wa_phone = r.wa_phone;

    PERFORM net.http_post(
      url     := v_url || '/functions/v1/ag-whatsapp',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object('_internal_event', 'lead_followup',
                                    'wa_phone', r.wa_phone, 'paso', r.paso)::jsonb,
      timeout_milliseconds := 8000
    );
    v_count := v_count + 1;
  END LOOP;

  -- 3: "gana invitando" a quien se registró y no ha recargado.
  FOR r IN
    SELECT l.wa_phone
    FROM ag_driver_leads l
    JOIN LATERAL (
      SELECT d.created_at, d.wallet_balance, d.vehicle_type
        FROM ag_drivers d WHERE d.ag_user_id = l.ag_user_id
       ORDER BY d.created_at DESC LIMIT 1
    ) d ON TRUE
    WHERE l.paso = 'registrado'
      AND l.no_insistir = FALSE
      AND l.invita_gana_at IS NULL
      AND d.vehicle_type IS NOT NULL
      AND COALESCE(d.wallet_balance, 0) < 10000
      -- Solo registros recientes: a los conductores viejos no les cae este mensaje de la nada.
      AND d.created_at > NOW() - interval '3 days'
      AND NOW() >= d.created_at + interval '2 hours'
      AND (NOW() >= d.created_at + interval '24 hours' OR NOW() >= l.ultimo_in_at + interval '21 hours')
      AND l.ultimo_in_at > NOW() - interval '23 hours'
      AND (l.ultimo_out_at IS NULL OR NOW() - l.ultimo_out_at >= interval '30 minutes')
      AND NOT EXISTS (
            SELECT 1 FROM ag_wa_message_log m
             WHERE m.wa_phone = l.wa_phone AND m.role = 'conductor' AND m.direction = 'out'
               AND m.sent_by = 'admin' AND m.created_at > NOW() - interval '30 minutes')
    LIMIT 40
  LOOP
    -- El reclamo de "una vez en la vida" lo hace la edge function (UPDATE ... WHERE invita_gana_at
    -- IS NULL), porque la recarga también lo puede mandar.
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/ag-whatsapp',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object('_internal_event', 'lead_invita_gana', 'wa_phone', r.wa_phone)::jsonb,
      timeout_milliseconds := 8000
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;
