-- =============================================================================
-- Migration 087: Congelar categoría del referidor por invitado
--
-- Regla: la recompensa por recompra de un invitado es SIEMPRE la misma
-- que se le dio al referidor cuando consiguió a ese invitado.
-- La categoría se congela en la primera compra de cada invitado.
-- =============================================================================

-- 1. Agregar columna para guardar el conteo de refs activos congelado
ALTER TABLE referral_mega_grants ADD COLUMN IF NOT EXISTS frozen_active_refs INT;

-- 2. Reescribir grant_referral_mega_rewards con lógica de categoría congelada
CREATE OR REPLACE FUNCTION grant_referral_mega_rewards(
  p_buyer_id   UUID,
  p_payment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_referrer_id     UUID;
  v_buyer_created   TIMESTAMPTZ;
  v_referrer_active BOOLEAN;
  v_active_refs     INT;
  v_frozen_refs     INT;
  v_rewards         JSONB;
  v_item            JSONB;
  v_total_granted   INT := 0;
  v_is_first        BOOLEAN;
  V2_CUTOFF CONSTANT TIMESTAMPTZ := '2026-04-10T00:00:00-05:00';
BEGIN
  -- 1. Obtener referidor del comprador
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = p_buyer_id;
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_referrer');
  END IF;

  -- 2. Verificar que el comprador es un referido NUEVO (v2)
  SELECT created_at INTO v_buyer_created FROM profiles WHERE id = p_buyer_id;
  IF v_buyer_created < V2_CUTOFF THEN
    RETURN jsonb_build_object('success', false, 'reason', 'old_referral_v1_system');
  END IF;

  -- 3. Verificar que el referidor tiene paquete activo
  SELECT has_active_package INTO v_referrer_active FROM profiles WHERE id = v_referrer_id;
  IF NOT COALESCE(v_referrer_active, false) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'referrer_no_active_package');
  END IF;

  -- 4. Verificar si ya hubo un grant anterior para este par referidor+invitado
  SELECT frozen_active_refs INTO v_frozen_refs
  FROM referral_mega_grants
  WHERE referrer_id = v_referrer_id AND referred_id = p_buyer_id
    AND frozen_active_refs IS NOT NULL
  ORDER BY granted_at ASC
  LIMIT 1;

  v_is_first := (v_frozen_refs IS NULL);

  IF v_is_first THEN
    -- PRIMERA COMPRA: contar refs activos EXCLUYENDO al comprador actual
    -- (porque ya fue activado antes de llegar aquí)
    SELECT COUNT(*)::INT INTO v_active_refs
    FROM profiles
    WHERE referred_by = v_referrer_id
      AND has_active_package = true
      AND id != p_buyer_id;

    v_frozen_refs := v_active_refs;
  END IF;
  -- En recompra: v_frozen_refs ya tiene el valor congelado de la primera vez

  -- 5. Obtener recompensas según la categoría congelada
  v_rewards := get_referral_v2_rewards(v_frozen_refs);

  -- 6. Insertar los grants con el conteo congelado
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_rewards)
  LOOP
    INSERT INTO referral_mega_grants (
      referrer_id, referred_id, payment_id,
      ad_type, quantity, remaining, reward_per_ad,
      frozen_active_refs,
      granted_at, expires_at
    ) VALUES (
      v_referrer_id, p_buyer_id, p_payment_id,
      v_item->>'ad_type',
      (v_item->>'quantity')::INT,
      (v_item->>'quantity')::INT,
      (v_item->>'reward')::NUMERIC,
      v_frozen_refs,
      NOW(),
      NOW() + INTERVAL '30 days'
    );
    v_total_granted := v_total_granted + (v_item->>'quantity')::INT;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'referrer_id', v_referrer_id,
    'frozen_refs', v_frozen_refs,
    'is_first_purchase', v_is_first,
    'total_ads_granted', v_total_granted,
    'rewards', v_rewards
  );
END;
$$;
