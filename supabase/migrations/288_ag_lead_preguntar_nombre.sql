-- ============================================================================
-- Migración 288: preguntarle el nombre al lead en vez de adivinarlo (2026-09-30).
--
-- ── POR QUÉ ────────────────────────────────────────────────────────────────
-- Hasta hoy el bot saludaba con el nombre de perfil de WhatsApp
-- (contacts[0].profile.name del webhook), que es el nombre VISIBLE que cada quien
-- se puso y no verifica nadie. Medido sobre los 22 nombres reales guardados en
-- ag_wa_sessions: 12 con emojis o símbolos, 2 con números, 4 que son negocios o
-- frases -- produciendo saludos como "¡Hola MODA!" o "¡Hola Todo!". Eso ya se
-- quitó: ahora se saluda sin nombre salvo que la persona tenga cuenta en Movi.
--
-- Pedido del usuario: en vez de quedarse sin nombre, PREGUNTARLO -- "¿con quién
-- tengo el gusto de hablar?". Así el nombre que se usa es el que la persona dio,
-- no uno adivinado.
--
-- ── DOS NOMBRES DISTINTOS, A PROPÓSITO ─────────────────────────────────────
--   `wa_name`     -> el nombre de perfil de WhatsApp, crudo. Sirve como pista en la
--                    bandeja para el asesor. NUNCA se le dice a la persona.
--   `nombre_dado` -> el que la persona escribió cuando se lo preguntamos. Este sí
--                    se usa para hablarle.
-- Mezclarlos sería volver al mismo error con otro nombre de columna.
-- ============================================================================

ALTER TABLE public.ag_driver_leads
  ADD COLUMN IF NOT EXISTS nombre_dado TEXT;

COMMENT ON COLUMN public.ag_driver_leads.nombre_dado IS
  'Nombre que la persona escribio cuando se le pregunto. Es el unico que se usa para hablarle; wa_name (el de perfil de WhatsApp) nunca. Migracion 288.';

-- Paso nuevo: se le preguntó el nombre y todavía no contesta.
ALTER TABLE public.ag_driver_leads
  DROP CONSTRAINT IF EXISTS ag_driver_leads_paso_check;

ALTER TABLE public.ag_driver_leads
  ADD CONSTRAINT ag_driver_leads_paso_check
  CHECK (paso IN ('nombre','saludado','vehiculo','pitch','descargo',
                  'registrado','sin_vehiculo','humano'));

-- El seguimiento y el envío programado tienen que contar también a los que se
-- quedaron callados justo después de que les preguntamos el nombre.
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
    SELECT l.wa_phone, l.nombre_dado, l.paso, l.vehiculo, l.nudges_enviados
    FROM ag_driver_leads l
    WHERE l.paso IN ('nombre','saludado','vehiculo','pitch','descargo')
      AND l.no_insistir = FALSE
      AND l.ultimo_in_at IS NOT NULL
      -- Ventana de Meta: SOLO contra su último mensaje entrante.
      AND l.ultimo_in_at > NOW() - interval '23 hours'
      AND l.nudges_enviados < 3
      -- Silencio: desde la última vez que alguno de los dos habló (migración 287).
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
        -- Solo el nombre que la persona dio. Si no lo dio, va null y el mensaje
        -- sale sin nombre, que es exactamente lo que debe pasar.
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

-- Mismo criterio en la lista del envío programado: se devuelve `nombre_dado`, no el
-- nombre de perfil, y se incluye el paso 'nombre' entre los que siguen abiertos.
DROP FUNCTION IF EXISTS public.ag_wa_leads_para_embudo(timestamptz);

