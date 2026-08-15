-- ═══════════════════════════════════════════════════════════════════════════
-- 226: CIUDAD A CIUDAD — Paridad con InDrive / módulo urbano (Anda y Gana)
-- ═══════════════════════════════════════════════════════════════════════════
-- Pedido explícito del usuario 2026-08-15: cerrar las brechas encontradas al
-- comparar el módulo Ciudad a Ciudad (creado 2026-06-03, migraciones 172-174,
-- nunca vuelto a tocar) contra el módulo urbano y contra cómo opera InDrive.
--
-- REGLA DURA DE ESTA MIGRACIÓN: no se modifica ni un solo objeto cuyo dueño
-- sea el flujo urbano/otros servicios (ag_on_offer_accepted, ag_complete_trip,
-- ag_driver_monthly_commission_pct, ag_log_trip_location, ag_trip_locations,
-- ag_check_and_award_milestone, etc.). Esos se REUTILIZAN por lectura/llamada
-- (misma wallet, mismo % de comisión, mismo contador de viajes del conductor)
-- pero sus definiciones quedan intactas. Los únicos objetos ag_/compartidos
-- que se tocan son con ALTER TABLE ADD COLUMN IF NOT EXISTS de una columna
-- NUEVA y NULLABLE (ag_sos_events.cc_request_id, ag_referral_transactions.
-- cc_request_id) -- aditivo puro, cero cambio de comportamiento para las filas
-- y consultas existentes de esas tablas.
--
-- Brechas que esto cierra (ver informe de comparación entregado al usuario):
--   1. Cero comisión/ingreso para la plataforma en viajes completados
--   2. Cero comisión de referidos (2%) en viajes Ciudad a Ciudad
--   3. Cero verificación de integridad GPS (viaje "completado" sin validar)
--   4. Botón SOS débil (solo WhatsApp, sin notificación real ni registro)
--   5. Cero visibilidad para el admin (se resuelve en el panel, no aquí)
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. Columnas nuevas en cc_requests: desglose financiero + integridad GPS
--    (mismos nombres/semántica que ag_trip_requests para quedar consistente)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE cc_requests
  ADD COLUMN IF NOT EXISTS commission_pct         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_amount      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_net             integer,
  ADD COLUMN IF NOT EXISTS gps_integrity_checked  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_integrity_flagged  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_integrity_detail   jsonb;

CREATE INDEX IF NOT EXISTS cc_requests_gps_flagged_idx
  ON cc_requests (gps_integrity_flagged) WHERE gps_integrity_flagged = true;

-- La RLS original de cc_requests (migración 172) solo deja ver un viaje al
-- pasajero, al conductor asignado, o a cualquiera mientras está 'searching'/
-- 'negotiating' -- el panel admin (que se conecta con la MISMA anon key, ver
-- anda-gana.service.ts) NO podía ver viajes ajenos ya aceptados/completados/
-- cancelados. Esto es lo que cerraba la brecha de "cero visibilidad admin".
--
-- IMPORTANTE -- verificado contra la base viva antes de escribir esto: la
-- tabla `profiles` (de donde ag_sos_events/ag_withdrawals/ag_coupons leen
-- `role IN ('admin','dev')` en sus propias migraciones) NO EXISTE en este
-- proyecto Supabase (hndhgtnjyjwrnzdcgcca, separado de Publihazclick desde
-- 2026-07-05). Por eso esas mismas políticas "admin" hoy corren en vivo como
-- `USING (true)` -- alguien ya las simplificó después de la separación
-- porque referenciar `profiles` ahí directamente rompería con error, no con
-- "false". No hay ninguna función/tabla de rol dentro de esta base (se buscó
-- ag_current_user_id/ag_current_driver_id y tablas *admin*, no hay
-- equivalente). El control de "quién llega al panel admin" vive en la app
-- (adminGuard de Angular, contra el proyecto Supabase de Publihazclick, no
-- este). Así que para quedar CONSISTENTE con cómo ya funciona hoy el resto
-- de políticas "admin" de esta misma base -- no una regla nueva/distinta --
-- esta política también usa `true`.
DROP POLICY IF EXISTS cc_req_admin_read ON cc_requests;
CREATE POLICY cc_req_admin_read ON cc_requests FOR SELECT USING (true);


