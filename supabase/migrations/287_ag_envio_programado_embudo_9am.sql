-- ============================================================================
-- Migración 287: mandar el embudo a las 9 a.m. a los leads que quedaron sin
-- atender, y arreglar de paso cómo se mide el silencio (2026-09-30).
--
-- ── QUÉ PIDIÓ EL USUARIO ───────────────────────────────────────────────────
-- "Dejar programado para enviar el embudo a las 9 de la mañana de hoy a todos los
-- que nos escribieron al WhatsApp de conductores y estén dentro del rango de las
-- 24 horas que nos da Meta para responder gratis."
--
-- La primera noche de pauta llegaron 10 leads y ninguno recibió el embudo: solo el
-- saludo manual, entre 2 h 26 min y 3 h 50 min después de escribir. A las 9 a.m. de
-- Colombia (14:00 UTC) sus ventanas de 24h siguen abiertas -- se cierran entre las
-- 20:17 y las 22:30 de Colombia de ese mismo día.
--
-- ── A QUIÉN SÍ Y A QUIÉN NO ────────────────────────────────────────────────
-- De 38 personas que han escrito al número de conductores, 15 tienen la ventana
-- abierta a esa hora. Se descartan 4 a propósito:
--   · 573134453649 -> es el número del admin (él mismo).
--   · 573148487506 -> su número de pruebas.
--   · 573228716902 y 573011180687 -> escribieron pidiendo su código de verificación
--     y YA tienen cuenta en Movi: están registrándose, no son leads por convencer.
--     Mandarles un "¿con qué te vas a mover?" sería absurdo.
-- Quedan 11: los 10 de la pauta más 573115477532, que preguntó "Cómo registrarme"
-- el 29 y solo recibió una respuesta estática.
--
-- La ventana NO se evalúa ahora sino EN EL MOMENTO DEL ENVÍO, porque es lo único
-- que de verdad decide si Meta entrega: fuera de las 24h responde 200 OK y descarta
-- el mensaje en silencio. A quien se le haya cerrado se registra como omitido, con
-- su motivo, en vez de dar por enviado algo que no salió.
--
-- ── ARREGLO DE FONDO: CÓMO SE MIDE EL SILENCIO ─────────────────────────────
-- `ag_wa_lead_followups` medía el silencio desde `ultimo_in_at` (el último mensaje
-- de la persona). Con este envío programado eso se rompía: a las 9 a.m. su último
-- mensaje es de hace 10-12 horas, así que el cron habría disparado el recordatorio
-- "te dejo lo que más convence" a los pocos minutos del mensaje de las 9 -- dos
-- mensajes casi seguidos.
--
-- Lo correcto es medir el silencio desde la última vez que NOSOTROS le hablamos o
-- desde su último mensaje, lo que sea más reciente. Se agrega `ultimo_out_at` y el
-- cron usa GREATEST de los dos. La ventana de 24h sigue midiéndose SOLO contra
-- `ultimo_in_at`, porque esa es la regla de Meta y no cambia. Son dos relojes
-- distintos para dos cosas distintas, y confundirlos era el error.
-- ============================================================================

ALTER TABLE public.ag_driver_leads
  ADD COLUMN IF NOT EXISTS ultimo_out_at TIMESTAMPTZ;

COMMENT ON COLUMN public.ag_driver_leads.ultimo_out_at IS
  'Ultima vez que le escribimos. El silencio para los recordatorios se mide desde el mas reciente entre este y ultimo_in_at; la ventana de 24h de Meta se mide SOLO desde ultimo_in_at. Migracion 287.';


