-- ═══════════════════════════════════════════════════════════════════════════
-- 281 — La cancelación automática deja de medir el GPS y pasa a medir señales
--       de vida reales, y avisa ANTES de cancelar.
--
-- CASO REAL (2026-09-08 22:25, viaje ab5093bc de Yolima Vera con ANTHONY RUEDA):
-- el conductor aceptó 22:08, arrancó 22:09 y su app reportó GPS una sola vez,
-- a las 22:10:02, a 1,4 km del punto. La app pasó a segundo plano (va en moto,
-- pantalla apagada) y el latido de GPS se murió ahí. A las 22:25 la regla vieja
-- lo canceló por "no hay GPS hace 10 minutos".
--
-- Mientras tanto la pasajera estaba viva y hablando: escribió al bot a las
-- 22:18:52 y tocó un botón a las 22:19:02 -- seis minutos antes de que lo
-- matáramos. Nada de eso contaba.
--
-- Datos de los 7 días previos: 3 viajes consiguieron conductor, 2 los canceló
-- esta regla, 1 se completó. Dos de cada tres.
--
-- QUÉ CAMBIA
-- 1. El GPS deja de ser la única señal. Cuenta cualquier prueba de vida de
--    cualquiera de los dos lados (ver ag_trip_last_signal).
-- 2. Se pregunta antes de cancelar. Primero un aviso a los dos; solo si NADIE
--    responde en los 6 minutos siguientes se cancela.
-- 3. El motivo y los textos dejan de culpar al pasajero de algo que no hizo.
--    En el caso real el conductor nunca marcó llegada (arrived_at_pickup_at
--    vacío), así que "no pudimos confirmar que subieras al vehículo" era
--    literalmente imposible: no había a qué subirse.
--
-- OJO: la causa de fondo es que el GPS de la app se muere en segundo plano.
-- Eso se arregla en el APK, no acá. Esta migración hace que el sistema sea
-- correcto AUNQUE el GPS siga muriéndose, que es lo que frena el sangrado hoy.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Última señal de vida de un viaje ───────────────────────────────────────
-- A propósito NO incluye ag_trip_requests.updated_at: esa columna la mueve
-- cualquier escritura, incluida la del propio aviso de esta función, y el viaje
-- se vería "vivo" justo después de avisarle. Solo entran marcas que las pone
-- una persona o un dispositivo de verdad.
CREATE OR REPLACE FUNCTION public.ag_trip_last_signal(p_trip uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT max(s) FROM (
    -- Avances del propio viaje (marcas explícitas, no updated_at)
    SELECT t.driver_started_at    AS s FROM public.ag_trip_requests t WHERE t.id = p_trip
    UNION ALL
    SELECT t.arrived_at_pickup_at      FROM public.ag_trip_requests t WHERE t.id = p_trip
    UNION ALL
    SELECT t.passenger_boarded_at      FROM public.ag_trip_requests t WHERE t.id = p_trip
    UNION ALL
    SELECT t.passenger_picked_at       FROM public.ag_trip_requests t WHERE t.id = p_trip
    -- El conductor: GPS
    UNION ALL
    SELECT dl.updated_at FROM public.ag_trip_requests t
      JOIN public.ag_driver_locations dl ON dl.driver_id = t.driver_id
     WHERE t.id = p_trip
    -- Chat: escribir cuenta, y leer también (leer prueba que la app está viva)
    UNION ALL
    SELECT c.created_at FROM public.ag_chat_messages c WHERE c.request_id = p_trip
    UNION ALL
    SELECT c.read_at    FROM public.ag_chat_messages c WHERE c.request_id = p_trip
    -- El conductor abrió, tocó o tuvo en primer plano un push de este viaje
    UNION ALL
    SELECT p.opened_at     FROM public.ag_trip_push_log p WHERE p.trip_request_id = p_trip
    UNION ALL
    SELECT p.tapped_at     FROM public.ag_trip_push_log p WHERE p.trip_request_id = p_trip
    UNION ALL
    SELECT p.foreground_at FROM public.ag_trip_push_log p WHERE p.trip_request_id = p_trip
    -- El pasajero le escribió al bot después de pedir el viaje
    UNION ALL
    SELECT w.created_at FROM public.ag_trip_requests t
      JOIN public.ag_wa_message_log w
        ON w.wa_phone = t.wa_phone AND w.direction = 'in' AND w.created_at >= t.created_at
     WHERE t.id = p_trip
  ) q;
$function$;

COMMENT ON FUNCTION public.ag_trip_last_signal(uuid) IS
  'Última prueba de vida de un viaje, de cualquiera de los dos lados. Migración 281.';


-- ─── Cancelación en dos pasos ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_cancel_abandoned_trips()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_url    TEXT;
  v_key    TEXT;
  v_count  integer := 0;
  v_trip   record;

  -- Silencio antes de preguntar, y margen para contestar.
  c_silencio  CONSTANT interval := interval '12 minutes';
  c_gracia    CONSTANT interval := interval '6 minutes';
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url'      LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key'  LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN 0; END IF;

  -- ══ PASO 1: preguntar ═════════════════════════════════════════════════════
  -- Viajes callados hace rato a los que todavía no se les ha preguntado nada.
  FOR v_trip IN
    SELECT t.id, t.wa_phone,
           pu.auth_user_id AS pasajero_auth, pu.phone AS pasajero_phone,
           du.auth_user_id AS conductor_auth, du.phone AS conductor_phone,
           COALESCE(du.full_name, 'tu conductor') AS conductor_nombre,
           COALESCE(pu.full_name, 'el pasajero')  AS pasajero_nombre
      FROM public.ag_trip_requests t
      JOIN public.ag_users   pu ON pu.id = t.passenger_user_id
      LEFT JOIN public.ag_drivers d  ON d.id = t.driver_id
      LEFT JOIN public.ag_users   du ON du.id = d.ag_user_id
     WHERE t.status = 'accepted'
       AND t.driver_id IS NOT NULL
       AND (t.driver_stage IS NULL OR t.driver_stage IN ('heading_to_pickup', 'arrived_at_pickup'))
       AND t.wait_prompt_sent_at IS NULL
       AND t.created_at < now() - c_silencio
       AND COALESCE(public.ag_trip_last_signal(t.id), t.created_at) < now() - c_silencio
  LOOP
    UPDATE public.ag_trip_requests
       SET wait_prompt_sent_at = now()
     WHERE id = v_trip.id;

    -- Pasajero por WhatsApp. Cualquier respuesta suya vuelve a marcar señal de
    -- vida (queda en ag_wa_message_log como direction='in') y salva el viaje.
    IF v_trip.wa_phone IS NOT NULL OR v_trip.pasajero_phone IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_url || '/functions/v1/ag-whatsapp',
          headers := jsonb_build_object('Content-Type','application/json',
                                        'Authorization','Bearer ' || v_key),
          body    := jsonb_build_object(
            'phone',   COALESCE(v_trip.wa_phone, v_trip.pasajero_phone),
            'message', '👋 *Movi* — ¿sigues esperando a ' || v_trip.conductor_nombre || '?' ||
                       E'\n\nLlevamos un rato sin señal del viaje. *Respóndeme cualquier cosa* y lo dejo activo.' ||
                       E'\n\nSi ya no lo necesitas, escribe *cancelar* y te consigo otro enseguida.'),
          timeout_milliseconds := 8000);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    -- Conductor por push (canal principal: los conductores usan la app).
    IF v_trip.conductor_auth IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_url || '/functions/v1/ag-send-push',
          headers := jsonb_build_object('Content-Type','application/json',
                                        'Authorization','Bearer ' || v_key),
          body    := jsonb_build_object(
            'user_ids', ARRAY[v_trip.conductor_auth::text],
            'title',    '¿Sigues en el viaje?',
            'body',     'Abre Movi para confirmar el viaje con ' || v_trip.pasajero_nombre ||
                        '. Si no confirmas, lo cancelamos en unos minutos.',
            'url',      '/anda-gana',
            'tag',      'vivo-' || v_trip.id::text,
            'urgent',   true),
          timeout_milliseconds := 5000);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    -- Conductor por WhatsApp: respaldo, solo llega si tiene ventana de 24h abierta.
    IF v_trip.conductor_phone IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_url || '/functions/v1/ag-whatsapp',
          headers := jsonb_build_object('Content-Type','application/json',
                                        'Authorization','Bearer ' || v_key),
          body    := jsonb_build_object(
            'phone',   v_trip.conductor_phone,
            'message', '👋 *Movi* — ¿sigues en el viaje con ' || v_trip.pasajero_nombre || '?' ||
                       E'\n\nAbre la app para confirmarlo. Si no, lo cancelamos en unos minutos.'),
          timeout_milliseconds := 8000);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;

  -- ══ PASO 2: cancelar, solo si nadie contestó ══════════════════════════════
  FOR v_trip IN
    SELECT t.id, t.wa_phone, t.arrived_at_pickup_at,
           pu.auth_user_id AS pasajero_auth, pu.phone AS pasajero_phone,
           du.auth_user_id AS conductor_auth, du.phone AS conductor_phone,
           COALESCE(du.full_name, 'tu conductor') AS conductor_nombre,
           COALESCE(pu.full_name, 'el pasajero')  AS pasajero_nombre
      FROM public.ag_trip_requests t
      JOIN public.ag_users   pu ON pu.id = t.passenger_user_id
      LEFT JOIN public.ag_drivers d  ON d.id = t.driver_id
      LEFT JOIN public.ag_users   du ON du.id = d.ag_user_id
     WHERE t.status = 'accepted'
       AND t.driver_id IS NOT NULL
       AND (t.driver_stage IS NULL OR t.driver_stage IN ('heading_to_pickup', 'arrived_at_pickup'))
       AND t.wait_prompt_sent_at IS NOT NULL
       AND t.wait_prompt_sent_at < now() - c_gracia
       -- Nadie dio señales DESPUÉS del aviso.
       AND COALESCE(public.ag_trip_last_signal(t.id), t.created_at) < t.wait_prompt_sent_at
  LOOP
    UPDATE public.ag_trip_requests
       SET status        = 'cancelled',
           cancelled_at  = now(),
           updated_at    = now(),
           -- El motivo dice lo que de verdad pasó. Si el conductor nunca marcó
           -- llegada, hablar de "abordaje" es falso: no hubo a qué subirse.
           cancel_reason = CASE
             WHEN v_trip.arrived_at_pickup_at IS NOT NULL
               THEN 'Cancelado automáticamente — el conductor llegó pero no se confirmó el abordaje'
               ELSE 'Cancelado automáticamente — sin señal del viaje y el conductor no llegó al punto'
           END
     WHERE id = v_trip.id;
    v_count := v_count + 1;

    -- ── Pasajero ────────────────────────────────────────────────────────────
    IF v_trip.pasajero_auth IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_url || '/functions/v1/ag-send-push',
          headers := jsonb_build_object('Content-Type','application/json',
                                        'Authorization','Bearer ' || v_key),
          body    := jsonb_build_object(
            'user_ids', ARRAY[v_trip.pasajero_auth::text],
            'title',    'Tu viaje fue cancelado',
            'body',     'Perdimos contacto con ' || v_trip.conductor_nombre ||
                        '. No se te cobró nada — pide otro viaje cuando quieras.',
            'url',      '/anda-gana',
            'tag',      'trip-' || v_trip.id::text,
            'urgent',   true),
          timeout_milliseconds := 5000);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    IF v_trip.wa_phone IS NOT NULL OR v_trip.pasajero_phone IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_url || '/functions/v1/ag-whatsapp',
          headers := jsonb_build_object('Content-Type','application/json',
                                        'Authorization','Bearer ' || v_key),
          body    := jsonb_build_object(
            'phone',   COALESCE(v_trip.wa_phone, v_trip.pasajero_phone),
            'message', '❌ *Movi* — Cancelamos tu viaje con ' || v_trip.conductor_nombre || '.' ||
                       E'\n\nPerdimos contacto con él y no pudimos confirmar que llegara. *No fue culpa tuya y no se te cobró nada.*' ||
                       E'\n\nEscríbeme y te consigo otro conductor de una. 🙏'),
          timeout_milliseconds := 8000);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    -- ── Conductor ───────────────────────────────────────────────────────────
    IF v_trip.conductor_auth IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_url || '/functions/v1/ag-send-push',
          headers := jsonb_build_object('Content-Type','application/json',
                                        'Authorization','Bearer ' || v_key),
          body    := jsonb_build_object(
            'user_ids', ARRAY[v_trip.conductor_auth::text],
            'title',    'El viaje fue cancelado',
            'body',     'No recibimos señal de tu app en el viaje con ' || v_trip.pasajero_nombre ||
                        '. Ya puedes tomar otra solicitud.',
            'url',      '/anda-gana',
            'tag',      'trip-' || v_trip.id::text,
            'urgent',   true),
          timeout_milliseconds := 5000);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    IF v_trip.conductor_phone IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_url || '/functions/v1/ag-whatsapp',
          headers := jsonb_build_object('Content-Type','application/json',
                                        'Authorization','Bearer ' || v_key),
          body    := jsonb_build_object(
            'phone',   v_trip.conductor_phone,
            'message', '❌ *Movi* — Se canceló el viaje con ' || v_trip.pasajero_nombre || '.' ||
                       E'\n\nDejamos de recibir señal de tu app. Si el viaje sí se hizo, escríbenos para arreglarlo.'),
          timeout_milliseconds := 8000);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.ag_cancel_abandoned_trips() IS
  'Cancela en dos pasos (avisa y espera) y solo con abandono real, no por GPS callado. Migración 281.';


