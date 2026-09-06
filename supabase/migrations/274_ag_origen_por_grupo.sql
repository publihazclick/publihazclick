-- Migración 274: saber de qué grupo de Facebook llega cada persona (2026-09-05).
--
-- POR QUÉ
-- El usuario preguntó por qué las publicaciones no rinden. Se intentó responder cruzando
-- fechas de publicación con fechas de registro, y **se llegó a una conclusión equivocada**
-- (se dijo que el mal día del 2 de septiembre fue por repetir grupos; los datos mostraron
-- justo lo contrario: fue el día con MENOS repetición, 7%, y el peor resultado). Toda esa
-- lectura era inferencia por coincidencia de fechas, no medición.
--
-- Esto lo reemplaza por un dato real: cada publicación lleva un código de grupo en el link
-- de WhatsApp, y ese código queda registrado cuando la persona escribe.
--
-- CÓMO FUNCIONA
-- El post lleva `wa.me/573166302106?text=Hola%2C%20quiero%20un%20viaje%20%23g7`. Al tocarlo,
-- WhatsApp abre el chat con "Hola, quiero un viaje #g7" ya escrito. El bot le quita el `#g7`
-- ANTES de procesar el mensaje (para que el flujo normal no vea nada raro) y lo guarda acá.
--
-- Solo cuenta el PRIMER código de cada teléfono: interesa de dónde llegó la persona la
-- primera vez, no por cuál link volvió a entrar después.

CREATE TABLE IF NOT EXISTS public.ag_origen_contacto (
  wa_phone   text PRIMARY KEY,
  codigo     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ag_origen_codigo ON public.ag_origen_contacto (codigo);

ALTER TABLE public.ag_origen_contacto ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo la edge function (service_role) escribe, y el panel admin lee por RPC.

COMMENT ON TABLE public.ag_origen_contacto IS
  'De qué publicación/grupo llegó cada teléfono que escribió por WhatsApp. Ver migración 274.';

-- Registra el origen solo si ese teléfono no tenía uno. `ON CONFLICT DO NOTHING` es
-- justamente lo que hace que gane el primero.
CREATE OR REPLACE FUNCTION public.ag_registrar_origen(p_phone text, p_codigo text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.ag_origen_contacto (wa_phone, codigo)
  VALUES (p_phone, lower(p_codigo))
  ON CONFLICT (wa_phone) DO NOTHING;
$$;

-- ─── El informe: qué trae cada grupo ────────────────────────────────────────────
-- No cuenta solo contactos: cuenta cuántos pidieron un viaje y cuántos lo completaron.
-- Un grupo que trae 20 curiosos que nunca piden vale menos que uno que trae 3 que viajan.
CREATE OR REPLACE FUNCTION public.ag_origen_reporte()
RETURNS TABLE(
  codigo      text,
  contactos   bigint,
  pidieron    bigint,
  completaron bigint,
  primer_dia  date,
  ultimo_dia  date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.codigo,
    count(*)                                                            AS contactos,
    count(*) FILTER (WHERE t.pidio > 0)                                 AS pidieron,
    count(*) FILTER (WHERE t.completo > 0)                              AS completaron,
    min(o.created_at)::date                                             AS primer_dia,
    max(o.created_at)::date                                             AS ultimo_dia
  FROM public.ag_origen_contacto o
  LEFT JOIN LATERAL (
    SELECT
      count(*)                                        AS pidio,
      count(*) FILTER (WHERE tr.status = 'completed') AS completo
    FROM public.ag_trip_requests tr
    WHERE right(regexp_replace(COALESCE(tr.wa_phone, ''), '\D', '', 'g'), 10)
        = right(regexp_replace(o.wa_phone, '\D', '', 'g'), 10)
  ) t ON true
  GROUP BY o.codigo
  ORDER BY completaron DESC, pidieron DESC, contactos DESC;
$$;
