-- Migración 267: avisarle al admin cada vez que alguien INICIA una conversación
-- de WhatsApp, con los datos de esa persona (2026-09-05, pedido explícito).
--
-- POR QUÉ "INICIA" Y NO "CADA MENSAJE"
-- En la última semana entraron 421 mensajes de pasajeros y 54 de conductores. Un aviso
-- por mensaje sería inservible: el admin dejaría de mirarlos a los dos días. Se avisa
-- una vez por conversación nueva, y se toma como "nueva" cuando esa persona no había
-- escrito en las últimas 24 horas.
--
-- Las 24h no son un número al azar: es exactamente la ventana de servicio de WhatsApp.
-- Cuando el aviso llega, la ventana está abierta con certeza, así que el admin SIEMPRE
-- puede responder desde el panel (ver migración 266). Si se usara un plazo más corto,
-- llegarían avisos de conversaciones que en realidad son la misma; si fuera más largo,
-- llegarían avisos de gente a la que ya no se le puede escribir.

-- ─── Candado anti-duplicado ─────────────────────────────────────────────────────
-- Una fila por número. El reclamo es ATÓMICO a propósito: dos mensajes que lleguen
-- con segundos de diferencia entran como dos invocaciones simultáneas de la edge
-- function, y un simple "¿hay algo reciente?" seguido de un insert dejaría pasar los
-- dos (el clásico read-then-write con carrera). Acá gana uno solo y el otro no recibe
-- fila de vuelta.
CREATE TABLE IF NOT EXISTS public.ag_wa_conversation_alerts (
  wa_phone      text PRIMARY KEY,
  role          text NOT NULL,
  last_alert_at timestamptz NOT NULL DEFAULT now(),
  alert_count   integer NOT NULL DEFAULT 1
);

ALTER TABLE public.ag_wa_conversation_alerts ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito: solo la edge function (service_role) la toca.

COMMENT ON TABLE public.ag_wa_conversation_alerts IS
  'Control de avisos de conversación nueva al admin. Ver migración 267.';

-- Devuelve true SOLO si a este número le corresponde un aviso ahora. El UPDATE
-- condicionado dentro del ON CONFLICT es lo que hace el reclamo atómico.
CREATE OR REPLACE FUNCTION public.ag_wa_claim_conversation_alert(p_phone text, p_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed text;
BEGIN
  INSERT INTO public.ag_wa_conversation_alerts (wa_phone, role, last_alert_at, alert_count)
  VALUES (p_phone, p_role, now(), 1)
  ON CONFLICT (wa_phone) DO UPDATE
    SET last_alert_at = now(),
        role          = excluded.role,
        alert_count   = public.ag_wa_conversation_alerts.alert_count + 1
    WHERE public.ag_wa_conversation_alerts.last_alert_at < now() - interval '24 hours'
  RETURNING wa_phone INTO v_claimed;

  RETURN v_claimed IS NOT NULL;
END;
$$;

-- ─── Quién es la persona que escribe ────────────────────────────────────────────
-- Todo en una sola consulta para no encadenar viajes a la base dentro del webhook.
--
-- El cruce es por los ÚLTIMOS 10 DÍGITOS: ag_users.phone tiene formatos mixtos (con y
-- sin +57) y ag_wa_message_log.wa_phone llega como Meta lo mande -- comparar en crudo
-- no encuentra a nadie. Ver [[movi_phone_e164_normalization]].
--
-- Cuando WhatsApp no comparte el número real manda un BSUID ("CO.123456789..."), que no
-- tiene 10 dígitos útiles: en ese caso no hay a quién cruzar y se devuelve solo lo que
-- se sepa del chat.
CREATE OR REPLACE FUNCTION public.ag_wa_contact_summary(p_phone text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ult AS (
    SELECT right(regexp_replace(p_phone, '\D', '', 'g'), 10) AS d10
  ),
  u AS (
    SELECT au.id, au.full_name, au.phone, au.city, au.total_trips_as_passenger, au.created_at
    FROM public.ag_users au, ult
    WHERE length(ult.d10) = 10
      AND right(regexp_replace(COALESCE(au.phone, ''), '\D', '', 'g'), 10) = ult.d10
    ORDER BY au.created_at ASC
    LIMIT 1
  ),
  d AS (
    SELECT ad.status, ad.vehicle_type, ad.vehicle_plate
    FROM public.ag_drivers ad JOIN u ON u.id = ad.ag_user_id
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'encontrado',   (SELECT count(*) FROM u) > 0,
    'nombre',       (SELECT full_name FROM u),
    'ciudad',       (SELECT city FROM u),
    'viajes',       COALESCE((SELECT total_trips_as_passenger FROM u), 0),
    'registrado',   (SELECT created_at FROM u),
    'es_conductor', (SELECT count(*) FROM d) > 0,
    'estado',       (SELECT status FROM d),
    'vehiculo',     (SELECT vehicle_type FROM d),
    'placa',        (SELECT vehicle_plate FROM d)
  );
$$;