-- ─── Envíos programados de una sola vez ─────────────────────────────────────
-- Tabla de control, no un cron con fecha fija: así el envío queda auditado (a qué
-- hora se ejecutó, a cuántos les llegó, a cuántos se les había cerrado la ventana),
-- se puede cancelar con un UPDATE antes de la hora, y no vuelve a disparar el año
-- entrante como haría un `cron.schedule('0 14 30 9 *')`.
CREATE TABLE IF NOT EXISTS public.ag_wa_envio_programado (
  id               TEXT PRIMARY KEY,
  descripcion      TEXT NOT NULL,
  ejecutar_at      TIMESTAMPTZ NOT NULL,
  cancelado        BOOLEAN NOT NULL DEFAULT FALSE,
  ejecutado_at     TIMESTAMPTZ,
  enviados         INTEGER,
  omitidos         INTEGER,
  detalle          JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ag_wa_envio_programado ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ag_wa_envio_programado IS
  'Envios masivos programados de una sola vez, con registro de a quien le llego y a quien no. Migracion 287.';


-- ─── Quiénes son los destinatarios ──────────────────────────────────────────
-- Se deja como función para poder revisar la lista ANTES de la hora del envío con
-- un simple SELECT, y para que el envío use exactamente el mismo criterio que se
-- revisó -- no una consulta parecida escrita dos veces.
CREATE OR REPLACE FUNCTION public.ag_wa_leads_para_embudo(p_momento timestamptz DEFAULT NOW())
RETURNS TABLE(
  wa_phone     text,
  wa_name      text,
  ultimo_in_at timestamptz,
  ya_contactado boolean,
  recibio_error boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH ult AS (
    SELECT ag_wa_norm_phone(l.wa_phone) AS tel,
           MAX(l.created_at)            AS ultimo_in,
           (array_agg(l.body ORDER BY l.created_at DESC))[1] AS ultimo_texto
    FROM ag_wa_message_log l
    WHERE l.role = 'conductor' AND l.direction = 'in'
    GROUP BY 1
  )
  SELECT
    u.tel,
    dl.wa_name,
    u.ultimo_in,
    -- Ya recibió alguna respuesta escrita a mano: el saludo no debe volver a
    -- presentarse como si fuera el primer contacto.
    EXISTS (SELECT 1 FROM ag_wa_message_log m
             WHERE ag_wa_norm_phone(m.wa_phone) = u.tel AND m.sent_by = 'admin'),
    -- Recibió el mensaje incoherente del 2026-09-30 (ver migración de ese día):
    -- a estos dos hay que reconocerles el desliz, no ignorarlo.
    EXISTS (SELECT 1 FROM ag_wa_message_log m
             WHERE ag_wa_norm_phone(m.wa_phone) = u.tel
               AND m.direction = 'out'
               AND m.body ILIKE 'Hola quiero m%s informaci%n%')
  FROM ult u
  LEFT JOIN ag_driver_leads dl ON dl.wa_phone = u.tel
  WHERE
    -- La regla de Meta: texto libre solo dentro de las 24h del último mensaje suyo.
    u.ultimo_in > p_momento - interval '24 hours'
    -- El admin y su número de pruebas quedan fuera.
    AND u.tel NOT IN ('573134453649', '573148487506')
    -- Quien ya tiene cuenta en Movi no es un lead por convencer. El cruce va por los
    -- últimos 10 dígitos porque ag_users.phone tiene formatos mixtos (ver
    -- movi_phone_e164_normalization); un BSUID no cruza con nadie y eso está bien.
    AND NOT EXISTS (
      SELECT 1 FROM ag_users au
      WHERE length(right(regexp_replace(u.tel, '\D', '', 'g'), 10)) = 10
        AND right(regexp_replace(COALESCE(au.phone, ''), '\D', '', 'g'), 10)
          = right(regexp_replace(u.tel, '\D', '', 'g'), 10)
    )
    -- Pidió su código de verificación: está a mitad del registro, no arrancando.
    AND u.ultimo_texto NOT ILIKE '%c_digo de verificaci_n%'
    -- Respetar a quien pidió que no le escribamos, a quien pidió un humano, y no
    -- repetirle el saludo a quien ya avanzó en el embudo por su cuenta.
    AND COALESCE(dl.no_insistir, FALSE) = FALSE
    AND COALESCE(dl.paso, 'saludado') NOT IN ('registrado', 'humano', 'vehiculo', 'pitch', 'descargo')
  ORDER BY u.ultimo_in DESC;
$function$;

COMMENT ON FUNCTION public.ag_wa_leads_para_embudo(timestamptz) IS
  'Lista de leads de conductor a los que se les puede mandar el embudo en un momento dado, respetando la ventana de 24h de Meta. Migracion 287.';

GRANT EXECUTE ON FUNCTION public.ag_wa_leads_para_embudo(timestamptz) TO service_role;


-- ─── El ejecutor ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_wa_correr_envios_programados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  j        RECORD;
  r        RECORD;
  v_url    TEXT;
  v_key    TEXT;
  v_env    integer;
  v_om     integer;
  v_det    jsonb;
  v_total  integer := 0;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url'     LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN 0; END IF;

  FOR j IN
    SELECT * FROM ag_wa_envio_programado
    WHERE ejecutado_at IS NULL AND cancelado = FALSE AND ejecutar_at <= NOW()
    ORDER BY ejecutar_at
  LOOP
    v_env := 0; v_om := 0; v_det := '[]'::jsonb;

    -- Se marca ejecutado ANTES de mandar nada. Si algo revienta a mitad, el peor
    -- caso es que a algunos no les llegue -- nunca que el cron lo reintente dentro
    -- de 2 minutos y les escriba dos veces a los que ya recibieron.
    UPDATE ag_wa_envio_programado SET ejecutado_at = NOW() WHERE id = j.id;

    FOR r IN SELECT * FROM ag_wa_leads_para_embudo(NOW())
    LOOP
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/ag-whatsapp',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || v_key),
        body    := jsonb_build_object(
          '_internal_event', 'lead_embudo_programado',
          'wa_phone',        r.wa_phone,
          'wa_name',         r.wa_name,
          'ya_contactado',   r.ya_contactado,
          'recibio_error',   r.recibio_error
        )::jsonb,
        timeout_milliseconds := 8000
      );

      -- La ficha del lead queda lista para que el seguimiento cuente desde ahora y
      -- no desde el mensaje que la persona mandó anoche.
      INSERT INTO ag_driver_leads (wa_phone, wa_name, origen, paso, ultimo_in_at, ultimo_out_at, nudges_enviados)
      VALUES (r.wa_phone, r.wa_name, 'pauta', 'saludado', r.ultimo_in_at, NOW(), 0)
      ON CONFLICT (wa_phone) DO UPDATE
        SET paso = 'saludado', ultimo_out_at = NOW(), nudges_enviados = 0,
            ultimo_nudge_at = NULL, updated_at = NOW();

      v_env := v_env + 1;
      v_det := v_det || jsonb_build_object('tel', r.wa_phone, 'estado', 'enviado');
    END LOOP;

    -- Los que quedaron fuera por ventana cerrada, para que el registro no mienta.
    SELECT COUNT(*) INTO v_om
    FROM (
      SELECT ag_wa_norm_phone(wa_phone) AS tel, MAX(created_at) AS ultimo_in
      FROM ag_wa_message_log WHERE role = 'conductor' AND direction = 'in' GROUP BY 1
    ) t
    WHERE t.ultimo_in <= NOW() - interval '24 hours';

    UPDATE ag_wa_envio_programado
       SET enviados = v_env, omitidos = v_om, detalle = v_det
     WHERE id = j.id;

    v_total := v_total + v_env;
  END LOOP;

  RETURN v_total;
END;
$function$;

COMMENT ON FUNCTION public.ag_wa_correr_envios_programados() IS
  'Ejecuta los envios programados cuya hora ya paso, una sola vez cada uno. Migracion 287.';

GRANT EXECUTE ON FUNCTION public.ag_wa_correr_envios_programados() TO service_role;

-- Cada 2 minutos: suficiente para que "las 9 a.m." sea 9:00-9:02, y barato porque
-- la corrida sin trabajo es un SELECT sobre una tabla de una fila.
SELECT cron.unschedule('movi-envios-programados')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'movi-envios-programados');

