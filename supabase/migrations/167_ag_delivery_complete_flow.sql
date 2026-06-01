-- ===================================================================
-- 167_ag_delivery_complete_flow.sql
-- Fix flujo completo de domicilios:
-- 1. Unique constraint → upsert de ofertas funciona
-- 2. Vista con info del conductor para el pasajero
-- 3. RPC wallet credit al completar domicilio
-- ===================================================================

-- ── 1. Unique constraint (el upsert falla sin esto) ─────────────────
ALTER TABLE ag_delivery_offers
  DROP CONSTRAINT IF EXISTS ag_delivery_offers_req_driver_unique;
ALTER TABLE ag_delivery_offers
  ADD CONSTRAINT ag_delivery_offers_req_driver_unique
  UNIQUE (delivery_request_id, driver_id);

-- ── 2. Vista ag_delivery_offers_v con datos del conductor ────────────
CREATE OR REPLACE VIEW ag_delivery_offers_v AS
SELECT
  o.id,
  o.delivery_request_id,
  o.driver_id,
  o.offered_price,
  o.status,
  o.created_at,
  d.rating         AS driver_rating,
  d.total_trips    AS driver_trips,
  d.vehicle_type   AS driver_vehicle,
  u.full_name      AS driver_name,
  u.avatar_url     AS driver_avatar
FROM ag_delivery_offers o
JOIN ag_drivers d ON d.id = o.driver_id
JOIN ag_users   u ON u.id = d.ag_user_id;

GRANT SELECT ON ag_delivery_offers_v TO authenticated, anon;

-- ── 3. RPC — acreditar ganancias al conductor al entregar domicilio ───
CREATE OR REPLACE FUNCTION ag_complete_delivery_earnings(p_delivery_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_del  ag_delivery_requests%ROWTYPE;
  v_comm INT;
  v_net  INT;
BEGIN
  SELECT * INTO v_del FROM ag_delivery_requests WHERE id = p_delivery_id;
  IF NOT FOUND OR v_del.driver_id IS NULL THEN RETURN; END IF;

  v_comm := ROUND(v_del.offered_price * 0.12);   -- 12% comisión plataforma
  v_net  := v_del.offered_price - v_comm;

  UPDATE ag_drivers
    SET wallet_balance = wallet_balance + v_net
  WHERE id = v_del.driver_id;

  INSERT INTO ag_wallet_transactions (driver_id, amount, type, description)
  VALUES (
    v_del.driver_id,
    v_net,
    'recharge',
    'Domicilio entregado — ' || COALESCE(v_del.package_description, 'Paquete')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ag_complete_delivery_earnings(UUID) TO authenticated;
