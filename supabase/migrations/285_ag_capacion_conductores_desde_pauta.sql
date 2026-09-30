-- ============================================================================
-- Migración 285: atención automatizada a los conductores que llegan de la pauta
-- de Facebook Ads (2026-09-30).
--
-- ── EL PROBLEMA MEDIDO, NO SUPUESTO ────────────────────────────────────────
-- El 2026-09-30 arrancó una pauta en Facebook Ads para atraer conductores de moto
-- y carro. Llegaron 9 leads en una noche (contra 1 al día las semanas anteriores).
-- Los 9 escribieron el mensaje predeterminado del botón de Meta:
--     7 -> "¡Hola! Quiero más información"
--     2 -> "¡Hola! Me gustaría conseguir más información sobre esto."
-- y a los 9 el bot les contestó lo mismo: "Ya te conecto con un asesor de Movi",
-- o sea que escaló a un humano y se quedó callado.
--
-- Esperas reales hasta que una persona respondió, medidas en ag_wa_message_log:
--     01:17 -> 05:07  = 3 h 50 min
--     01:32 -> 05:07  = 3 h 35 min
--     01:47 -> 05:08  = 3 h 21 min
--     02:45 -> 05:11  = 2 h 26 min
-- Uno de ellos escribió "gracias" después del aviso de escalada y siguió
-- esperando 40 minutos más.
--
-- CAUSA EXACTA: en handleSupportConversation, el menú instantáneo solo actúa con
-- saludos de <=20 caracteres que calcen exacto contra una lista cerrada (hola,
-- info, ayuda...). "¡Hola! Quiero más información" tiene 30 caracteres, así que
-- se lo pasaba a la IA, que al no ver una pregunta concreta devolvía "escalate".
-- El mensaje MÁS frecuente y más valioso del negocio caía justo en el hueco.
--
-- ── QUÉ HACE ESTA MIGRACIÓN ────────────────────────────────────────────────
-- Guarda el embudo de cada lead (para poder medir costo por conductor registrado)
-- y manda los recordatorios cuando la persona se queda callada a mitad del
-- camino. El flujo de conversación vive en ag-whatsapp; acá va lo que tiene que
-- sobrevivir a un reinicio de la función y lo que necesita un reloj.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ag_driver_leads (
  wa_phone          TEXT PRIMARY KEY,
  wa_name           TEXT,
  -- 'pauta' cuando llegó con el texto predeterminado del botón de Meta,
  -- 'organico' cuando escribió con sus propias palabras.
  origen            TEXT NOT NULL DEFAULT 'organico',
  primer_mensaje    TEXT,
  -- Dónde quedó en el embudo. Es lo que decide si hay que empujarlo y con qué.
  --   saludado    -> se le preguntó con qué se va a mover, sin responder aún
  --   vehiculo    -> ya dijo moto/carro, se le preguntó el modelo
  --   pitch       -> ya recibió el discurso y el link de descarga
  --   descargo    -> dijo que ya descargó la app
  --   registrado  -> apareció en ag_users/ag_drivers (cruce automático)
  --   sin_vehiculo-> no tiene vehículo propio; no se le insiste con el registro
  --   humano      -> pidió hablar con una persona o cayó en algo que el bot no cubre
  paso              TEXT NOT NULL DEFAULT 'saludado'
                       CHECK (paso IN ('saludado','vehiculo','pitch','descargo',
                                       'registrado','sin_vehiculo','humano')),
  vehiculo          TEXT CHECK (vehiculo IS NULL OR vehiculo IN ('moto','carro','ninguno')),
  -- NULL = no se sabe todavía; FALSE = el vehículo es más viejo que el límite.
  modelo_ok         BOOLEAN,
  ag_user_id        UUID,
  registrado_at     TIMESTAMPTZ,
  primer_viaje_at   TIMESTAMPTZ,
  -- Último mensaje ENTRANTE de esta persona: es lo que abre la ventana de 24h de
  -- WhatsApp. Fuera de esa ventana Meta descarta el texto libre EN SILENCIO, así
  -- que ningún recordatorio se manda sin mirar esto primero.
  ultimo_in_at      TIMESTAMPTZ,
  nudges_enviados   INTEGER NOT NULL DEFAULT 0,
  ultimo_nudge_at   TIMESTAMPTZ,
  -- El lead pidió explícitamente que no le escribamos más.
  no_insistir       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ag_driver_leads_pendientes
  ON public.ag_driver_leads (paso, ultimo_in_at DESC)
  WHERE paso IN ('saludado','vehiculo','pitch','descargo');

CREATE INDEX IF NOT EXISTS idx_ag_driver_leads_creado
  ON public.ag_driver_leads (created_at DESC);

-- Mismo criterio que ag_wa_message_log: RLS encendido y sin políticas. Nadie con
-- la clave anon lee esto; el panel entra por ag-admin-action con service_role.
ALTER TABLE public.ag_driver_leads ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ag_driver_leads IS
  'Embudo de los conductores que llegan por la pauta de Facebook al numero de soporte. Migracion 285.';


-- ─── Cruce automático: ¿este lead ya se registró? ───────────────────────────
-- El cruce es por los ÚLTIMOS 10 DÍGITOS, no en crudo: ag_users.phone tiene
-- formatos mixtos y wa_phone llega como lo manda Meta (ver
-- movi_phone_e164_normalization y la nota de ag_wa_contact_summary en la 267).
-- Un BSUID ("CO.1025109683878541") no tiene 10 dígitos útiles y simplemente no
-- cruza con nadie -- a esa persona no se le puede seguir el rastro hasta el
-- registro, y es correcto que quede sin marcar en vez de adivinar.
CREATE OR REPLACE FUNCTION public.ag_leads_marcar_registrados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  WITH cruce AS (
    SELECT l.wa_phone,
           u.id            AS ag_user_id,
           u.created_at    AS registrado_at,
           (SELECT MIN(t.created_at) FROM ag_trips t WHERE t.driver_id = d.id) AS primer_viaje_at
    FROM ag_driver_leads l
    JOIN ag_users u
      ON length(right(regexp_replace(l.wa_phone, '\D', '', 'g'), 10)) = 10
     AND right(regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g'), 10)
       = right(regexp_replace(l.wa_phone,        '\D', '', 'g'), 10)
    LEFT JOIN ag_drivers d ON d.ag_user_id = u.id
    WHERE l.registrado_at IS NULL
  )
  UPDATE ag_driver_leads l
     SET paso            = 'registrado',
         ag_user_id      = c.ag_user_id,
         registrado_at   = c.registrado_at,
         primer_viaje_at = c.primer_viaje_at,
         updated_at      = NOW()
    FROM cruce c
   WHERE l.wa_phone = c.wa_phone;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.ag_leads_marcar_registrados() IS
  'Marca como registrados los leads que ya aparecen en ag_users, cruzando por los ultimos 10 digitos. Migracion 285.';


-- ─── Recordatorios a los leads que se quedaron callados ─────────────────────
-- Tres toques y se deja quieto: 20 min, 3 h y 20 h después de su último mensaje.
-- El de 20 h es el último posible: a las 24 h se cierra la ventana de servicio de
-- WhatsApp y Meta ya no entrega texto libre (responde 200 OK y lo descarta en
-- silencio -- el mismo engaño que dejó a 6 conductores esperando a un asesor en
-- septiembre). Para insistir más allá de eso haría falta una plantilla aprobada
-- por Meta, que hoy no existe.
--
-- Se apaga solo en cuatro casos: la persona contestó (ultimo_in_at se mueve y el
-- paso avanza), ya se registró, pidió que no le escribamos, o pidió un humano.
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

  -- Antes de empujar a nadie, actualizar quién ya se registró: sería pésimo
  -- mandarle "¿alcanzaste a descargar la app?" a alguien que ya está trabajando.
  PERFORM ag_leads_marcar_registrados();

  FOR r IN
    SELECT l.wa_phone, l.wa_name, l.paso, l.vehiculo, l.nudges_enviados
    FROM ag_driver_leads l
    WHERE l.paso IN ('saludado','vehiculo','pitch','descargo')
      AND l.no_insistir = FALSE
      AND l.ultimo_in_at IS NOT NULL
      -- Dentro de la ventana de 24h, con margen para que el mensaje alcance a salir.
      AND l.ultimo_in_at > NOW() - interval '23 hours'
      AND l.nudges_enviados < 3
      -- El escalón que toca según cuántos lleva: 20 min, 3 h, 20 h.
      AND NOW() - l.ultimo_in_at >= (ARRAY['20 minutes','3 hours','20 hours'])[l.nudges_enviados + 1]::interval
      -- Nunca dos recordatorios seguidos pegados, ni aunque el cron se atrase.
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

    -- Se marca ACÁ, no en la función: si el envío falla, igual no se reintenta en
    -- bucle cada 5 minutos escribiéndole tres veces a la misma persona. Se prefiere
    -- perder un recordatorio antes que parecer spam con alguien que estamos
    -- tratando de convencer.
    UPDATE ag_driver_leads
       SET nudges_enviados = nudges_enviados + 1,
           ultimo_nudge_at = NOW(),
           updated_at      = NOW()
     WHERE wa_phone = r.wa_phone;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.ag_wa_lead_followups() IS
  'Manda los recordatorios (20 min / 3 h / 20 h) a los leads de conductor que se quedaron callados, siempre dentro de la ventana de 24h de WhatsApp. Migracion 285.';


-- Cada 5 minutos. No cada minuto: los escalones son de 20 min para arriba, así que
-- un minuto de precisión no le sirve a nadie y solo multiplica corridas vacías.
SELECT cron.unschedule('movi-lead-followups')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'movi-lead-followups');

SELECT cron.schedule('movi-lead-followups', '*/5 * * * *',
  $$SELECT public.ag_wa_lead_followups();$$);


-- ─── Embudo para el panel ───────────────────────────────────────────────────
-- Una fila por día, para poder ver de una si la pauta está trayendo conductores
-- o solo curiosos. `hasta_registro_min` es la mediana del tiempo que tardan en
-- registrarse los que sí lo hacen.
CREATE OR REPLACE VIEW public.ag_driver_leads_embudo_v AS
  SELECT
    (created_at AT TIME ZONE 'America/Bogota')::date        AS dia,
    COUNT(*)                                                AS leads,
    COUNT(*) FILTER (WHERE origen = 'pauta')                AS de_pauta,
    COUNT(*) FILTER (WHERE vehiculo = 'moto')               AS motos,
    COUNT(*) FILTER (WHERE vehiculo = 'carro')              AS carros,
    COUNT(*) FILTER (WHERE vehiculo = 'ninguno')            AS sin_vehiculo,
    COUNT(*) FILTER (WHERE modelo_ok = FALSE)               AS modelo_no_sirve,
    COUNT(*) FILTER (WHERE paso <> 'saludado')              AS respondieron,
    COUNT(*) FILTER (WHERE paso IN ('pitch','descargo','registrado')) AS llegaron_al_link,
    COUNT(*) FILTER (WHERE registrado_at IS NOT NULL)       AS registrados,
    COUNT(*) FILTER (WHERE primer_viaje_at IS NOT NULL)     AS con_primer_viaje,
    COUNT(*) FILTER (WHERE paso = 'humano')                 AS pidieron_humano,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (registrado_at - created_at)) / 60
    )::numeric, 1)                                          AS hasta_registro_min
  FROM public.ag_driver_leads
  GROUP BY 1
  ORDER BY 1 DESC;

