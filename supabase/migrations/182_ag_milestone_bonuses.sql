-- =============================================================================
-- Migration 182: Reemplazo de la escala de comisión decreciente por bonos en
-- efectivo por hitos de viajes acumulados (pedido explícito del usuario 2026-08-04)
--
-- Antes: comisión bajaba de 12% a 6% según viajes/mes (se reiniciaba cada mes).
-- Ahora: comisión FIJA en 12% para todos, y en su lugar se premia el volumen con
-- bonos en dinero que se acreditan directo a wallet_balance -- créditos internos
-- que el conductor gasta pagando comisión en viajes futuros, nunca plata real que
-- sale de la empresa (el wallet no puede quedar negativo, ver migración 153).
--
-- Los montos están calibrados para nunca devolver más del ~20% de la comisión ya
-- cobrada en cada tramo de viajes, con tarifa promedio real ($10.050 COP, dato de
-- producción al 2026-08-04) y comisión 12% (~$1.200/viaje):
--   10 viajes  ($ ~10.800 comisión acumulada en el tramo) -> bono $2.000  (~19%)
--   25 viajes  ($ ~18.000 comisión en el tramo)           -> bono $3.500  (~19%)
--   50 viajes  ($ ~30.000 comisión en el tramo)           -> bono $6.000  (~20%)
--   100, 200, 300... (cada 100 desde el hito 100)         -> bono $24.000 (~20% sobre
--     un tramo de 100 viajes, sobre ~$120.000 de comisión -- en el primer hito exacto
--     de 100 el tramo real es más chico -- 50 viajes desde el hito anterior -- así que
--     ahí el bono es proporcionalmente más generoso a propósito, como premio redondo
--     por llegar a 100; en plata es solo $24.000 COP, sin riesgo real para la empresa)
-- =============================================================================

