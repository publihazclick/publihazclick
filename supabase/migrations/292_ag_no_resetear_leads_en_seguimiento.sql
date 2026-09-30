-- ============================================================================
-- Migración 292: el envío programado no debe volver a contactar a quien ya está
-- en medio del ciclo de seguimiento (2026-09-30).
--
-- ── EL BUG, ENCONTRADO AUDITANDO LAS 54 CONVERSACIONES DE HOY ──────────────
-- `ag_wa_leads_para_embudo()` (migración 288) excluye a quien ya está en paso
-- 'vehiculo', 'pitch', 'descargo', 'registrado' o 'humano' -- pero NO a quien
-- sigue en 'saludado' o 'nombre'. Y `ag_wa_correr_envios_programados()` hace
-- `INSERT ... ON CONFLICT (wa_phone) DO UPDATE SET nudges_enviados = 0,
-- ultimo_nudge_at = NULL` sobre cada uno que toca.
--
-- Resultado real, visto en el historial de hoy (09-30): leads que llegaron
-- durante la noche YA estaban en medio del ciclo orgánico de recordatorios
-- (habían recibido el saludo a las 04:58, el recordatorio de 20 min a las 05:20,
-- el de 3h a las 08:25 -- "te dejo lo que más convence...") y seguían en paso
-- 'saludado' porque no habían contestado la pregunta del vehículo. El envío de
-- las 9 a.m. los volvió a tomar, les reinició nudges_enviados a 0, y unos
-- minutos después el cron de seguimiento les volvió a mandar el recordatorio de
-- 20 minutos -- como si nunca los hubiera contactado nadie. Pasó con al menos
-- 8 de los 9 leads que llegaron esa mañana (Yhormman, y otros).
--
-- No causó daño grave (el contenido de los mensajes repetidos era razonable,
-- no contradictorio), pero es exactamente el patrón de "parecer spam" que
-- se diseñó para evitar con los tres toques espaciados.
--
-- ── EL ARREGLO ─────────────────────────────────────────────────────────────
-- Se agrega una condición: solo entran al envío programado los leads que
-- TODAVÍA NO han recibido ningún recordatorio orgánico (`nudges_enviados = 0`
-- o sin fila en ag_driver_leads). Si ya está en medio del ciclo, el cron de
-- seguimiento normal se encarga solo -- no hace falta que el envío masivo
-- también lo toque.
-- ============================================================================

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
    -- Nuevo: si ya está en medio del ciclo orgánico de recordatorios, que lo
    -- siga atendiendo el cron de seguimiento normal -- el envío masivo no debe
    -- reiniciarle el contador y volver a saludarlo desde cero.
    AND COALESCE(dl.nudges_enviados, 0) = 0
  ORDER BY u.ultimo_in DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.ag_wa_leads_para_embudo(timestamptz) TO service_role;

COMMENT ON FUNCTION public.ag_wa_leads_para_embudo(timestamptz) IS
  'Lista de leads de conductor a los que se les puede mandar el embudo en un momento dado: ventana de 24h abierta, sin cuenta previa, y sin estar ya en medio del ciclo organico de recordatorios (nudges_enviados = 0). Migracion 292 (corrige el reinicio de contador de la 288).';
