-- Migración 266: la bandeja de WhatsApp del panel admin necesita saber si puede
-- responder (2026-09-05).
--
-- POR QUÉ
-- El usuario pidió poder contestarle a conductores y pasajeros desde el panel admin.
-- WhatsApp solo permite mandar texto libre dentro de las 24 horas siguientes al último
-- mensaje que ESA persona nos escribió; pasada esa ventana, Meta responde 200 OK y
-- descarta el mensaje en silencio. Es exactamente el bug que dejó a 6 conductores
-- esperando a un asesor (ver migración del mismo día en ag-whatsapp): si el panel no
-- muestra el estado de la ventana, el admin creería que respondió y la persona nunca
-- recibiría nada.
--
-- Se agrega `last_in_at` (último mensaje ENTRANTE) para que el panel pueda pintar el
-- semáforo y bloquear la caja de texto cuando no se puede escribir.
--
-- Hay que DROP + CREATE, no CREATE OR REPLACE: cambia el tipo de retorno.

DROP FUNCTION IF EXISTS public.ag_wa_conversations_summary(text);

CREATE FUNCTION public.ag_wa_conversations_summary(p_role text)
RETURNS TABLE(
  wa_phone   text,
  last_body  text,
  last_dir   text,
  last_type  text,
  last_at    timestamptz,
  msg_count  bigint,
  last_in_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (wa_phone)
    wa_phone, body, direction, msg_type, created_at,
    COUNT(*) OVER (PARTITION BY wa_phone),
    -- Último entrante de esa misma persona: es lo que abre la ventana de 24h.
    MAX(created_at) FILTER (WHERE direction = 'in') OVER (PARTITION BY wa_phone)
  FROM ag_wa_message_log
  WHERE role = p_role
  ORDER BY wa_phone, created_at DESC;
$function$;
