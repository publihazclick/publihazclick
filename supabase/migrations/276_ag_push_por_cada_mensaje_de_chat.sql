-- Migración 276: notificación por CADA mensaje del chat, venga de donde venga (2026-09-06)
--
-- El hueco: el push al conductor existía en un solo sitio, dentro del bot de WhatsApp
-- (`ag-whatsapp/index.ts`, rama del pasajero de WhatsApp). Cuando el pasajero escribía
-- desde LA APP, el servicio de Angular hacía un INSERT pelado en `ag_chat_messages` y
-- nada más: ningún aviso. Con la app del conductor cerrada o en segundo plano ese mensaje
-- no llegaba nunca -- el tiempo real de Supabase solo entrega con la app abierta y
-- en pantalla.
--
-- O sea que el chat funcionaba MEJOR con los pasajeros de WhatsApp que con los de la
-- propia app, que es exactamente al revés de lo que uno esperaría.
--
-- Se resuelve en la base de datos y no en el cliente a propósito: aquí pasan TODOS los
-- mensajes, escriba quien escriba y desde donde escriba. Un push metido en el código de
-- la app o del bot solo cubre el camino por el que se metió, y el otro se olvida -- que
-- es literalmente lo que pasó.
--
-- Ojo con los dos errores que este proyecto ya pagó y que aquí se evitan:
--   · el cuerpo de net.http_post va como ::jsonb, no ::text (bug de la migración 269,
--     que era el mismo de la 203);
--   · la cabecera Authorization es obligatoria o la función responde 401 en silencio
--     (bug de sendPush(), que estuvo roto meses sin que nadie lo viera).
CREATE OR REPLACE FUNCTION public.ag_chat_push_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_trip            RECORD;
  v_driver_user_id  uuid;   -- ag_users.id del conductor
  v_destino_auth    uuid;   -- auth_user_id de QUIEN debe recibir el aviso
  v_titulo          text;
  v_supabase_url    text;
  v_service_key     text;
BEGIN
  SELECT t.id, t.source, t.driver_id, t.passenger_user_id
    INTO v_trip
    FROM public.ag_trip_requests t
   WHERE t.id = NEW.request_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT d.ag_user_id INTO v_driver_user_id
    FROM public.ag_drivers d WHERE d.id = v_trip.driver_id;

  IF NEW.sender_ag_user_id = v_driver_user_id THEN
    -- Escribió el CONDUCTOR. Si el pasajero es de WhatsApp, no lleva push: el mensaje ya
    -- le sale por WhatsApp con el trigger de la migración 212, y un push a una cuenta que
    -- no existe no serviría de nada.
    IF v_trip.source = 'whatsapp' THEN RETURN NEW; END IF;
    SELECT u.auth_user_id INTO v_destino_auth
      FROM public.ag_users u WHERE u.id = v_trip.passenger_user_id;
    v_titulo := '💬 Mensaje de tu conductor';
  ELSE
    -- Escribió el PASAJERO (desde la app o desde WhatsApp): el aviso va al conductor.
    SELECT u.auth_user_id INTO v_destino_auth
      FROM public.ag_users u WHERE u.id = v_driver_user_id;
    -- Un solo título. El bot distinguía "domicilio" leyendo `service_type` de la sesión
    -- de WhatsApp, un dato que NO vive en ag_trip_requests: desde aquí no hay forma
    -- honesta de saberlo, y un título inventado es peor que uno genérico.
    v_titulo := '💬 Mensaje de tu pasajero';
  END IF;

  IF v_destino_auth IS NULL THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN RETURN NEW; END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/ag-send-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object(
        'user_ids', jsonb_build_array(v_destino_auth),
        'title',    v_titulo,
        'body',     left(NEW.message, 150),
        'url',      '/anda-gana?trip_request_id=' || v_trip.id::text,
        -- Mismo `tag` que ya usaba el bot: WhatsApp/Android reemplaza la notificación
        -- anterior del mismo chat en vez de apilar una por mensaje.
        'tag',      'chat-' || v_trip.id::text
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Un fallo del aviso NUNCA debe impedir que el mensaje se guarde: perder el mensaje
    -- es mucho peor que perder la notificación.
    NULL;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ag_chat_push_trigger ON public.ag_chat_messages;
CREATE TRIGGER ag_chat_push_trigger
  AFTER INSERT ON public.ag_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.ag_chat_push_fn();

COMMENT ON FUNCTION public.ag_chat_push_fn() IS
  'Manda push al destinatario por cada mensaje de chat, escriba el pasajero o el conductor, desde la app o desde WhatsApp (migración 276). El push que hacía ag-whatsapp se quitó al desplegar esto, para que no llegue duplicado.';
