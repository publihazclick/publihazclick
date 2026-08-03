-- Migration 181: quitar la notificacion de "nueva solicitud" del conductor cuando el viaje
-- deja de estar disponible (el pasajero lo cancelo, o otro conductor ya lo acepto).
-- Pedido explicito del usuario 2026-08-03.
--
-- Reusa el MISMO criterio de seleccion de conductores que ag_notify_drivers_on_trip_request
-- (migracion 163) para mandarle un push de "cancelar" a cualquiera que pudo haber recibido la
-- notificacion original -- no hay forma de saber con certeza a quienes SI les llego, asi que se
-- notifica al mismo conjunto que se notifico al crear la solicitud.
--
-- El push que manda esta funcion NO tiene title/body: viaja solo con `cancel_tag` en el data
-- payload de FCM. ag-send-push/index.ts lo reconoce y, en vez de armar una notificacion nueva,
-- deja que MoviFirebaseMessagingService.kt (nativo) llame NotificationManager.cancel() sobre el
-- mismo tag con el que se mostro la notificacion original, quitandola de la bandeja.

CREATE OR REPLACE FUNCTION public.ag_notify_drivers_trip_no_longer_available()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_user_ids     TEXT[];
  v_payload      jsonb;
BEGIN
  IF OLD.status <> 'searching' OR NEW.status = 'searching' THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN RETURN NEW; END IF;

  SELECT ARRAY_AGG(DISTINCT uid) INTO v_user_ids FROM (

    -- Mismo grupo 1 que la migracion 163: conductores con app abierta
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.is_online = true
      AND d.status IN ('approved', 'quick')
      AND (CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = NEW.vehicle_type
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '10 minutes'
      AND (6371 * acos(LEAST(1.0,
            cos(radians(NEW.origin_lat)) * cos(radians(dl.lat))
            * cos(radians(dl.lng) - radians(NEW.origin_lng))
            + sin(radians(NEW.origin_lat)) * sin(radians(dl.lat))
          ))) <= 20

    UNION

    -- Mismo grupo 2: conductores con token FCM aunque el app este cerrado
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    JOIN public.ag_push_subs ps
      ON ps.user_id = u.auth_user_id
      AND ps.provider = 'fcm'
      AND ps.fcm_token IS NOT NULL
    WHERE d.status IN ('approved', 'quick')
      AND (CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = NEW.vehicle_type
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '4 hours'
      AND (6371 * acos(LEAST(1.0,
            cos(radians(NEW.origin_lat)) * cos(radians(dl.lat))
            * cos(radians(dl.lng) - radians(NEW.origin_lng))
            + sin(radians(NEW.origin_lat)) * sin(radians(dl.lat))
          ))) <= 20

  ) sub;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'user_ids',   v_user_ids,
    'cancel_tag', 'trip-' || NEW.id::text
  );

  BEGIN
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/ag-send-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := v_payload,
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ag_trip_unavailable_push ON public.ag_trip_requests;
CREATE TRIGGER ag_trip_unavailable_push
  AFTER UPDATE OF status ON public.ag_trip_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.ag_notify_drivers_trip_no_longer_available();