-- ─── El mapa en vivo deja de mostrar una posición congelada ─────────────────
-- La versión anterior unía ag_driver_locations sin mirar la antigüedad, así que
-- mandaba el MISMO punto cada 4 minutos con un ETA recalculado sobre él. En el
-- caso real le dijo cuatro veces "llega en ~3 min" usando una posición de las
-- 22:10 que nunca cambió. Ahora se manda la antigüedad y el que decide el texto
-- es la edge function; y si el punto ya está muy viejo, no se manda nada:
-- un mapa quieto repetido es peor que no mandar mapa.
CREATE OR REPLACE FUNCTION public.ag_wa_broadcast_live_locations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  r     RECORD;
  v_url TEXT;
  v_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url'     LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT tr.id, tr.wa_phone, dl.lat, dl.lng, tr.driver_stage, tr.service_type, tr.for_other,
           tr.origin_lat, tr.origin_lng,
           EXTRACT(EPOCH FROM (now() - dl.updated_at))::int AS loc_age_sec
    FROM ag_trip_requests tr
    JOIN ag_driver_locations dl ON dl.driver_id = tr.driver_id
    WHERE tr.source = 'whatsapp'
      AND tr.status = 'accepted'
      AND tr.wa_phone IS NOT NULL
      AND tr.driver_id IS NOT NULL
      AND COALESCE(tr.driver_stage, 'heading_to_pickup') <> 'arrived_at_destination'
      AND dl.updated_at > now() - interval '10 minutes'
  LOOP
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/ag-whatsapp',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object(
        '_internal_event', 'live_location',
        'wa_phone',        r.wa_phone,
        'trip_request_id', r.id::text,
        'lat',             r.lat,
        'lng',             r.lng,
        'origin_lat',      r.origin_lat,
        'origin_lng',      r.origin_lng,
        'driver_stage',    r.driver_stage,
        'service_type',    r.service_type,
        'for_other',       r.for_other,
        'loc_age_sec',     r.loc_age_sec
      )::jsonb,
      timeout_milliseconds := 8000
    );
  END LOOP;
END;
$function$;