-- ─────────────────────────────────────────────────────────────────────────
-- 2. cc_accept_offer — se reescribe para cobrar comisión real al aceptar,
--    igual que ag_on_offer_accepted (migración 153, versión viva). Reusa la
--    MISMA billetera del conductor (ag_drivers.wallet_balance) y el MISMO
--    % por nivel mensual (ag_driver_monthly_commission_pct) -- un conductor
--    tiene una sola billetera y un solo nivel de comisión, sea viaje urbano
--    o intercity. Primera carrera del conductor (contando ambos tipos) sigue
--    gratis, igual que en urbano.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cc_accept_offer(p_offer_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_offer            cc_offers%ROWTYPE;
  v_req              cc_requests%ROWTYPE;
  v_driver_ag_id     uuid;
  v_wallet_balance   integer := 0;
  v_completed_trips  integer := 0;
  v_commission_pct   integer := 0;
  v_commission_amt   integer := 0;
BEGIN
  SELECT * INTO v_offer FROM cc_offers WHERE id = p_offer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no encontrada'; END IF;
  SELECT * INTO v_req FROM cc_requests WHERE id = v_offer.request_id;
  IF v_req.user_id <> auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  -- Idempotencia (necesaria ahora que esto mueve plata real): si dos llamadas
  -- llegan a la vez o el frontend reintenta, sin esta guarda se cobraría la
  -- comisión dos veces. UPDATE...WHERE status='pending' solo puede tener
  -- éxito UNA vez -- la segunda llamada cae al NOT FOUND y sale sin tocar
  -- nada más. El original (migración 172) no lo necesitaba porque no movía
  -- dinero; ahora sí.
  UPDATE cc_offers SET status = 'accepted' WHERE id = p_offer_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta oferta ya no está disponible (ya fue aceptada, rechazada o expiró)';
  END IF;

  -- Segunda guarda al nivel de la SOLICITUD: si dos conductores llegaran a
  -- tener sus ofertas aceptadas casi al mismo tiempo (dos llamadas para
  -- ofertas DISTINTAS del mismo viaje), esto asegura que solo la primera en
  -- llegar deje la solicitud en 'accepted'; la segunda revierte TODA la
  -- función (incluido el UPDATE de arriba, por ser la misma transacción).
  UPDATE cc_requests SET
    status             = 'accepted',
    driver_id          = v_offer.driver_id,
    accepted_price      = v_offer.offered_price,
    accepted_offer_id   = p_offer_id
  WHERE id = v_offer.request_id AND status IN ('searching','negotiating');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este viaje ya tiene otro conductor asignado';
  END IF;

  UPDATE cc_offers SET status = 'rejected'
  WHERE request_id = v_offer.request_id AND id <> p_offer_id AND status = 'pending';

  -- Resolver la fila ag_drivers del conductor (cc_offers.driver_id es el auth
  -- uid directo, no el id de ag_drivers -- mismo conductor, misma cuenta).
  SELECT d.id, COALESCE(d.wallet_balance, 0), COALESCE(d.metric_trips_completed, 0)
  INTO v_driver_ag_id, v_wallet_balance, v_completed_trips
  FROM ag_drivers d
  JOIN ag_users u ON u.id = d.ag_user_id
  WHERE u.auth_user_id = v_offer.driver_id;

  IF v_driver_ag_id IS NOT NULL THEN
    IF v_completed_trips >= 1 THEN
      v_commission_pct := public.ag_driver_monthly_commission_pct(v_driver_ag_id);
    END IF;
    v_commission_amt := CEIL(v_offer.offered_price::numeric * v_commission_pct / 100.0)::integer;

    IF v_commission_amt > 0 AND v_wallet_balance < v_commission_amt THEN
      RAISE EXCEPTION 'SALDO_INSUFICIENTE — Necesita $% pero tiene $%', v_commission_amt, v_wallet_balance;
    END IF;
  END IF;

  UPDATE cc_requests SET
    commission_pct    = v_commission_pct,
    commission_amount = v_commission_amt,
    driver_net        = v_offer.offered_price - v_commission_amt
  WHERE id = v_offer.request_id;

  IF v_driver_ag_id IS NOT NULL AND v_commission_amt > 0 THEN
    UPDATE ag_drivers SET wallet_balance = wallet_balance - v_commission_amt WHERE id = v_driver_ag_id;

    -- trip_offer_id se deja NULL a propósito: esa columna referencia
    -- ag_trip_offers (viajes urbanos), no cc_offers -- se identifica el
    -- viaje intercity por texto en la descripción en vez de tocar el
    -- esquema de ag_wallet_transactions.
    INSERT INTO ag_wallet_transactions (driver_id, amount, type, trip_offer_id, description)
    VALUES (
      v_driver_ag_id, -v_commission_amt, 'commission', NULL,
      'Comisión ' || v_commission_pct || '% — viaje Ciudad a Ciudad ' || v_req.origin_city || ' → ' || v_req.dest_city || ' $' || v_offer.offered_price || ' (cc:' || v_offer.request_id || ')'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'driver_id', v_offer.driver_id, 'price', v_offer.offered_price,
    'commission_pct', v_commission_pct, 'commission_amount', v_commission_amt
  );
END; $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 3. Recorrido GPS del viaje Ciudad a Ciudad -- mismo patrón que
--    ag_trip_locations / ag_log_trip_location / ag_get_trip_gps_correlation
--    (migración 189), pero en tabla propia cc_trip_locations para no tocar
--    la tabla urbana en absoluto.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_trip_locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES cc_requests(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('driver','passenger')),
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cc_trip_locations_req_idx ON cc_trip_locations(request_id, role, recorded_at);

ALTER TABLE cc_trip_locations ENABLE ROW LEVEL SECURITY;

-- Igual que la urbana: sin política de escritura directa, todo pasa por el
-- RPC de abajo (SECURITY DEFINER) que valida quién es quién.
DROP POLICY IF EXISTS cc_trip_loc_read ON cc_trip_locations;
CREATE POLICY cc_trip_loc_read ON cc_trip_locations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM cc_requests r WHERE r.id = request_id
    AND (r.user_id = auth.uid() OR r.driver_id = auth.uid())
  )
);

