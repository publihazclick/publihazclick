-- ════════════════════════════════════════════════════════════════════════════
-- 298 — Conductor que acepta y no arranca + un solo aviso por viaje (2026-10-02)
--
-- Caso real (pasajero …833, aeropuerto): JORGE GARCÍA aceptó a las 09:02 y nunca arrancó
-- (driver_stage en NULL y ni una ubicación en 16 min). El sistema solo mandó avisos al admin
-- -- seis idénticos -- y el pasajero terminó yéndose a la autopista a buscar un carro.
--
-- B) ag_wa_conductor_quieto(): viaje por WhatsApp aceptado hace 5+ min, sin etapa (no tocó
--    "ir a recoger") y sin ubicación reciente -> el bot le pregunta al PASAJERO
--    "¿Te busco otro?" [Buscar otro] [Seguir esperando]. Decide el pasajero, así que un falso
--    positivo no hace daño. Máximo 2 preguntas por viaje, con 6 min entre ellas.
-- C) ag_chat_recordar_sin_leer(): el aviso al admin pasa a ser UNO por viaje.
-- Aplicada vía Management API, NO db push (ver movi_migration_history_desync_danger).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ag_trip_requests
  ADD COLUMN IF NOT EXISTS wa_conductor_quieto_at    timestamptz,
  ADD COLUMN IF NOT EXISTS wa_conductor_quieto_veces integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.ag_wa_conductor_quieto()
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
    SELECT t.id, t.wa_phone, COALESCE(u.full_name, 'Tu conductor') AS conductor,
           floor(extract(epoch FROM now() - o.updated_at) / 60)::int AS minutos
      FROM ag_trip_requests t
      JOIN ag_trip_offers o   ON o.id = t.accepted_offer_id
      LEFT JOIN ag_drivers d  ON d.id = t.driver_id
      LEFT JOIN ag_users u    ON u.id = d.ag_user_id
     WHERE t.status = 'accepted'
       AND t.source = 'whatsapp' AND t.wa_phone IS NOT NULL
       AND t.driver_stage IS NULL                              -- no tocó "ir a recoger"
       AND o.updated_at < now() - interval '5 minutes'         -- aceptó hace 5+ min
       AND o.updated_at > now() - interval '2 hours'
       AND t.wa_conductor_quieto_veces < 2
       AND (t.wa_conductor_quieto_at IS NULL OR t.wa_conductor_quieto_at < now() - interval '6 minutes')
       AND NOT EXISTS (SELECT 1 FROM ag_trip_locations l       -- ni una ubicación reciente
                        WHERE l.trip_request_id = t.id AND l.recorded_at > now() - interval '5 minutes')
     LIMIT 20
  LOOP
    UPDATE ag_trip_requests
       SET wa_conductor_quieto_at = now(), wa_conductor_quieto_veces = wa_conductor_quieto_veces + 1
     WHERE id = r.id;
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/ag-whatsapp',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object('_internal_event', 'conductor_quieto', 'wa_phone', r.wa_phone,
                                    'trip_id', r.id, 'conductor', r.conductor, 'minutos', r.minutos)::jsonb,
      timeout_milliseconds := 8000
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.ag_wa_conductor_quieto() IS
  'Cada minuto: si un conductor aceptó un viaje de WhatsApp hace 5+ min y no arranca, el bot le ofrece al pasajero buscar otro. Migración 298.';

SELECT cron.schedule('movi-conductor-quieto', '* * * * *', 'SELECT public.ag_wa_conductor_quieto();');

-- C) Un solo aviso al admin por viaje (resto idéntico a la migración 278).
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
    -- UNO por viaje (2026-10-02): antes salía uno por CADA mensaje sin leer, y un pasajero
    -- que escribió 6 veces generó 6 avisos idénticos en 7 minutos (viaje c863d5a4). Se toma
    -- el mensaje más viejo de cada viaje y luego se marcan todos los de ese viaje.
    SELECT DISTINCT ON (t.id) m.id, m.message, t.id AS trip_id, t.wa_phone,
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
     ORDER BY t.id, m.created_at
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
    -- Todos los mensajes sin leer de ese viaje quedan marcados: un solo aviso por viaje.
    UPDATE public.ag_chat_messages m SET escalated_at = now()
     WHERE m.request_id = r.trip_id AND m.read_at IS NULL AND m.escalated_at IS NULL;
  END LOOP;
END;
$function$;
