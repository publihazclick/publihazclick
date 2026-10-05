-- 311: cerrar las funciones que mueven saldo (2026-10-04).
--
-- HUECO DE SEGURIDAD: estas funciones SECURITY DEFINER las podía ejecutar el rol anon (cualquiera
-- con la llave pública que va dentro de la app) y no validaban quién llamaba:
--   ag_recharge_driver_wallet   -> cargarle a cualquier conductor el saldo que quisiera
--   ag_approve_wallet_payment   -> aprobar una recarga propia sin haberla pagado
--   ag_admin_refund_withdrawal  -> "devolver" un retiro una y otra vez sumando saldo
--   ag_passenger_wallet_credit  -> que un pasajero se cargue saldo a sí mismo
--   ag_tip_driver               -> propinas a cualquier viaje, por cualquier monto
-- Revisado el historial ese día: no hay rastro de abuso (todas las recargas corresponden a pagos
-- reales o a la cuenta de prueba; cero propinas, devoluciones de retiro y saldo de pasajeros).
--
-- Quién las sigue usando y por dónde:
--   ag_recharge_driver_wallet  -> ag-admin-action 'recharge_driver' (service_role, admin verificado)
--   ag_approve_wallet_payment  -> ag-epayco-webhook (service_role)
--   ag_admin_refund_withdrawal -> ag-admin-action 'reject_withdrawal' (service_role)
--   ag_passenger_wallet_credit -> nadie: la recarga de pasajero en la app no cobraba y se desactivó
--   ag_tip_driver              -> la app del pasajero, ahora con validaciones (abajo)
--
-- ORDEN DE DESPLIEGUE: aplicar DESPUÉS de que estén en producción ag-admin-action con
-- 'recharge_driver' y la web con adminRechargeDriver por ag-admin-action; si no, el botón
-- "Cargar saldo" del panel deja de funcionar.

REVOKE EXECUTE ON FUNCTION public.ag_recharge_driver_wallet(uuid, integer)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ag_approve_wallet_payment(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ag_admin_refund_withdrawal(uuid)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ag_passenger_wallet_credit(integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ag_recharge_driver_wallet(uuid, integer)   TO service_role;
GRANT  EXECUTE ON FUNCTION public.ag_approve_wallet_payment(uuid)            TO service_role;
GRANT  EXECUTE ON FUNCTION public.ag_admin_refund_withdrawal(uuid)           TO service_role;
GRANT  EXECUTE ON FUNCTION public.ag_passenger_wallet_credit(integer, text, text) TO service_role;

-- Propina: solo el pasajero de ESE viaje, solo con el viaje completado, y como mucho $20.000 en
-- total por viaje. Antes cualquiera (incluso sin sesión) podía sumarle propina a cualquier viaje.
CREATE OR REPLACE FUNCTION public.ag_tip_driver(p_trip_request_id uuid, p_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_driver_id uuid;
  v_status    text;
  v_tip       integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'amount>0'; END IF;

  SELECT driver_id, status, coalesce(tip_amount, 0) INTO v_driver_id, v_status, v_tip
  FROM public.ag_trip_requests
  WHERE id = p_trip_request_id
    AND passenger_user_id = public.ag_current_user_id()
  FOR UPDATE;

  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'trip not found'; END IF;
  IF v_status <> 'completed' THEN RAISE EXCEPTION 'La propina solo se puede dar al terminar el viaje'; END IF;
  IF v_tip + p_amount > 20000 THEN RAISE EXCEPTION 'La propina máxima por viaje es $20.000'; END IF;

  UPDATE public.ag_trip_requests SET tip_amount = v_tip + p_amount WHERE id = p_trip_request_id;
  UPDATE public.ag_drivers SET wallet_balance = wallet_balance + p_amount WHERE id = v_driver_id;
  INSERT INTO public.ag_wallet_transactions (driver_id, amount, type, description)
  VALUES (v_driver_id, p_amount, 'refund', 'Propina del pasajero viaje ' || p_trip_request_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ag_tip_driver(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ag_tip_driver(uuid, integer) TO authenticated, service_role;