CREATE OR REPLACE FUNCTION cc_log_trip_location(
  p_request_id UUID, p_role TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_req cc_requests%ROWTYPE; v_authorized boolean := false;
BEGIN
  IF p_role NOT IN ('driver','passenger') OR p_lat IS NULL OR p_lng IS NULL THEN RETURN; END IF;

  SELECT * INTO v_req FROM cc_requests
  WHERE id = p_request_id AND status IN ('accepted','in_progress');
  IF v_req IS NULL THEN RETURN; END IF;

  IF p_role = 'driver' THEN
    v_authorized := (v_req.driver_id = auth.uid());
  ELSE
    v_authorized := (v_req.user_id = auth.uid());
  END IF;
  IF NOT v_authorized THEN RETURN; END IF;

  INSERT INTO cc_trip_locations (request_id, role, lat, lng) VALUES (p_request_id, p_role, p_lat, p_lng);
END; $$;

CREATE OR REPLACE FUNCTION cc_get_trip_gps_correlation(p_request_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_avg_km numeric; v_max_km numeric; v_pairs integer;
BEGIN
  WITH driver_pts AS (
    SELECT lat, lng, recorded_at FROM cc_trip_locations WHERE request_id = p_request_id AND role = 'driver'
  ),
  matched AS (
    SELECT
      111.045 * SQRT(POWER(dp.lat - closest.lat, 2) + POWER((dp.lng - closest.lng) * COS(RADIANS(dp.lat)), 2)) AS dist_km
    FROM driver_pts dp
    CROSS JOIN LATERAL (
      SELECT pp.lat, pp.lng FROM cc_trip_locations pp
      WHERE pp.request_id = p_request_id AND pp.role = 'passenger'
      ORDER BY ABS(EXTRACT(EPOCH FROM (pp.recorded_at - dp.recorded_at))) LIMIT 1
    ) closest
  )
  SELECT AVG(dist_km), MAX(dist_km), COUNT(*) INTO v_avg_km, v_max_km, v_pairs FROM matched;

  RETURN jsonb_build_object(
    'avg_km', ROUND(COALESCE(v_avg_km, 0)::numeric, 3),
    'max_km', ROUND(COALESCE(v_max_km, 0)::numeric, 3),
    'sample_points', COALESCE(v_pairs, 0)
  );
END; $$;

-- Umbral 2km (no 300m como en urbano) -- un viaje intercity real cruza zonas
-- rurales/carretera donde el GPS del pasajero puede rezagarse del conductor
-- más que dentro de una ciudad; 300m marcaría como sospechoso casi cualquier
-- viaje real en carretera. Mismo criterio de "al menos 3 puntos" antes de
-- decidir, para no marcar en falso por poca señal.
CREATE OR REPLACE FUNCTION cc_check_trip_gps_integrity(p_request_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_correlation jsonb; v_avg_km numeric; v_samples integer; v_flagged boolean := false; v_reason text;
BEGIN
  v_correlation := cc_get_trip_gps_correlation(p_request_id);
  v_avg_km  := (v_correlation->>'avg_km')::numeric;
  v_samples := (v_correlation->>'sample_points')::integer;

  IF v_samples >= 3 AND v_avg_km > 2 THEN
    v_flagged := true;
    v_reason := 'Separación GPS promedio de ' || v_avg_km || ' km entre conductor y pasajero durante el viaje (' || v_samples || ' puntos comparados)';
  END IF;

  UPDATE cc_requests SET
    gps_integrity_checked = true,
    gps_integrity_flagged = v_flagged,
    gps_integrity_detail  = v_correlation || jsonb_build_object('reason', v_reason)
  WHERE id = p_request_id;
END; $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 4. Comisión de referidos (2%) en cc_complete_trip -- mismo mecanismo que
--    ag_complete_trip (migración 190, versión viva): reusa ag_referral_wallet
--    / ag_referral_transactions, que ya son genéricas (no exclusivas de
--    viajes urbanos). Se agrega una columna NUEVA y NULLABLE cc_request_id
--    para poder registrar la transacción sin tocar la columna trip_request_id
--    existente (esa sigue referenciando solo ag_trip_requests, intacta).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE ag_referral_transactions
  ADD COLUMN IF NOT EXISTS cc_request_id uuid REFERENCES cc_requests(id);

CREATE OR REPLACE FUNCTION cc_complete_trip(p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req                cc_requests%ROWTYPE;
  v_driver_ag_id        uuid;
  v_passenger           record;
  v_driver_user         record;
  v_pass_referrer_id    uuid;
  v_driver_referrer_id  uuid;
  v_ref_commission      integer;
  v_wallet_id           uuid;
  v_trip_value          integer;
BEGIN
  SELECT * INTO v_req FROM cc_requests WHERE id = p_request_id;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Viaje no encontrado'; END IF;
  IF v_req.user_id <> auth.uid() AND v_req.driver_id <> auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Idempotencia (igual razón que en cc_accept_offer): esto ahora paga
  -- comisión de referidos con plata real. UPDATE...WHERE status IN (...)
  -- solo puede tener éxito una vez -- una segunda llamada (reintento del
  -- frontend, doble tap, etc.) cae al NOT FOUND y no vuelve a pagar nada.
  UPDATE cc_requests SET status = 'completed', completed_at = now()
  WHERE id = p_request_id AND status IN ('accepted','in_progress');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'price', v_req.accepted_price, 'already_completed', true);
  END IF;

  -- Contador de viajes completados del conductor (compartido con urbano --
  -- un solo conductor, un solo nivel de comisión/hitos) + hitos.
  SELECT d.id INTO v_driver_ag_id
  FROM ag_drivers d JOIN ag_users u ON u.id = d.ag_user_id
  WHERE u.auth_user_id = v_req.driver_id;

  IF v_driver_ag_id IS NOT NULL THEN
    UPDATE ag_drivers SET metric_trips_completed = COALESCE(metric_trips_completed, 0) + 1 WHERE id = v_driver_ag_id;
    PERFORM public.ag_check_and_award_milestone(v_driver_ag_id);
  END IF;

  PERFORM cc_check_trip_gps_integrity(p_request_id);

  -- ── Comisión de invitados: 2% a quien invitó al pasajero, 2% a quien
  --    invitó al conductor (mismo criterio anti-pago-doble que ag_complete_trip) ──
  v_trip_value := COALESCE(v_req.accepted_price, v_req.suggested_price, 0);

  SELECT * INTO v_passenger FROM ag_users WHERE auth_user_id = v_req.user_id;
  v_pass_referrer_id := v_passenger.referred_by;

  v_driver_referrer_id := NULL;
  IF v_req.driver_id IS NOT NULL THEN
    SELECT u.* INTO v_driver_user FROM ag_users u WHERE u.auth_user_id = v_req.driver_id;
    v_driver_referrer_id := v_driver_user.referred_by;
  END IF;

  IF v_pass_referrer_id IS NOT NULL AND v_trip_value > 0 THEN
    v_ref_commission := CEIL(v_trip_value::numeric * 2 / 100.0)::integer;
    IF v_ref_commission > 0 THEN
      INSERT INTO ag_referral_wallet (ag_user_id) VALUES (v_pass_referrer_id) ON CONFLICT (ag_user_id) DO NOTHING;
      SELECT id INTO v_wallet_id FROM ag_referral_wallet WHERE ag_user_id = v_pass_referrer_id;
      UPDATE ag_referral_wallet SET balance = balance + v_ref_commission, total_earned = total_earned + v_ref_commission, updated_at = now()
      WHERE id = v_wallet_id;
      INSERT INTO ag_referral_transactions
        (wallet_id, referrer_user_id, referred_user_id, cc_request_id, trip_value, commission_pct, commission_amount, description)
      VALUES (
        v_wallet_id, v_pass_referrer_id, v_passenger.id, p_request_id,
        v_trip_value, 2, v_ref_commission,
        'Comisión 2% — viaje Ciudad a Ciudad de invitado ' || COALESCE(v_passenger.full_name, '') || ' $' || v_trip_value
      );
    END IF;
  END IF;

  IF v_driver_referrer_id IS NOT NULL
     AND (v_pass_referrer_id IS NULL OR v_driver_referrer_id <> v_pass_referrer_id)
     AND v_trip_value > 0 THEN
    v_ref_commission := CEIL(v_trip_value::numeric * 2 / 100.0)::integer;
    IF v_ref_commission > 0 THEN
      INSERT INTO ag_referral_wallet (ag_user_id) VALUES (v_driver_referrer_id) ON CONFLICT (ag_user_id) DO NOTHING;
      SELECT id INTO v_wallet_id FROM ag_referral_wallet WHERE ag_user_id = v_driver_referrer_id;
      UPDATE ag_referral_wallet SET balance = balance + v_ref_commission, total_earned = total_earned + v_ref_commission, updated_at = now()
      WHERE id = v_wallet_id;
      INSERT INTO ag_referral_transactions
        (wallet_id, referrer_user_id, referred_user_id, cc_request_id, trip_value, commission_pct, commission_amount, description)
      VALUES (
        v_wallet_id, v_driver_referrer_id, v_driver_user.id, p_request_id,
        v_trip_value, 2, v_ref_commission,
        'Comisión 2% — viaje Ciudad a Ciudad de invitado ' || COALESCE(v_driver_user.full_name, '') || ' $' || v_trip_value
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'price', v_req.accepted_price);
END; $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 5. SOS real para Ciudad a Ciudad -- se agrega una columna NUEVA y NULLABLE
--    a ag_sos_events (la columna trip_id existente, su FK y su comportamiento
--    para eventos urbanos quedan 100% intactos) para poder asociar un evento
--    SOS a un viaje intercity. El edge function ag-sos-trigger se actualiza
--    aparte (fuera de SQL) para aceptar este campo opcional.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE ag_sos_events
  ADD COLUMN IF NOT EXISTS cc_request_id uuid REFERENCES cc_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ag_sos_events_cc_request_idx ON ag_sos_events(cc_request_id) WHERE cc_request_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────
-- 6. Vista para el panel admin -- lista de viajes Ciudad a Ciudad con info
--    de pasajero/conductor, igual de espíritu a lo que ya usa el tab
--    "Viajes activos" para ag_trip_requests, pero como vista propia porque
--    cc_requests no tiene los mismos nombres de columna.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW cc_admin_requests_v AS
SELECT
  r.*,
  pu.full_name  AS passenger_name,
  pu.phone      AS passenger_phone,
  du.full_name  AS driver_name,
  du.phone      AS driver_phone
FROM cc_requests r
LEFT JOIN ag_users pu ON pu.auth_user_id = r.user_id
LEFT JOIN ag_users du ON du.auth_user_id = r.driver_id
ORDER BY r.created_at DESC;
