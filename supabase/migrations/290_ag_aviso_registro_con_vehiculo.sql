-- ============================================================================
-- Migración 290: el aviso de nuevo registro dice si el conductor es de moto o de
-- carro (2026-09-30).
--
-- ── EL PEDIDO ──────────────────────────────────────────────────────────────
-- "Cuando me avisas a mi WhatsApp sobre un nuevo registro, indícame si ese registro
-- es de carro o moto."
--
-- ── POR QUÉ NO ERA CAMBIAR UNA LÍNEA ───────────────────────────────────────
-- El aviso lo dispara un trigger AFTER INSERT sobre `ag_users` (migración 228), y en
-- ese instante el vehículo TODAVÍA NO EXISTE: se guarda en `ag_drivers`, que es un
-- paso posterior del registro. Medido sobre los 74 conductores reales: la fila del
-- vehículo llega entre **1 segundo y 19 días** después de la de usuario. O sea que
-- leerlo en el trigger de ag_users devolvería NULL casi siempre.
--
-- Mover el aviso al momento del vehículo tampoco alcanza por sí solo: de 77 usuarios
-- con role='driver', **5 nunca llegaron a tener vehículo** (3 sin fila en ag_drivers y
-- 2 con fila pero sin tipo). Si el aviso dependiera solo del vehículo, esos 5 no se
-- habrían reportado nunca.
--
-- ── LA SOLUCIÓN: UN SOLO MENSAJE POR PERSONA, SIEMPRE ──────────────────────
-- Se marca en `ag_users.alerta_registro_at` cuándo se avisó, y hay tres disparadores
-- que compiten por ser el primero -- el que llegue gana y los otros se callan:
--   1. PASAJERO: se avisa al instante, igual que hoy. No hay vehículo que esperar.
--   2. CONDUCTOR CON VEHÍCULO: en cuanto se conoce el tipo (INSERT en ag_drivers, o
--      UPDATE que lo llena), se avisa con "🏍️ Moto" o "🚗 Carro" más placa y marca.
--   3. CONDUCTOR QUE SE QUEDÓ A MEDIAS: si pasan 30 minutos sin vehículo, se avisa
--      igual diciendo que quedó pendiente. Así los 5 del caso de arriba no se pierden,
--      y de paso se ve quién abandonó el registro a mitad de camino.
--
-- Nunca llegan dos mensajes de la misma persona: el `WHERE alerta_registro_at IS NULL`
-- con `UPDATE ... RETURNING` hace que solo uno de los tres caminos pueda reclamarlo.
-- ============================================================================

ALTER TABLE public.ag_users
  ADD COLUMN IF NOT EXISTS alerta_registro_at TIMESTAMPTZ;

COMMENT ON COLUMN public.ag_users.alerta_registro_at IS
  'Cuando se aviso al admin de este registro. Sirve para que llegue UN solo mensaje por persona aunque compitan varios disparadores. Migracion 290.';

-- Los que ya existen no deben generar avisos viejos al activar esto.
UPDATE public.ag_users SET alerta_registro_at = created_at WHERE alerta_registro_at IS NULL;


