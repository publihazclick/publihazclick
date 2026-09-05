-- Migración 264: la cancelación por abandono ya no deja a nadie en silencio
-- (2026-09-05, caso real).
--
-- QUÉ PASÓ (viaje 0f413b5a-e8fc-4613-b4d6-7acababd1321)
--   12:50  Yolima Vera pide una moto por WhatsApp, $6.000, Comuneros → Instituto Comfanorte
--   12:51  Acepta a James Arley Camacho Pertuz
--   12:55  "Mo transporte aún no ha llegado / Por favor"  → el bot: "Le avisamos a tu conductor"
--   13:06  El bot le avisa que el conductor llegó: "Tienes un máximo de 4 minutos"
--   13:09  "Te quedan 2 minutos"; ella pregunta "En dónde"
--   13:20  `ag_cancel_abandoned_trips` cancela el viaje.
--          **A ella no le llegó absolutamente nada. Al conductor tampoco.**
--
-- POR QUÉ NO LE LLEGÓ NADA
-- La función solo avisaba por push, y solo al pasajero. Yolima entró por WhatsApp:
-- tiene 0 suscripciones en `ag_push_subs`, así que el push no fue a ningún lado.
-- El conductor no estaba contemplado en ningún canal. Los dos quedaron parados en la
-- misma esquina esperándose mientras el sistema daba el viaje por muerto.
-- Mismo patrón que [[movi_wa_pasajero_silencio_seguir_buscando]]: la lógica de servidor
-- asume que todo pasajero tiene la app, y los de WhatsApp se quedan mudos.
--
-- POR QUÉ EL MOTIVO ERA FALSO
-- Decía "el conductor perdió conexión". James Arley seguía `is_online = true` 22 minutos
-- después, y en ese mismo momento 2 de los 4 conductores en línea llevaban más de 15 min
-- sin refrescar GPS sin que les pasara nada. La causa es conocida y está documentada en
-- `anda-gana.component.ts`: el latido de ubicación de 3 minutos es un `setInterval` del
-- WebView, así que muere cuando la app pasa a segundo plano — justo lo que hace un
-- conductor que llega, se parquea y se guarda el celular. "Sin GPS hace 10 min" no
-- significa "perdió conexión"; en esta flota significa, casi siempre, "está quieto".
-- La regla de detección NO se toca acá (es una decisión de producto: qué debe pasar
-- cuando se cumplen los 4 minutos de espera), pero el mensaje deja de afirmar algo que
-- no se sabe: se limita a lo que sí es cierto, que no se confirmó el abordaje.

CREATE OR REPLACE FUNCTION public.ag_cancel_abandoned_trips()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_ids          uuid[];
  v_count        integer;
  v_trip         record;
