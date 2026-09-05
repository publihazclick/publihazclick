-- Migración 265: los "4 minutos de espera" dejan de ser una promesa vacía —
-- al cumplirse, se le pregunta al conductor (2026-09-05).
--
-- POR QUÉ
-- El bot le dice al pasajero "tienes un máximo de 4 minutos para abordar" y la app le
-- muestra al conductor un contador de 4:00. Al llegar a 0 **no pasaba absolutamente
-- nada** — el comentario en `anda-gana.component.ts` lo dice textual: los contadores
-- "solo son un contador visual, no hay cancelación automática real al llegar a 0".
-- El viaje quedaba a la deriva hasta que `ag_cancel_abandoned_trips` lo mataba al
-- minuto ~14 (ver migración 264 y el caso real de Yolima Vera).
--
-- QUÉ SE HACE
-- Al cumplirse los 4 minutos se le pregunta AL CONDUCTOR si sigue esperando o cancela.
-- Decide él, nunca el sistema — misma regla que [[feedback_movi_never_force_driver_offline]]:
-- Movi no toma por el conductor decisiones que son suyas. Si dice "sigo esperando",
-- el reloj vuelve a empezar y el viaje queda protegido otros 4 minutos.
--
-- Domicilio y flete quedan fuera: ahí no hay "abordar el vehículo" (mismo criterio
-- que ya usa `ag_wa_arrival_reminder`, migración 216).

-- ── Columnas ────────────────────────────────────────────────────────────────────
-- arrived_at_pickup_at: marca de tiempo propia de la llegada. NO se reusa updated_at
-- (como hace la 216) porque updated_at lo mueve cualquier escritura sobre la fila —
-- un push, una oferta, el propio cron — y entonces el reloj de espera se reiniciaría
-- solo, sin que el conductor haya decidido nada.
ALTER TABLE public.ag_trip_requests
  ADD COLUMN IF NOT EXISTS arrived_at_pickup_at timestamptz,
  ADD COLUMN IF NOT EXISTS wait_prompt_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS wait_extended_at     timestamptz,
  ADD COLUMN IF NOT EXISTS wait_extend_count    integer NOT NULL DEFAULT 0;

-- ── Sello de llegada ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_stamp_arrived_at_pickup()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.driver_stage = 'arrived_at_pickup'
     AND COALESCE(OLD.driver_stage, '') <> 'arrived_at_pickup' THEN
    NEW.arrived_at_pickup_at := now();
    NEW.wait_prompt_sent_at  := NULL;
    NEW.wait_extended_at     := NULL;
    NEW.wait_extend_count    := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_stamp_arrived_at_pickup ON public.ag_trip_requests;
CREATE TRIGGER trg_ag_stamp_arrived_at_pickup
  BEFORE UPDATE ON public.ag_trip_requests
  FOR EACH ROW EXECUTE FUNCTION public.ag_stamp_arrived_at_pickup();

