-- =============================================================================
-- Migration 201: red de seguridad para viajes "accepted" abandonados por el
-- conductor -- pedido explícito del usuario 2026-08-09 tras encontrar un
-- viaje real colgado ~3h porque el conductor se quedó sin señal/cerró la app
-- después de aceptar (antes de recoger al pasajero).
--
-- Ya existe `ag_cancel_stale_trips` pero SOLO cubre viajes en 'searching'
-- (nunca aceptados) -- no hay ningún mecanismo de servidor que reaccione
-- cuando un viaje YA aceptado se queda sin conductor activo. El fix de
-- frontend (bloquear "salir de línea" con viaje en curso) cubre la
-- desconexión intencional, pero no cubre caídas de conexión, apps que se
-- cierran solas, o teléfonos que se apagan -- casos donde nunca se llama a
-- ningún RPC de salida, simplemente deja de llegar GPS.
--
-- Regla: si un viaje sigue 'accepted' Y el pasajero todavía NO abordó
-- (driver_stage null/heading_to_pickup/arrived_at_pickup -- mismo corte que
-- usa el reembolso de la migración 188) Y no ha habido ninguna actualización
-- de GPS del conductor en los últimos 10 minutos, se cancela solo. El
-- reembolso de comisión ya lo dispara el trigger existente
-- (trg_ag_trip_cancellation / ag_handle_trip_cancellation) porque solo cambia
-- el status a 'cancelled' -- no duplica esa lógica acá.
-- =============================================================================

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
  -- primer punto GPS).
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
      cancel_reason = 'Cancelado automáticamente — el conductor perdió conexión y no recogió al pasajero'
  WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Avisar a cada pasajero afectado (best-effort, no bloquea si falla)
  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    FOR v_trip IN
      SELECT t.id, u.auth_user_id
      FROM public.ag_trip_requests t
      JOIN public.ag_users u ON u.id = t.passenger_user_id
      WHERE t.id = ANY(v_ids) AND u.auth_user_id IS NOT NULL
    LOOP
      BEGIN
        PERFORM net.http_post(
          url     := v_supabase_url || '/functions/v1/ag-send-push',
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_key
          ),
          body    := jsonb_build_object(
            'user_ids', ARRAY[v_trip.auth_user_id::text],
            'title',    '⚠️ Tu viaje fue cancelado',
            'body',     'Perdimos la conexión con tu conductor y no llegó a recogerte. No se te cobró nada — puedes pedir otro viaje.',
            'url',      '/anda-gana',
            'tag',      'trip-' || v_trip.id::text,
            'urgent',   true
          ),
          timeout_milliseconds := 5000
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

-- Corre cada 5 minutos -- suficiente para no dejar a nadie esperando de más,
-- sin ser tan agresivo que corte huecos normales de señal.
SELECT cron.schedule(
  'movi-cancel-abandoned-trips',
  '*/5 * * * *',
  $$SELECT public.ag_cancel_abandoned_trips();$$
);
