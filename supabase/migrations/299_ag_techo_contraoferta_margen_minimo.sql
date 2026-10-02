-- ════════════════════════════════════════════════════════════════════════════
-- 299 — Techo de la contraoferta: margen mínimo de $3.000 sobre el pasajero (2026-10-02)
--
-- El techo sigue siendo el 150% del precio sugerido (migración 268), pero ahora nunca queda
-- a menos de $3.000 por encima de lo que ofreció el pasajero. Pedido del usuario tras hablar
-- con un conductor que "solo pudo subir $1.000" (ese caso fue por un destino mal leído a 200 m,
-- ya corregido, pero los datos mostraron el mismo apretón en viajes cortos, sobre todo moto).
-- Medido 60 días: 110 ofertas, 7 en el techo; margen promedio sobre el pasajero $6.027.
-- Aplicada vía Management API, NO db push (ver movi_migration_history_desync_danger).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ag_enforce_max_offer_price()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_req       record;
  v_dist      numeric;
  v_min       numeric;   -- minutos estimados, misma velocidad asumida que la app (30 km/h)
  v_suggested numeric;
  v_ceiling   numeric;
BEGIN
  IF NEW.offered_price IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT distance_km, vehicle_type, service_type, surge_multiplier, offered_price
  INTO v_req
  FROM public.ag_trip_requests
  WHERE id = NEW.trip_request_id;

  -- Sin distancia no hay precio sugerido que valga: se deja pasar en vez de bloquear un
  -- viaje real por falta de datos. (Hoy distance_km viene en 208 de 208 solicitudes, pero
  -- la regla falla abierta a propósito.)
  IF v_req.distance_km IS NULL OR v_req.distance_km <= 0 THEN
    RETURN NEW;
  END IF;

  v_dist := v_req.distance_km;
  v_min  := v_dist / 30 * 60;

  IF v_req.service_type = 'domicilio' THEN
    v_suggested := GREATEST(5000, v_dist * 1500);
  ELSIF v_req.vehicle_type = 'moto' THEN
    v_suggested := GREATEST(3000, 2500 + v_dist * 800 + v_min * 80);
  ELSE -- carro
    v_suggested := GREATEST(4500, 4000 + v_dist * 1000 + v_min * 150);
  END IF;

  v_suggested := v_suggested * COALESCE(v_req.surge_multiplier, 1);

  -- Redondeo hacia ARRIBA al múltiplo de $500: el techo nunca queda por debajo del 150%
  -- exacto, así que la base de datos jamás rechaza algo que la app haya mostrado como válido.
  v_ceiling := CEIL(v_suggested * 1.5 / 500) * 500;

  -- Margen mínimo garantizado (migración 299, 2026-10-02): el conductor siempre puede subir al
  -- menos $3.000 sobre lo que ofreció el pasajero. Caso real: moto de 1 km, sugerido $3.500 y
  -- techo $5.500, pero el pasajero no puede ofrecer menos de $5.000 -> el conductor solo podía
  -- subir $500. En viajes largos sigue mandando el 150% del sugerido, que es mucho mayor.
  -- Debe coincidir con maxOfferFor() en anda-gana.component.ts.
  IF v_req.offered_price IS NOT NULL THEN
    v_ceiling := GREATEST(v_ceiling, v_req.offered_price + 3000);
  END IF;

  IF NEW.offered_price > v_ceiling THEN
    -- El mensaje lo lee el conductor tal cual (makeOffer() devuelve error.message y la app lo
    -- muestra), así que dice el máximo real en vez de solo negar.
    RAISE EXCEPTION 'La oferta máxima para este viaje es $%. Ofreciste $%, que está muy por encima del precio sugerido y los pasajeros casi nunca lo aceptan.',
      -- replace() a proposito: el separador de miles de to_char depende de lc_numeric del
      -- servidor y salia con coma ($18,500), formato gringo. En Colombia es con punto.
      replace(to_char(v_ceiling, 'FM999G999G999'), ',', '.'),
      replace(to_char(NEW.offered_price, 'FM999G999G999'), ',', '.')
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  RETURN NEW;
END;
$function$
;
