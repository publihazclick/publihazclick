-- =============================================================================
-- Migration 194: conectar de verdad el cambio de vehículo -- pedido explícito
-- del usuario 2026-08-05.
--
-- Hallazgo antes de implementar: ag_driver_vehicles (varios vehículos por
-- conductor, incluso carro Y moto a la vez) ya existía, y el botón "cambiar
-- vehículo" ya existía en la UI -- pero setCurrentVehicle() solo marcaba
-- is_current en esa tabla secundaria. Ningún otro lugar del sistema lee
-- ag_driver_vehicles (ni el matching de solicitudes de viaje, ni lo que ve
-- el pasajero, ni la validación de antigüedad/documentos) -- todo eso lee
-- directo de ag_drivers.vehicle_type/plate/vehicle_brand/etc. Resultado: el
-- botón no cambiaba nada en la práctica.
--
-- Esta migración reemplaza el cambio directo por un RPC que, al marcar un
-- vehículo como actual, SÍ copia sus datos a ag_drivers -- eso dispara el
-- trigger de antigüedad ya existente (trg_ag_validate_vehicle_age), así que
-- cambiarse a un vehículo fuera del límite de antigüedad queda rechazado
-- igual que si lo hubiera registrado así desde el principio.
--
-- Historial de viajes, wallet, calificaciones, referidos y bonos NO se
-- tocan -- siempre estuvieron atados a driver_id, nunca al vehículo, así
-- que se conservan automáticamente sin necesidad de nada especial aquí.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ag_set_current_vehicle(p_driver_id uuid, p_vehicle_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_vehicle record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.id = p_driver_id AND u.auth_user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  IF EXISTS (SELECT 1 FROM public.ag_trip_requests WHERE driver_id = p_driver_id AND status = 'accepted') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes cambiar de vehículo mientras tienes un viaje en curso.');
  END IF;

  SELECT * INTO v_vehicle FROM public.ag_driver_vehicles
  WHERE id = p_vehicle_id AND driver_id = p_driver_id AND is_active = true;
  IF v_vehicle IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Vehículo no encontrado.');
  END IF;

  UPDATE public.ag_driver_vehicles SET is_current = false WHERE driver_id = p_driver_id;
  UPDATE public.ag_driver_vehicles SET is_current = true WHERE id = p_vehicle_id;

  -- Si el trigger de antigüedad rechaza este vehículo (VEHICULO_MUY_ANTIGUO / AÑO_INVALIDO),
  -- la excepción aborta toda la función -- el cambio de is_current de arriba se revierte solo,
  -- ya que todo corre dentro de esta misma invocación.
  UPDATE public.ag_drivers
  SET vehicle_type   = v_vehicle.vehicle_type,
      plate          = v_vehicle.plate,
      vehicle_plate  = v_vehicle.plate,
      vehicle_brand  = v_vehicle.brand,
      vehicle_model  = v_vehicle.model,
      vehicle_year   = v_vehicle.year,
      vehicle_color  = v_vehicle.color,
      updated_at     = now()
  WHERE id = p_driver_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