-- ── Comisión fija 12% (se mantiene la firma de la función para no romper el
--    trigger ag_on_offer_accepted que ya la llama) ──────────────────────────
CREATE OR REPLACE FUNCTION public.ag_driver_monthly_commission_pct(p_driver_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT 12;
$$;

-- ── Permitir tipo 'bonus' en el historial de transacciones del wallet ────────
ALTER TABLE public.ag_wallet_transactions DROP CONSTRAINT IF EXISTS ag_wallet_transactions_type_check;
ALTER TABLE public.ag_wallet_transactions ADD CONSTRAINT ag_wallet_transactions_type_check
  CHECK (type IN ('recharge','commission','refund','bonus'));

-- ── Tabla de hitos -- editable sin redeploy de código si se quieren ajustar
--    montos más adelante ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ag_bonus_milestones (
  trips_required integer PRIMARY KEY,
  bonus_amount   integer NOT NULL CHECK (bonus_amount > 0),
  recurring      boolean NOT NULL DEFAULT false, -- true = se repite cada N viajes desde este hito
  created_at     timestamptz DEFAULT now()
);

INSERT INTO public.ag_bonus_milestones (trips_required, bonus_amount, recurring) VALUES
  (10,  2000,  false),
  (25,  3500,  false),
  (50,  6000,  false),
  (100, 24000, true)
ON CONFLICT (trips_required) DO UPDATE
  SET bonus_amount = EXCLUDED.bonus_amount, recurring = EXCLUDED.recurring;

ALTER TABLE public.ag_bonus_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_reads_milestones" ON public.ag_bonus_milestones;
CREATE POLICY "anyone_reads_milestones" ON public.ag_bonus_milestones FOR SELECT USING (true);

-- ── Función: revisa si el conductor acaba de cruzar un hito y le acredita el
--    bono correspondiente. Idempotente por diseño (usa el conteo exacto de
--    viajes en la descripción como llave de "ya pagado", no puede duplicarse
--    aunque se llame más de una vez para el mismo viaje) ────────────────────
CREATE OR REPLACE FUNCTION public.ag_check_and_award_milestone(p_driver_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_trips integer;
  v_bonus       integer;
  v_desc        text;
  v_already     boolean;
BEGIN
  SELECT COALESCE(metric_trips_completed, 0) INTO v_total_trips
  FROM public.ag_drivers WHERE id = p_driver_id;

  -- Hito fijo (10/25/50) que calce exactamente con el total actual
  SELECT bonus_amount INTO v_bonus
  FROM public.ag_bonus_milestones
  WHERE recurring = false AND trips_required = v_total_trips;

  -- Hito recurrente: cualquier múltiplo de 100 desde el hito recurrente base
  IF v_bonus IS NULL THEN
    SELECT bonus_amount INTO v_bonus
    FROM public.ag_bonus_milestones
    WHERE recurring = true
      AND v_total_trips >= trips_required
      AND v_total_trips % trips_required = 0
    LIMIT 1;
  END IF;

  IF v_bonus IS NULL THEN RETURN; END IF;

  v_desc := 'Bono por ' || v_total_trips || ' viajes completados';

  SELECT EXISTS(
    SELECT 1 FROM public.ag_wallet_transactions
    WHERE driver_id = p_driver_id AND type = 'bonus' AND description = v_desc
  ) INTO v_already;

  IF v_already THEN RETURN; END IF;

  UPDATE public.ag_drivers SET wallet_balance = wallet_balance + v_bonus WHERE id = p_driver_id;

  INSERT INTO public.ag_wallet_transactions (driver_id, amount, type, description)
  VALUES (p_driver_id, v_bonus, 'bonus', v_desc);
END;
$$;

-- ── Enganchar el chequeo de hito justo después de sumar el viaje completado ──
CREATE OR REPLACE FUNCTION public.ag_complete_trip(p_trip_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_driver_id uuid;
BEGIN
  UPDATE public.ag_trip_requests
  SET status = 'completed', driver_stage = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_trip_request_id AND status IN ('accepted', 'in_progress')
  RETURNING driver_id INTO v_driver_id;

  IF v_driver_id IS NOT NULL THEN
    INSERT INTO public.ag_driver_metric_events (driver_id, event_type, trip_id)
    VALUES (v_driver_id, 'trip_completed', p_trip_request_id)
    ON CONFLICT DO NOTHING;

    UPDATE public.ag_drivers
    SET metric_trips_completed = COALESCE(metric_trips_completed, 0) + 1
    WHERE id = v_driver_id;

    PERFORM public.ag_check_and_award_milestone(v_driver_id);
  END IF;
END;
$$;

-- ── RPC de beneficios: reemplaza la info de tiers por la de hitos/bonos ──────
DROP FUNCTION IF EXISTS public.ag_get_driver_benefits(uuid);
CREATE OR REPLACE FUNCTION public.ag_get_driver_benefits(p_driver_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_monthly_trips    INT;
  v_total_trips      INT;
  v_is_founder       BOOLEAN;
  v_founder_number   INT;
  v_next_milestone   INT;
  v_next_bonus       INT;
  v_lifetime_bonus   INT;
  v_recurring_step   INT;
  v_recurring_amount INT;
BEGIN
  SELECT COUNT(*) INTO v_monthly_trips
  FROM public.ag_trip_requests
  WHERE driver_id = p_driver_id
    AND status = 'completed'
    AND completed_at >= date_trunc('month', now());

  SELECT COALESCE(metric_trips_completed, 0), COALESCE(is_founder, false), founder_number
  INTO v_total_trips, v_is_founder, v_founder_number
  FROM public.ag_drivers WHERE id = p_driver_id;

  -- Próximo hito fijo (10/25/50) que todavía no se alcanza
  SELECT trips_required, bonus_amount INTO v_next_milestone, v_next_bonus
  FROM public.ag_bonus_milestones
  WHERE recurring = false AND trips_required > v_total_trips
  ORDER BY trips_required ASC
  LIMIT 1;

  -- Si ya no quedan hitos fijos, calcular el siguiente múltiplo del hito recurrente
  -- BUG REAL 2026-08-04 (detectado al probar contra datos reales antes de dar por bueno el
  -- deploy): la versión anterior envolvía v_total_trips en GREATEST(v_total_trips,
  -- v_recurring_step), lo que hacía que un conductor con, por ejemplo, 83 viajes (por debajo
  -- del hito recurrente base de 100) calculara el "próximo hito" como 200 en vez de 100 --
  -- porque GREATEST(83,100)=100 y FLOOR(100/100)+1=2. Se quita el GREATEST: la fórmula sin
  -- eso ya calcula bien tanto el caso "todavía no llega a 100" como "ya pasó un múltiplo
  -- exacto" (ej. exactamente en 100 -> siguiente 200), sin necesitar el caso especial extra.
  IF v_next_milestone IS NULL THEN
    SELECT trips_required, bonus_amount INTO v_recurring_step, v_recurring_amount
    FROM public.ag_bonus_milestones WHERE recurring = true LIMIT 1;

    IF v_recurring_step IS NOT NULL THEN
      v_next_milestone := (FLOOR(v_total_trips::numeric / v_recurring_step) + 1) * v_recurring_step;
      v_next_bonus := v_recurring_amount;
    END IF;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_lifetime_bonus
  FROM public.ag_wallet_transactions
  WHERE driver_id = p_driver_id AND type = 'bonus';

  RETURN jsonb_build_object(
    'monthly_trips',        v_monthly_trips,
    'total_trips',          v_total_trips,
    'commission_pct',       12,
    'next_milestone_trips', v_next_milestone,
    'next_milestone_bonus', v_next_bonus,
    'lifetime_bonus_earned', v_lifetime_bonus,
    'is_founder',            v_is_founder,
    'founder_number',        v_founder_number,
    'founders_left',         GREATEST(0, 500 - (SELECT COUNT(*) FROM public.ag_drivers WHERE is_founder = true))
  );
END;
$$;