BEGIN
  -- Viajes candidatos: aceptados, pasajero aún no aborda, sin GPS reciente
  -- del conductor, y con al menos 10 min desde el último cambio (evita
  -- cancelar algo que se aceptó hace 10 segundos y todavía no manda su
  -- primer punto GPS). Regla idéntica a la migración 201 -- acá solo cambian
  -- el texto del motivo y los avisos.
  SELECT ARRAY_AGG(t.id) INTO v_ids
  FROM public.ag_trip_requests t
  WHERE t.status = 'accepted'
    AND t.driver_id IS NOT NULL
    AND (t.driver_stage IS NULL OR t.driver_stage IN ('heading_to_pickup', 'arrived_at_pickup'))
    AND t.updated_at < now() - interval '10 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM public.ag_driver_locations dl
      WHERE dl.driver_id = t.driver_id AND dl.updated_at > now() - interval '10 minutes'
    );

  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.ag_trip_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      updated_at = now(),
      cancel_reason = 'Cancelado automáticamente — no se confirmó el abordaje'
  WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    -- Un solo recorrido con TODO lo que hace falta para avisarle a los dos por
    -- todos los canales que cada uno tenga. Todo best-effort: si un canal falla,
    -- los demás siguen.
    FOR v_trip IN
      SELECT t.id,
             pu.auth_user_id AS pasajero_auth,
             pu.phone        AS pasajero_phone,
             du.auth_user_id AS conductor_auth,
             du.phone        AS conductor_phone,
             COALESCE(du.full_name, 'Tu conductor')  AS conductor_nombre,
             COALESCE(pu.full_name, 'el pasajero')   AS pasajero_nombre
      FROM public.ag_trip_requests t
      JOIN public.ag_users   pu ON pu.id = t.passenger_user_id
      LEFT JOIN public.ag_drivers d  ON d.id = t.driver_id
      LEFT JOIN public.ag_users   du ON du.id = d.ag_user_id
      WHERE t.id = ANY(v_ids)
    LOOP
      -- ── Pasajero: push (si tiene app) ──────────────────────────────────────
      IF v_trip.pasajero_auth IS NOT NULL THEN
        BEGIN
          PERFORM net.http_post(
            url     := v_supabase_url || '/functions/v1/ag-send-push',
            headers := jsonb_build_object('Content-Type', 'application/json',
                                          'Authorization', 'Bearer ' || v_service_key),
            body    := jsonb_build_object(
              'user_ids', ARRAY[v_trip.pasajero_auth::text],
              'title',    '⚠️ Tu viaje fue cancelado',
              'body',     'No pudimos confirmar que subieras al vehículo. No se te cobró nada — puedes pedir otro viaje.',
              'url',      '/anda-gana',
              'tag',      'trip-' || v_trip.id::text,
              'urgent',   true),
            timeout_milliseconds := 5000);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      -- ── Pasajero: WhatsApp ─────────────────────────────────────────────────
      -- El canal que faltaba y por el que quedó muda la pasajera del caso real.
      -- Texto libre: en este punto del flujo el pasajero acaba de escribirle al
      -- bot hace minutos, así que la ventana de servicio de 24h está abierta.
      IF v_trip.pasajero_phone IS NOT NULL THEN
        BEGIN
          PERFORM net.http_post(
            url     := v_supabase_url || '/functions/v1/ag-whatsapp',
            headers := jsonb_build_object('Content-Type', 'application/json',
                                          'Authorization', 'Bearer ' || v_service_key),
            body    := jsonb_build_object(
              'phone',   v_trip.pasajero_phone,
              'message', '❌ *Movi* — Cancelamos tu viaje con ' || v_trip.conductor_nombre ||
                         E'.\n\nNo pudimos confirmar que subieras al vehículo. *No se te cobró nada.*' ||
                         E'\n\nSi todavía necesitas el viaje, escríbeme y te consigo otro conductor enseguida. 🚗'),
            timeout_milliseconds := 8000);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      -- ── Conductor: push ────────────────────────────────────────────────────
      -- Antes no se le avisaba por ningún canal: se quedaba esperando en el punto
      -- de recogida a un viaje que el sistema ya había dado por muerto.
      IF v_trip.conductor_auth IS NOT NULL THEN
        BEGIN
          PERFORM net.http_post(
            url     := v_supabase_url || '/functions/v1/ag-send-push',
            headers := jsonb_build_object('Content-Type', 'application/json',
                                          'Authorization', 'Bearer ' || v_service_key),
            body    := jsonb_build_object(
              'user_ids', ARRAY[v_trip.conductor_auth::text],
              'title',    '⚠️ El viaje fue cancelado',
              'body',     'No se confirmó el abordaje de ' || v_trip.pasajero_nombre ||
                          '. Ya puedes tomar otra solicitud.',
              'url',      '/anda-gana',
              'tag',      'trip-' || v_trip.id::text,
              'urgent',   true),
            timeout_milliseconds := 5000);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      -- ── Conductor: WhatsApp ────────────────────────────────────────────────
      -- Respaldo secundario, no garantizado: los conductores usan la app, no el bot,
      -- así que lo normal es que NO tengan la ventana de servicio de 24h abierta y
      -- Meta descarte este texto en silencio (responde 200 igual, ver
      -- [[movi_trip_error_alerts]]). Se manda porque cuando sí la tienen abierta es
      -- el único canal que le llega a un teléfono que dejó de reportar; el push de
      -- arriba sigue siendo el canal principal para el conductor. Blindarlo del todo
      -- pediría una plantilla nueva aprobada por Meta.
      IF v_trip.conductor_phone IS NOT NULL THEN
        BEGIN
          PERFORM net.http_post(
            url     := v_supabase_url || '/functions/v1/ag-whatsapp',
            headers := jsonb_build_object('Content-Type', 'application/json',
                                          'Authorization', 'Bearer ' || v_service_key),
            body    := jsonb_build_object(
              'phone',   v_trip.conductor_phone,
              'message', '❌ *Movi* — Se canceló el viaje con ' || v_trip.pasajero_nombre ||
                         E'.\n\nNo se confirmó el abordaje. Ya puedes tomar otra solicitud. 🚗'),
            timeout_milliseconds := 8000);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;