-- ─── El envío, en un solo sitio ─────────────────────────────────────────────
-- Devuelve true si de verdad avisó (o sea, si este camino fue el que reclamó el
-- registro). Los dos canales, WhatsApp y correo, se mantienen igual que en la 228:
-- independientes, y si uno falla el otro llega.
CREATE OR REPLACE FUNCTION public.ag_avisar_registro(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url    TEXT;
  v_key    TEXT;
  v_resend TEXT;
  u        RECORD;
  d        RECORD;
  v_titulo TEXT;
  v_msg    TEXT;
  v_veh    TEXT;
BEGIN
  -- Reclamar el registro: si otro camino ya avisó, acá no se hace nada.
  UPDATE ag_users SET alerta_registro_at = NOW()
   WHERE id = p_user_id AND alerta_registro_at IS NULL
  RETURNING * INTO u;
  IF u.id IS NULL THEN RETURN false; END IF;

  SELECT * INTO d FROM ag_drivers WHERE ag_user_id = p_user_id
   ORDER BY created_at DESC LIMIT 1;

  IF u.role = 'driver' THEN
    v_veh := NULLIF(TRIM(COALESCE(d.vehicle_type, '')), '');
    v_titulo := CASE
      WHEN v_veh = 'moto'                  THEN '🏍️ Conductor nuevo — MOTO'
      WHEN v_veh IN ('carro','sedan','suv') THEN '🚗 Conductor nuevo — CARRO'
      WHEN v_veh = 'camion'                THEN '🚛 Conductor nuevo — CAMIÓN'
      WHEN v_veh IS NOT NULL               THEN '🚙 Conductor nuevo — ' || upper(v_veh)
      ELSE '⏳ Conductor nuevo — SIN VEHÍCULO AÚN'
    END;
  ELSE
    v_titulo := '🆕 Pasajero nuevo en Movi';
  END IF;

  v_msg := COALESCE(NULLIF(TRIM(u.full_name), ''), '(sin nombre)')
    || CASE WHEN COALESCE(u.phone, '') <> '' THEN ' · ' || u.phone ELSE '' END
    || CASE WHEN COALESCE(u.city,  '') <> '' THEN ' · ' || u.city  ELSE '' END
    -- Datos del vehículo: lo que de verdad sirve para reconocerlo de un vistazo.
    || CASE WHEN v_veh IS NOT NULL THEN
         ' · ' || COALESCE(NULLIF(TRIM(d.vehicle_brand), ''), 'sin marca')
         || COALESCE(' ' || NULLIF(d.vehicle_year::text, ''), '')
         || COALESCE(' · placa ' || NULLIF(TRIM(COALESCE(d.vehicle_plate, d.plate)), ''), '')
       ELSE '' END;

  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'supabase_url'     LIMIT 1;
  SELECT decrypted_secret INTO v_key    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  SELECT decrypted_secret INTO v_resend FROM vault.decrypted_secrets WHERE name = 'resend_api_key'   LIMIT 1;

  IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/ag-whatsapp',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || v_key),
        body    := jsonb_build_object(
          'to', 'admin', 'event', 'new_registration',
          'data', jsonb_build_object('context', v_titulo, 'message', v_msg)
        ),
        timeout_milliseconds := 8000
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF v_resend IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || v_resend),
        body    := jsonb_build_object(
          'from',    'Movi <noreply@publihazclick.com>',
          'to',      ARRAY['publihazclick.com@gmail.com'],
          'subject', v_titulo,
          'text',    v_msg
        ),
        timeout_milliseconds := 8000
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ag_avisar_registro(uuid) TO service_role;


-- ─── Disparador 1: el registro en sí ────────────────────────────────────────
-- Pasajero -> se avisa ya. Conductor -> se espera al vehículo (o a los 30 minutos).
CREATE OR REPLACE FUNCTION public.ag_notify_new_registration()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role = 'driver' THEN
    RETURN NEW;   -- lo avisa el vehículo, o el repechaje de los 30 min
  END IF;
  PERFORM ag_avisar_registro(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ag_users_notify_registration ON public.ag_users;
CREATE TRIGGER ag_users_notify_registration
  AFTER INSERT ON public.ag_users
  FOR EACH ROW EXECUTE FUNCTION public.ag_notify_new_registration();


-- ─── Disparador 2: ya se conoce el vehículo ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_notify_driver_vehicle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(TRIM(NEW.vehicle_type), '') = '' THEN RETURN NEW; END IF;
  PERFORM ag_avisar_registro(NEW.ag_user_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ag_drivers_notify_vehicle ON public.ag_drivers;
CREATE TRIGGER ag_drivers_notify_vehicle
  AFTER INSERT OR UPDATE OF vehicle_type ON public.ag_drivers
  FOR EACH ROW EXECUTE FUNCTION public.ag_notify_driver_vehicle();


-- ─── Disparador 3: el repechaje ─────────────────────────────────────────────
-- Conductor que lleva más de 30 minutos registrado y sigue sin vehículo. Sin esto se
-- perderían: de 77 conductores, 5 nunca llegaron a tener uno.
CREATE OR REPLACE FUNCTION public.ag_avisar_registros_sin_vehiculo()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT u.id FROM ag_users u
    WHERE u.role = 'driver'
      AND u.alerta_registro_at IS NULL
      AND u.created_at < NOW() - interval '30 minutes'
    ORDER BY u.created_at
    LIMIT 30
  LOOP
    IF ag_avisar_registro(r.id) THEN v_count := v_count + 1; END IF;
  END LOOP;
  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ag_avisar_registros_sin_vehiculo() TO service_role;

SELECT cron.unschedule('movi-registros-sin-vehiculo')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'movi-registros-sin-vehiculo');

SELECT cron.schedule('movi-registros-sin-vehiculo', '*/10 * * * *',
  $$SELECT public.ag_avisar_registros_sin_vehiculo();$$);