-- ── "Sigo esperando" ────────────────────────────────────────────────────────────
-- Reinicia el reloj de los 4 minutos. Toca updated_at a propósito: eso también le
-- da otros 10 minutos de margen frente a ag_cancel_abandoned_trips, así que un
-- conductor que dice explícitamente "sigo acá" no puede ser cancelado por abandono
-- justo después de haberlo dicho.
CREATE OR REPLACE FUNCTION public.ag_driver_extend_wait(p_trip_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  r              RECORD;
BEGIN
  -- Solo el conductor asignado a ese viaje puede extender su propia espera.
  SELECT t.id,
         t.source,
         t.wa_phone,
         pu.auth_user_id AS pasajero_auth,
         COALESCE(du.full_name, 'Tu conductor') AS conductor_nombre
  INTO r
  FROM public.ag_trip_requests t
  JOIN public.ag_drivers d  ON d.id = t.driver_id
  JOIN public.ag_users   du ON du.id = d.ag_user_id
  LEFT JOIN public.ag_users pu ON pu.id = t.passenger_user_id
  WHERE t.id = p_trip_request_id
    AND t.status = 'accepted'
    AND t.driver_stage = 'arrived_at_pickup'
    AND du.auth_user_id = auth.uid();

  IF r.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes extender la espera de este viaje.');
  END IF;

  UPDATE public.ag_trip_requests
  SET arrived_at_pickup_at = now(),
      wait_extended_at     = now(),
      wait_prompt_sent_at  = NULL,
      wait_extend_count    = wait_extend_count + 1,
      updated_at           = now()
  WHERE id = p_trip_request_id;

  -- Avisarle al pasajero que el conductor decidió seguir esperándolo. Va acá y no
  -- en la app del conductor porque `ag_get_my_active_trips` no le devuelve wa_phone
  -- al cliente -- desde el frontend el aviso nunca habría salido justo en los viajes
  -- de WhatsApp, que son la mayoría.
  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    IF r.source = 'whatsapp' AND r.wa_phone IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_supabase_url || '/functions/v1/ag-whatsapp',
          headers := jsonb_build_object('Content-Type', 'application/json',
                                        'Authorization', 'Bearer ' || v_service_key),
          body    := jsonb_build_object(
            'phone',   r.wa_phone,
            'message', '⏱️ *' || r.conductor_nombre || '* decidió seguir esperándote unos minutos más. 🙏' ||
                       E'\n\nPor favor sal lo antes posible.'),
          timeout_milliseconds := 8000);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    ELSIF r.pasajero_auth IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_supabase_url || '/functions/v1/ag-send-push',
          headers := jsonb_build_object('Content-Type', 'application/json',
                                        'Authorization', 'Bearer ' || v_service_key),
          body    := jsonb_build_object(
            'user_ids', ARRAY[r.pasajero_auth::text],
            'title',    '⏱️ Tu conductor te sigue esperando',
            'body',     r.conductor_nombre || ' decidió esperarte unos minutos más. Sal lo antes posible.',
            'url',      '/anda-gana',
            'tag',      'wait-' || r.id::text,
            'urgent',   true),
          timeout_milliseconds := 5000);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'seconds', 240);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ag_driver_extend_wait(uuid) TO authenticated;

-- ── El cron que pregunta ────────────────────────────────────────────────────────
-- Corre cada minuto. wait_prompt_sent_at evita repetir la pregunta en cada corrida;
-- se limpia sola cuando el conductor extiende, así que la vuelve a hacer 4 minutos
-- después si el pasajero sigue sin subir.
CREATE OR REPLACE FUNCTION public.ag_driver_wait_prompt()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  r              RECORD;
  v_count        integer := 0;
BEGIN
  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN RETURN 0; END IF;

  FOR r IN
    SELECT t.id,
           du.auth_user_id AS conductor_auth,
           COALESCE(pu.full_name, 'tu pasajero') AS pasajero_nombre,
           t.wait_extend_count
    FROM public.ag_trip_requests t
    JOIN public.ag_drivers d  ON d.id = t.driver_id
    JOIN public.ag_users   du ON du.id = d.ag_user_id
    LEFT JOIN public.ag_users pu ON pu.id = t.passenger_user_id
    WHERE t.status = 'accepted'
      AND t.driver_stage = 'arrived_at_pickup'
      AND COALESCE(t.service_type, 'carro') NOT IN ('domicilio', 'flete')
      AND t.arrived_at_pickup_at IS NOT NULL
      AND t.arrived_at_pickup_at <= now() - interval '4 minutes'
      AND t.wait_prompt_sent_at IS NULL
      AND du.auth_user_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM net.http_post(
        url     := v_supabase_url || '/functions/v1/ag-send-push',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || v_service_key),
        body    := jsonb_build_object(
          'user_ids', ARRAY[r.conductor_auth::text],
          'title',    '⏱️ ¿Sigues esperando?',
          'body',     'Se cumplieron los 4 minutos y ' || r.pasajero_nombre ||
                      ' no ha subido. Abre Movi y dinos si lo sigues esperando o cancelas.',
          'url',      '/anda-gana',
          'tag',      'wait-' || r.id::text,
          'urgent',   true),
        timeout_milliseconds := 5000);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    UPDATE public.ag_trip_requests SET wait_prompt_sent_at = now() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

SELECT cron.schedule(
  'movi-driver-wait-prompt',
  '* * * * *',
  $$SELECT public.ag_driver_wait_prompt();$$
);

-- ── Sello retroactivo ───────────────────────────────────────────────────────────
-- Los viajes que ya están esperando en este momento no tienen arrived_at_pickup_at
-- (la columna acaba de nacer). Sin esto se quedarían fuera del cron para siempre.
UPDATE public.ag_trip_requests
SET arrived_at_pickup_at = updated_at
WHERE status = 'accepted'
  AND driver_stage = 'arrived_at_pickup'
  AND arrived_at_pickup_at IS NULL;
