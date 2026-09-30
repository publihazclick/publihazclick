-- ============================================================================
-- Migración 289: el embudo contaba como "registrados" a gente que ya tenía cuenta
-- antes de ser lead (2026-09-30).
--
-- ── EL PROBLEMA ────────────────────────────────────────────────────────────
-- `ag_leads_marcar_registrados()` marca como registrado a todo lead que aparezca en
-- `ag_users`, sin mirar CUÁNDO se creó esa cuenta. Varios de los que escriben al
-- número de conductores por el anuncio ya tenían cuenta de pasajero desde antes, así
-- que entraban al embudo marcados como conversión el mismo día que llegaron.
--
-- Se ve clarísimo en la propia vista: `hasta_registro_min` dio **-666,5 minutos** --
-- un tiempo NEGATIVO hasta el registro, o sea que "se registraron" 11 horas ANTES de
-- ser leads. Eso no es una conversión, es una cuenta vieja.
--
-- Importa porque este número es el que va a decidir si la pauta de Facebook vale la
-- pena: inflado, haría ver rentable algo que no lo es, y el error crecería justo
-- cuando más gente entre.
--
-- ── EL ARREGLO ─────────────────────────────────────────────────────────────
-- Se sigue guardando el vínculo con la cuenta (sirve para saber a quién ya conocemos
-- y para no insistirle), pero el embudo separa las dos cosas:
--   `ya_tenian_cuenta` -> llegaron con cuenta previa. No son conversión.
--   `registrados`      -> se registraron DESPUÉS de entrar al embudo. Esta es la cifra
--                         que cuenta, y la única que se usa para el costo por conductor.
-- ============================================================================

DROP VIEW IF EXISTS public.ag_driver_leads_embudo_v;

CREATE VIEW public.ag_driver_leads_embudo_v AS
  SELECT
    (created_at AT TIME ZONE 'America/Bogota')::date          AS dia,
    COUNT(*)                                                  AS leads,
    COUNT(*) FILTER (WHERE origen = 'pauta')                  AS de_pauta,
    COUNT(*) FILTER (WHERE nombre_dado IS NOT NULL)           AS dieron_nombre,
    COUNT(*) FILTER (WHERE vehiculo = 'moto')                 AS motos,
    COUNT(*) FILTER (WHERE vehiculo = 'carro')                AS carros,
    COUNT(*) FILTER (WHERE vehiculo = 'ninguno')              AS sin_vehiculo,
    COUNT(*) FILTER (WHERE modelo_ok = FALSE)                 AS modelo_no_sirve,
    COUNT(*) FILTER (WHERE paso NOT IN ('nombre','saludado')) AS avanzaron,
    COUNT(*) FILTER (WHERE paso IN ('pitch','descargo','registrado')) AS llegaron_al_link,
    -- Cuenta creada ANTES de entrar al embudo: no es mérito de la pauta.
    COUNT(*) FILTER (WHERE registrado_at IS NOT NULL
                       AND registrado_at <= created_at)       AS ya_tenian_cuenta,
    -- La única cifra que de verdad es conversión.
    COUNT(*) FILTER (WHERE registrado_at IS NOT NULL
                       AND registrado_at > created_at)        AS registrados,
    COUNT(*) FILTER (WHERE primer_viaje_at IS NOT NULL
                       AND primer_viaje_at > created_at)      AS con_primer_viaje,
    COUNT(*) FILTER (WHERE paso = 'humano')                   AS pidieron_humano,
    -- Mediana de minutos hasta registrarse, solo sobre los que sí convirtieron.
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY CASE WHEN registrado_at > created_at
                    THEN EXTRACT(EPOCH FROM (registrado_at - created_at)) / 60 END
    )::numeric, 1)                                            AS hasta_registro_min
  FROM public.ag_driver_leads
  GROUP BY 1
  ORDER BY 1 DESC;

COMMENT ON VIEW public.ag_driver_leads_embudo_v IS
  'Embudo diario de captacion de conductores. registrados = se registraron DESPUES de entrar al embudo (conversion real); ya_tenian_cuenta = llegaron con cuenta previa. Migracion 289.';

GRANT SELECT ON public.ag_driver_leads_embudo_v TO service_role;