COMMENT ON VIEW public.ag_driver_leads_embudo_v IS
  'Embudo diario de captacion de conductores: leads, calificados, registrados y primer viaje. Migracion 285.';

GRANT SELECT ON public.ag_driver_leads_embudo_v TO service_role;
GRANT EXECUTE ON FUNCTION public.ag_wa_lead_followups()      TO service_role;
GRANT EXECUTE ON FUNCTION public.ag_leads_marcar_registrados() TO service_role;


-- ─── Los 9 leads de anoche NO se pierden ────────────────────────────────────
-- Ya están en ag_wa_message_log; se siembran acá con el paso donde quedaron para
-- que el embudo arranque con la verdad y no en cero. No se les manda ningún
-- recordatorio automático: su ventana de 24h ya venció o está por vencer, y
-- además ya recibieron el saludo manual. Quedan con nudges_enviados = 3 justo
-- para eso -- que el cron no los toque.
INSERT INTO public.ag_driver_leads
  (wa_phone, origen, primer_mensaje, paso, ultimo_in_at, nudges_enviados, created_at)
SELECT
  l.wa_phone,
  'pauta',
  l.body,
  'saludado',
  l.created_at,
  3,
  l.created_at
FROM ag_wa_message_log l
WHERE l.role = 'conductor'
  AND l.direction = 'in'
  AND l.created_at >= '2026-09-29 00:00:00+00'
  AND (l.body ILIKE '%quiero m_s informaci_n%' OR l.body ILIKE '%conseguir m_s informaci_n%')
ON CONFLICT (wa_phone) DO NOTHING;

SELECT public.ag_leads_marcar_registrados();
