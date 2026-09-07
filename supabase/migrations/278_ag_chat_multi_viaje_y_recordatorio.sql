-- Migración 278: a cuál conductor le escribo, y recordarle al que no contesta (2026-09-06)
--
-- Son dos cosas que se apoyan en lo mismo (la marca de leído de la 277), por eso van juntas.
--
-- ── 1. A cuál conductor le escribo ───────────────────────────────────────────
-- Un pasajero de WhatsApp puede tener varios viajes vivos a la vez (botón "🚗 Otro
-- vehículo", migración 222), pero la conversación lleva un solo cursor
-- (`ag_wa_sessions.trip_request_id`), que apunta al viaje del que se está hablando ahora.
-- Resultado: con dos viajes, TODO lo que escriba le llega al conductor del último, y el
-- del primero queda incomunicado -- ni recibe ni puede responder. Ya se arregló para la
-- llamada (se pregunta a cuál); esta columna hace lo mismo para el chat, recordando la
-- elección para no preguntar en cada mensaje, que sería insoportable.
ALTER TABLE public.ag_wa_sessions
  ADD COLUMN IF NOT EXISTS chat_trip_id uuid;

COMMENT ON COLUMN public.ag_wa_sessions.chat_trip_id IS
  'Con varios viajes vivos, a cuál de ellos le está escribiendo el pasajero. NULL = al del cursor (migración 278).';

-- ── 2. Recordarle al conductor que no contesta ───────────────────────────────
-- El caso que costó un viaje real: la pasajera escribió tres veces, el conductor tenía el
-- aviso (tokens de push activos) y nunca respondió. No fue un fallo técnico -- fue silencio.
-- Con la columna read_at (migración 277) por fin se puede saber la diferencia entre
-- "no le llegó" y "le llegó y no lo abrió", que es justo lo que antes no se podía distinguir.
ALTER TABLE public.ag_chat_messages
  ADD COLUMN IF NOT EXISTS nudged_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

COMMENT ON COLUMN public.ag_chat_messages.nudged_at IS
  'Cuándo se le recordó al destinatario que tiene este mensaje sin leer. NULL = todavía no.';
COMMENT ON COLUMN public.ag_chat_messages.escalated_at IS
  'Cuándo se avisó al admin de que este mensaje lleva demasiado sin leer.';

/**
 * Corre cada minuto. Dos tandas:
 *
 *   · A los 3 minutos sin leer -> segundo push al conductor, más directo.
 *   · A los 8 minutos sin leer -> aviso al admin, porque a esa altura el pasajero ya
 *     lleva un buen rato hablándole a una pared y la próxima acción suele ser cancelar.
 *
 * Solo aplica a mensajes del PASAJERO en viajes todavía activos: recordarle algo de un
 * viaje que ya terminó sería ruido, y el ruido hace que se ignoren también los avisos
 * que sí importan.
 */
CREATE OR REPLACE FUNCTION public.ag_chat_recordar_sin_leer()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r               RECORD;
  v_supabase_url  text;
  v_service_key   text;
BEGIN
  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN RETURN; END IF;

  -- ── Tanda 1: recordatorio al conductor a los 3 minutos ────────────────────
  FOR r IN
    SELECT m.id, m.message, t.id AS trip_id, u.auth_user_id
      FROM public.ag_chat_messages m
      JOIN public.ag_trip_requests t ON t.id = m.request_id
      JOIN public.ag_drivers      d ON d.id = t.driver_id
      JOIN public.ag_users        u ON u.id = d.ag_user_id
     WHERE m.read_at   IS NULL
       AND m.nudged_at IS NULL
       AND m.sender_ag_user_id <> d.ag_user_id      -- lo escribió el pasajero
       AND t.status = 'accepted'                    -- el viaje sigue vivo
       AND m.created_at < now() - interval '3 minutes'
       AND m.created_at > now() - interval '2 hours' -- nada viejo: sería ruido
       AND u.auth_user_id IS NOT NULL
     LIMIT 20
  LOOP
    BEGIN
      PERFORM net.http_post(
        url     := v_supabase_url || '/functions/v1/ag-send-push',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body    := jsonb_build_object(
          'user_ids', jsonb_build_array(r.auth_user_id),
          'title',    '⏰ Tu pasajero espera respuesta',
          'body',     left(r.message, 120),
          'url',      '/anda-gana?trip_request_id=' || r.trip_id::text,
          -- Tag distinto del mensaje original a propósito: si usara el mismo, Android
          -- reemplazaría la notificación anterior y el recordatorio pasaría desapercibido.
          'tag',      'chat-nudge-' || r.trip_id::text,
          'urgent',   true
        ),
        timeout_milliseconds := 5000
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    UPDATE public.ag_chat_messages SET nudged_at = now() WHERE id = r.id;
  END LOOP;

  -- ── Tanda 2: aviso al admin a los 8 minutos ───────────────────────────────
  FOR r IN
    SELECT m.id, m.message, t.id AS trip_id, t.wa_phone,
           COALESCE(u.full_name, 'el conductor') AS conductor
      FROM public.ag_chat_messages m
      JOIN public.ag_trip_requests t ON t.id = m.request_id
      JOIN public.ag_drivers      d ON d.id = t.driver_id
      LEFT JOIN public.ag_users   u ON u.id = d.ag_user_id
     WHERE m.read_at       IS NULL
       AND m.escalated_at  IS NULL
       AND m.sender_ag_user_id <> d.ag_user_id
       AND t.status = 'accepted'
       AND m.created_at < now() - interval '8 minutes'
       AND m.created_at > now() - interval '2 hours'
     LIMIT 10
  LOOP
    BEGIN
      PERFORM net.http_post(
        url     := v_supabase_url || '/functions/v1/ag-whatsapp',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        -- El formato es {to:'admin', event, data:{...}}, NO '_internal_event'.
        -- handleInternalEvent() exige wa_phone y se sale callado sin él: un payload con
        -- '_internal_event' devuelve 200 "ok" y no hace absolutamente nada. Se descubrió
        -- probándolo (2026-09-06); es el mismo fallo silencioso de siempre.
        -- Sin kind='error' a propósito: esto es informativo, no un fallo del sistema.
        -- Marcarlo como error lo mezclaría con los fallos reales en ag_admin_notifications
        -- y volvería a disparar la falsa alarma de "revisa Sentry" (incidente 2026-09-05).
        body    := jsonb_build_object(
          'to',    'admin',
          'event', 'error_alert',
          'data',  jsonb_build_object(
            'context', 'Conductor sin responder',
            'message', r.conductor || ' lleva 8 min sin abrir el mensaje del pasajero'
                       || COALESCE(' (' || r.wa_phone || ')', '')
                       || ' · viaje ' || left(r.trip_id::text, 8)
                       || ' · "' || left(r.message, 80) || '"'
          )
        ),
        timeout_milliseconds := 5000
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    UPDATE public.ag_chat_messages SET escalated_at = now() WHERE id = r.id;
  END LOOP;
END;
$function$;

SELECT cron.schedule('movi-chat-sin-respuesta', '* * * * *',
  $$SELECT public.ag_chat_recordar_sin_leer();$$);

COMMENT ON FUNCTION public.ag_chat_recordar_sin_leer() IS
  'Cada minuto: recuerda al conductor a los 3 min sin leer y avisa al admin a los 8 (migración 278).';