CREATE FUNCTION public.ag_wa_leads_para_embudo(p_momento timestamptz DEFAULT NOW())
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
    dl.nombre_dado,
    u.ultimo_in,
    EXISTS (SELECT 1 FROM ag_wa_message_log m
             WHERE ag_wa_norm_phone(m.wa_phone) = u.tel AND m.sent_by = 'admin'),
    EXISTS (SELECT 1 FROM ag_wa_message_log m
             WHERE ag_wa_norm_phone(m.wa_phone) = u.tel
               AND m.direction = 'out'
               AND m.body ILIKE 'Hola quiero m%s informaci%n%')
  FROM ult u
  LEFT JOIN ag_driver_leads dl ON dl.wa_phone = u.tel
  WHERE
    u.ultimo_in > p_momento - interval '24 hours'
    AND u.tel NOT IN ('573134453649', '573148487506')
    AND NOT EXISTS (
      SELECT 1 FROM ag_users au
      WHERE length(right(regexp_replace(u.tel, '\D', '', 'g'), 10)) = 10
        AND right(regexp_replace(COALESCE(au.phone, ''), '\D', '', 'g'), 10)
          = right(regexp_replace(u.tel, '\D', '', 'g'), 10)
    )
    AND u.ultimo_texto NOT ILIKE '%c_digo de verificaci_n%'
    AND COALESCE(dl.no_insistir, FALSE) = FALSE
    AND COALESCE(dl.paso, 'saludado') NOT IN ('registrado', 'humano', 'vehiculo', 'pitch', 'descargo')
  ORDER BY u.ultimo_in DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.ag_wa_leads_para_embudo(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.ag_wa_lead_followups() TO service_role;

-- El embudo del panel: cuántos de verdad nos dieron su nombre.
--
-- DROP antes del CREATE: `CREATE OR REPLACE VIEW` no deja insertar una columna en medio de
-- las que ya existen (42P16, "cannot change name of view column"), y `dieron_nombre` va
-- despues de `de_pauta`. Como el endpoint de consulta corre el archivo en una sola
-- transaccion, ese error tumbo la migracion entera en el primer intento.
DROP VIEW IF EXISTS public.ag_driver_leads_embudo_v;

CREATE VIEW public.ag_driver_leads_embudo_v AS
  SELECT
    (created_at AT TIME ZONE 'America/Bogota')::date        AS dia,
    COUNT(*)                                                AS leads,
    COUNT(*) FILTER (WHERE origen = 'pauta')                AS de_pauta,
    COUNT(*) FILTER (WHERE nombre_dado IS NOT NULL)         AS dieron_nombre,
    COUNT(*) FILTER (WHERE vehiculo = 'moto')               AS motos,
    COUNT(*) FILTER (WHERE vehiculo = 'carro')              AS carros,
    COUNT(*) FILTER (WHERE vehiculo = 'ninguno')            AS sin_vehiculo,
    COUNT(*) FILTER (WHERE modelo_ok = FALSE)               AS modelo_no_sirve,
    COUNT(*) FILTER (WHERE paso NOT IN ('nombre','saludado')) AS avanzaron,
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

GRANT SELECT ON public.ag_driver_leads_embudo_v TO service_role;


-- El envio programado de las 9 a.m. deja la ficha en el paso 'nombre', porque ese mensaje
-- ahora pregunta como se llama la persona en vez de saltar directo al vehiculo.
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

      INSERT INTO ag_driver_leads (wa_phone, origen, paso, ultimo_in_at, ultimo_out_at, nudges_enviados)
      VALUES (r.wa_phone, 'pauta', 'nombre', r.ultimo_in_at, NOW(), 0)
      ON CONFLICT (wa_phone) DO UPDATE
        SET paso = 'nombre', ultimo_out_at = NOW(), nudges_enviados = 0,
            ultimo_nudge_at = NULL, updated_at = NOW();

      v_env := v_env + 1;
      v_det := v_det || jsonb_build_object('tel', r.wa_phone, 'estado', 'enviado');
    END LOOP;

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

GRANT EXECUTE ON FUNCTION public.ag_wa_correr_envios_programados() TO service_role;
