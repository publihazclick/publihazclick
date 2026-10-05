-- ============================================================================
-- Migración 318 (2026-10-05): el chat de conductores se entera SOLO del registro.
--
-- Pedido del usuario: "cuando alguien inicia conversación en el chat de conductores debes
-- detectar que pidió el código de verificación y apenas se registra en Movi como conductor
-- le dices su nombre (el de la app), que se registró como conductor de moto o carro, le
-- muestras los datos del vehículo y que el siguiente paso es recargar saldo ... vamos
-- disminuyendo tantas incongruencias y tantos textos innecesarios".
--
-- Antes: ag_leads_marcar_registrados (cada 5 min) marcaba al lead como registrado EN
-- SILENCIO. Caso real …2330: escribió 15:12, se registró 15:13, nadie le dijo nada y a las
-- 15:21 escribió "tengo una duda" y recibió un genérico.
--
-- 1. pidio_codigo_at: cuando la app pide el código (fila en ag_otp_codes) y ese número es un
--    lead del chat, se anota. Mientras tanto no le llegan los "¿ya descargaste la app?".
-- 2. Al guardarse el vehículo (INSERT en ag_drivers o UPDATE que llena vehicle_type) se llama a
--    ag-whatsapp {_internal_event:'bienvenida_conductor'}: nombre + moto/carro + marca, modelo,
--    color, placa + "el siguiente paso es recargar". La función revisa la ventana de 24 h,
--    que el dueño no esté atendiendo y que sea una sola vez (bienvenida_registro_at).
--    Solo se llama si el número tiene lead sin bienvenida: un registro sin chat no cuesta nada.
-- Para apagarlo: DROP TRIGGER trg_ag_bienvenida_conductor ON ag_drivers;
-- ============================================================================

ALTER TABLE public.ag_driver_leads
  ADD COLUMN IF NOT EXISTS pidio_codigo_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bienvenida_registro_at TIMESTAMPTZ;

COMMENT ON COLUMN public.ag_driver_leads.pidio_codigo_at IS
  'Ultima vez que este numero pidio el codigo de verificacion en la app (se esta registrando). Migracion 318.';
COMMENT ON COLUMN public.ag_driver_leads.bienvenida_registro_at IS
  'Cuando el chat le dio la bienvenida con su nombre y su vehiculo. Una sola vez. Migracion 318.';

-- ─── 1. Pidió el código ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_lead_pidio_codigo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v10 text := right(regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'), 10);
BEGIN
  IF length(v10) = 10 THEN
    UPDATE ag_driver_leads SET pidio_codigo_at = NOW(), updated_at = NOW()
     WHERE right(regexp_replace(wa_phone, '\D', '', 'g'), 10) = v10;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;   -- nunca bloquear el envío del código
END;
$function$;

DROP TRIGGER IF EXISTS trg_ag_lead_pidio_codigo ON public.ag_otp_codes;
CREATE TRIGGER trg_ag_lead_pidio_codigo AFTER INSERT ON public.ag_otp_codes
  FOR EACH ROW EXECUTE FUNCTION public.ag_lead_pidio_codigo();

-- ─── 2. Terminó el registro: bienvenida ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_bienvenida_conductor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_url text; v_key text; v10 text;
BEGIN
  IF COALESCE(TRIM(NEW.vehicle_type), '') = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(TRIM(OLD.vehicle_type), '') <> '' THEN RETURN NEW; END IF;
  SELECT right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) INTO v10 FROM ag_users WHERE id = NEW.ag_user_id;
  IF v10 IS NULL OR length(v10) <> 10 THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM ag_driver_leads
                  WHERE right(regexp_replace(wa_phone, '\D', '', 'g'), 10) = v10
                    AND bienvenida_registro_at IS NULL
                    AND ultimo_in_at > NOW() - interval '24 hours') THEN
    RETURN NEW;
  END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url'     LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN NEW; END IF;
  PERFORM net.http_post(
    url     := v_url || '/functions/v1/ag-whatsapp',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body    := jsonb_build_object('_internal_event', 'bienvenida_conductor', 'ag_user_id', NEW.ag_user_id),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;   -- nunca bloquear el registro
END;
$function$;

DROP TRIGGER IF EXISTS trg_ag_bienvenida_conductor ON public.ag_drivers;
CREATE TRIGGER trg_ag_bienvenida_conductor AFTER INSERT OR UPDATE OF vehicle_type ON public.ag_drivers
  FOR EACH ROW EXECUTE FUNCTION public.ag_bienvenida_conductor();

-- ─── 3. Recordatorios: no a quien está a mitad del registro ────────────────
CREATE OR REPLACE FUNCTION public.ag_wa_lead_followups()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url    text;
  v_key    text;
  r        record;
  v_count  integer := 0;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url'     LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN 0; END IF;

  PERFORM ag_leads_marcar_registrados();

  FOR r IN
    SELECT l.wa_phone, l.nombre_dado, l.paso, l.vehiculo, l.nudges_enviados
    FROM ag_driver_leads l
    -- 'descargo' fuera: ya confirmÃ³ que descargÃ³, seguir preguntÃ¡ndole lo
    -- mismo es justo el bug que se reportÃ³ (migraciÃ³n 294).
    WHERE l.paso IN ('nombre','saludado','vehiculo','pitch')
      AND l.no_insistir = FALSE
      -- Pidió el código de verificación en la app = se está registrando: no se le
      -- pregunta "¿ya descargaste?" durante 6 h (migración 318).
      AND (l.pidio_codigo_at IS NULL OR l.pidio_codigo_at < NOW() - interval '6 hours')
      AND l.ultimo_in_at IS NOT NULL
      -- Ventana de Meta: SOLO contra su Ãºltimo mensaje entrante.
      AND l.ultimo_in_at > NOW() - interval '23 hours'
      AND l.nudges_enviados < 3
      -- Silencio de LA PERSONA, contado desde su Ãºltimo mensaje (no acumulado).
      AND NOW() - l.ultimo_in_at
            >= (ARRAY['20 minutes','3 hours','20 hours'])[l.nudges_enviados + 1]::interval
      -- Y el bot no le acaba de escribir.
      AND (l.ultimo_out_at IS NULL OR NOW() - l.ultimo_out_at >= interval '20 minutes')
      AND (l.ultimo_nudge_at IS NULL OR NOW() - l.ultimo_nudge_at >= interval '15 minutes')
    ORDER BY l.ultimo_in_at ASC
    LIMIT 40
  LOOP
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/ag-whatsapp',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object(
        '_internal_event', 'lead_followup',
        'wa_phone',        r.wa_phone,
        'wa_name',         r.nombre_dado,
        'paso',            r.paso,
        'vehiculo',        r.vehiculo,
        'numero_nudge',    r.nudges_enviados + 1
      )::jsonb,
      timeout_milliseconds := 8000
    );

    UPDATE ag_driver_leads
       SET nudges_enviados = nudges_enviados + 1,
           ultimo_nudge_at = NOW(),
           ultimo_out_at   = NOW(),
           updated_at      = NOW()
     WHERE wa_phone = r.wa_phone;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;