SELECT cron.schedule('movi-envios-programados', '*/2 * * * *',
  $$SELECT public.ag_wa_correr_envios_programados();$$);


-- ─── El silencio se mide desde el último contacto, no solo desde su mensaje ──
-- Único cambio real sobre la 285: GREATEST(ultimo_in_at, ultimo_out_at) para los
-- escalones, y ultimo_in_at a secas para la ventana de 24h. Se agrega ultimo_out_at
-- al payload por completitud del registro.
CREATE OR REPLACE FUNCTION public.ag_wa_lead_followups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r        RECORD;
  v_url    TEXT;
  v_key    TEXT;
  v_count  integer := 0;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url'     LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN 0; END IF;

  PERFORM ag_leads_marcar_registrados();

  FOR r IN
    SELECT l.wa_phone, l.wa_name, l.paso, l.vehiculo, l.nudges_enviados
    FROM ag_driver_leads l
    WHERE l.paso IN ('saludado','vehiculo','pitch','descargo')
      AND l.no_insistir = FALSE
      AND l.ultimo_in_at IS NOT NULL
      -- Ventana de Meta: SOLO contra su último mensaje entrante.
      AND l.ultimo_in_at > NOW() - interval '23 hours'
      AND l.nudges_enviados < 3
      -- Silencio: desde la última vez que alguno de los dos habló.
      AND NOW() - GREATEST(l.ultimo_in_at, COALESCE(l.ultimo_out_at, l.ultimo_in_at))
            >= (ARRAY['20 minutes','3 hours','20 hours'])[l.nudges_enviados + 1]::interval
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
        'wa_name',         r.wa_name,
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


-- ─── Programar el envío de las 9:00 a.m. de Colombia de hoy ─────────────────
-- 09:00 America/Bogota = 14:00 UTC. Se guarda ya convertido a timestamptz para que
-- no dependa de la zona del servidor (que es UTC).
INSERT INTO public.ag_wa_envio_programado (id, descripcion, ejecutar_at)
VALUES (
  'embudo_conductores_2026_09_30_9am',
  'Embudo de captacion a los leads de la pauta que quedaron sin atender la primera noche. Solo a quienes tengan la ventana de 24h abierta a esa hora.',
  '2026-09-30 14:00:00+00'
)
ON CONFLICT (id) DO UPDATE
  SET ejecutar_at = EXCLUDED.ejecutar_at, cancelado = FALSE;
