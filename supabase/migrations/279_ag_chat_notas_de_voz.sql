-- Migración 279: notas de voz del conductor hacia el pasajero de WhatsApp (2026-09-06)
--
-- Lo que YA existía y no había que rehacer: el pasajero manda una nota de voz por WhatsApp,
-- el bot la baja de Meta, la transcribe con Whisper y la mete al chat como texto
-- (`transcribeAudio()` en ag-whatsapp). O sea que ese sentido ya funcionaba, y de hecho
-- mejor que reenviar el audio crudo: el conductor lee de un vistazo en vez de tener que
-- ponerse a escuchar mientras maneja.
--
-- Lo que faltaba es el sentido contrario. El conductor va manejando: escribir es incómodo y
-- peligroso, y decir "estoy en la esquina de la panadería de toldo azul" de viva voz toma
-- tres segundos. Hoy el puente pasa SOLO texto, así que ese audio no llegaba a ninguna parte.
--
-- Va como mensaje de WhatsApp, no como llamada: no cuesta un peso.
ALTER TABLE public.ag_chat_messages
  ADD COLUMN IF NOT EXISTS media_path text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_seconds integer;

COMMENT ON COLUMN public.ag_chat_messages.media_path IS
  'Ruta dentro del bucket movi-chat-audio. NULL = mensaje de solo texto.';
COMMENT ON COLUMN public.ag_chat_messages.media_type IS
  'Tipo de adjunto: por ahora solo ''audio''.';

-- Bucket PRIVADO a propósito. Son grabaciones de voz de personas reales hablando de dónde
-- viven y a dónde van: un bucket público las dejaría accesibles a cualquiera que adivine la
-- URL. La edge function las lee con la service role y se las entrega a Meta; la app las oye
-- con URL firmada de duración corta.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('movi-chat-audio', 'movi-chat-audio', false, 5242880,
        ARRAY['audio/ogg','audio/mpeg','audio/mp4','audio/webm','audio/aac'])
ON CONFLICT (id) DO NOTHING;

-- Solo los participantes del viaje pueden leer el audio, con la misma regla que ya protege
-- los mensajes: la carpeta de cada archivo es el id del viaje.
DROP POLICY IF EXISTS movi_chat_audio_participantes ON storage.objects;
CREATE POLICY movi_chat_audio_participantes ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'movi-chat-audio'
    AND (storage.foldername(name))[1] IN (
      SELECT tr.id::text FROM public.ag_trip_requests tr
       WHERE tr.passenger_user_id = public.ag_current_user_id()
          OR tr.driver_id = public.ag_current_driver_id()
    )
  );

-- El trigger que reenvía a WhatsApp (migración 212) solo sabía de texto. Ahora, si el
-- mensaje trae audio, manda el evento con la ruta para que la edge function lo suba a Meta.
CREATE OR REPLACE FUNCTION public.ag_wa_chat_relay_to_passenger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_trip              RECORD;
  v_driver_ag_user_id uuid;
  v_driver_name       text;
  v_supabase_url      text;
  v_service_key       text;
BEGIN
  SELECT r.id, r.source, r.wa_phone, r.driver_id, r.status
    INTO v_trip
    FROM public.ag_trip_requests r
   WHERE r.id = NEW.request_id;
  IF NOT FOUND OR v_trip.source <> 'whatsapp' OR v_trip.wa_phone IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT d.ag_user_id INTO v_driver_ag_user_id
    FROM public.ag_drivers d WHERE d.id = v_trip.driver_id;

  -- Anti-eco: solo se reenvía lo que escribió el CONDUCTOR. Lo del pasajero ya viene de
  -- WhatsApp; reenviárselo sería devolverle su propio mensaje en bucle.
  IF v_driver_ag_user_id IS NULL OR NEW.sender_ag_user_id <> v_driver_ag_user_id THEN
    RETURN NEW;
  END IF;

  SELECT u.full_name INTO v_driver_name
    FROM public.ag_users u WHERE u.id = v_driver_ag_user_id;

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  PERFORM net.http_post(
    url     := COALESCE(v_supabase_url, 'https://hndhgtnjyjwrnzdcgcca.supabase.co') || '/functions/v1/ag-whatsapp',
    body    := jsonb_build_object(
      '_internal_event',  'chat_message',
      'wa_phone',         v_trip.wa_phone,
      'trip_request_id',  v_trip.id::text,
      'driver_name',      COALESCE(v_driver_name, 'Tu conductor'),
      'message',          NEW.message,
      -- Nuevo: si trae audio, la función lo baja del bucket y se lo manda a Meta.
      'media_path',       NEW.media_path,
      'media_type',       NEW.media_type
    )::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- La cabecera faltaba. ag-whatsapp es pública (tiene que serlo para el webhook de
      -- Meta), así que funcionaba igual -- pero es la misma forma del bug que tuvo
      -- sendPush() callado durante meses. Se pone por higiene y por si algún día deja
      -- de ser pública.
      'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
    )
  );

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.ag_wa_chat_relay_to_passenger_fn() IS
  'Reenvía a WhatsApp lo que el conductor escribe en el chat de la app, texto o nota de voz (migraciones 212 y 279).';
