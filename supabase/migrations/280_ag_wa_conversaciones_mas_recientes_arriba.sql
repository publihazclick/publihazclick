-- Migración 280: la bandeja de soporte del panel admin debe mostrar arriba las
-- conversaciones más recientes (2026-09-07).
--
-- EL BUG
-- `ag_wa_conversations_summary` usa `SELECT DISTINCT ON (wa_phone)` para quedarse con
-- el último mensaje de cada persona. Postgres EXIGE que el ORDER BY de un DISTINCT ON
-- empiece por la misma expresión del DISTINCT -- por eso decía `ORDER BY wa_phone,
-- created_at DESC`. Ese ORDER BY solo sirve para elegir CUÁL fila sobrevive por
-- teléfono; el resultado final quedaba ordenado **por número de teléfono**, no por
-- fecha. Nunca se reordenó después.
--
-- Lo que veía el usuario (medido en producción el 2026-09-07):
--   Conductores → la conversación de ese mismo día (14:38) salía en la posición 5,
--                 enterrada entre uina del 28 y otra del 29 de agosto.
--   Pasajeros   → otra de ese mismo día (14:38) salía en la posición 12 de 24.
-- Es decir: los mensajes nuevos SÍ llegaban y SÍ se guardaban, pero aparecían
-- salpicados en mitad de una lista ordenada por número. Desde el panel se veía
-- exactamente igual que si no hubiera cargado nada nuevo.
--
-- EL ARREGLO
-- Se envuelve el DISTINCT ON en una subconsulta y se reordena por fecha descendente
-- afuera. El DISTINCT ON conserva su ORDER BY obligatorio adentro (sigue eligiendo el
-- último mensaje de cada persona) y el orden que ve el panel ya es por recencia.
--
-- No cambia el tipo de retorno, pero se mantiene DROP + CREATE por consistencia con la
-- migración 266, que sí lo cambió.

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
  SELECT
    u.wa_phone, u.last_body, u.last_dir, u.last_type,
    u.last_at, u.msg_count, u.last_in_at
  FROM (
    SELECT DISTINCT ON (l.wa_phone)
      l.wa_phone                AS wa_phone,
      l.body                    AS last_body,
      l.direction               AS last_dir,
      l.msg_type                AS last_type,
      l.created_at              AS last_at,
      COUNT(*)  OVER (PARTITION BY l.wa_phone) AS msg_count,
      -- Último entrante de esa misma persona: es lo que abre la ventana de 24h.
      MAX(l.created_at) FILTER (WHERE l.direction = 'in')
        OVER (PARTITION BY l.wa_phone)         AS last_in_at
    FROM ag_wa_message_log l
    WHERE l.role = p_role
    -- Obligatorio para el DISTINCT ON: decide QUÉ fila sobrevive por teléfono
    -- (la más nueva). NO es el orden que ve el panel -- ese lo pone el ORDER BY
    -- de abajo, y esa distinción es justamente lo que faltaba.
    ORDER BY l.wa_phone, l.created_at DESC
  ) u
  ORDER BY u.last_at DESC;
$function$;
