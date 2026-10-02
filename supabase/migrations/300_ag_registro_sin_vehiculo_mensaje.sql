-- ════════════════════════════════════════════════════════════════════════════
-- 300 — Conductor que se quedó a medias en el registro: el bot le escribe (2026-10-02)
--
-- Desde la migración 290, si un conductor lleva 30 min registrado sin vehículo, al admin le
-- llega "⏳ Conductor nuevo — SIN VEHÍCULO AÚN". El usuario preguntó qué significaba y pidió
-- que, para ese caso, el bot de conductores le escriba a la persona para ayudarla a terminar
-- (casos del día: Wilmer Balaguera …812 y Danny Carvajal …619, este último lead de la pauta).
--
-- Se agrega un evento 'registro_sin_vehiculo' a ag-whatsapp justo cuando sale ese aviso. La
-- función de WhatsApp decide si se puede escribir (ventana de 24 h en el número de conductores);
-- si no se puede, no manda nada y queda solo el aviso al admin, como antes.
-- Aplicada vía Management API, NO db push (ver movi_migration_history_desync_danger).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ag_avisar_registros_sin_vehiculo()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_url   text;
  v_key   text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url'     LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  FOR r IN
    SELECT u.id, u.phone, u.full_name,
           EXISTS (SELECT 1 FROM ag_drivers d WHERE d.ag_user_id = u.id AND d.vehicle_type IS NOT NULL) AS tiene_vehiculo
    FROM ag_users u
    WHERE u.role = 'driver'
      AND u.alerta_registro_at IS NULL
      AND u.created_at < NOW() - interval '30 minutes'
    ORDER BY u.created_at
    LIMIT 30
  LOOP
    IF ag_avisar_registro(r.id) THEN
      v_count := v_count + 1;
      -- Solo si de verdad le falta el vehículo (por si otro camino lo llenó justo ahora).
      IF NOT r.tiene_vehiculo AND r.phone IS NOT NULL AND v_url IS NOT NULL AND v_key IS NOT NULL THEN
        PERFORM net.http_post(
          url     := v_url || '/functions/v1/ag-whatsapp',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
          body    := jsonb_build_object(
            '_internal_event', 'registro_sin_vehiculo',
            'wa_phone',        replace(r.phone, '+', ''),
            'nombre',          r.full_name
          )::jsonb,
          timeout_milliseconds := 8000
        );
      END IF;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$function$;
