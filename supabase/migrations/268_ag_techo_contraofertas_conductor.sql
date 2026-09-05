-- Migración 268: techo a las contraofertas del conductor (2026-09-05).
--
-- EL PROBLEMA, CON DATOS
-- Caso reportado por el usuario: El Llano → Cenabastos, 6,2 km. El precio sugerido por el
-- sistema era $12.000, el pasajero ofreció $16.000 (133% del sugerido, o sea generoso) y un
-- conductor pidió $25.000 (208%). El viaje se perdió. Otro caso el 2026-09-05: sugerido
-- $10.000, pasajero ofreció exactamente $10.000, conductor pidió $25.000 (250%).
--
-- Medido sobre las 126 ofertas de los últimos 60 días, comparadas contra el precio sugerido:
--   hasta el sugerido .... 86 ofertas, 93% aceptadas
--   +1 a +10% ............  3 ofertas, 67% aceptadas
--   +11 a +25% ........... 14 ofertas, 79% aceptadas
--   +26 a +50% ...........  9 ofertas, 56% aceptadas
--   MÁS DE +50% .......... 14 ofertas,  7% aceptadas  <-- 1 de 14
--
-- El precipicio está en +50%. Con este techo activo esos 60 días se habrían bloqueado 13
-- ofertas que el pasajero rechazó igual (13 personas que no habrían visto un número
-- indignante) al costo de 1 viaje real. Decisión del usuario: arrancar en 150%.
--
-- POR QUÉ SE ANCLA AL PRECIO SUGERIDO Y NO A LO QUE PIDIÓ EL PASAJERO
-- Porque el pasajero es un ancla móvil: en los datos reales ofrece entre el 79% y el 133% del
-- sugerido. Si el techo fuera "X% sobre lo que pidió el pasajero", un pasajero generoso le
-- DESBLOQUEARÍA al conductor un techo más alto -- al revés de lo que se busca. El precio
-- sugerido lo calcula el sistema con distancia, tiempo y hora pico, y es el mismo ancla que
-- ya usa el piso del 75,23% (migración 229). Las dos reglas quedan simétricas:
-- **el conductor puede ofertar entre el 75% y el 150% del precio sugerido.**
--
-- LA HORA PICO SE RESUELVE SOLA: el multiplicador de demanda ya está DENTRO del precio
-- sugerido, así que cuando sube el sugerido, sube el techo.
--
-- DÓNDE VIVE ESTA REGLA
-- Solo en 2 lugares, no en 3 como el piso: se verificó que por WhatsApp los conductores NO
-- ofertan (ese canal solo deja al PASAJERO aceptar o rechazar ofertas ya hechas). Los
-- conductores ofertan únicamente desde la app. Así que basta este trigger + la validación
-- en anda-gana.component.ts. Este trigger es el que de verdad garantiza la regla: makeOffer()
-- hace un INSERT directo a ag_trip_offers desde el cliente, así que sin esto cualquiera con
-- su sesión podría saltarse la validación de la app llamando a la API REST.
--
-- A DIFERENCIA DEL PISO (migración 229), acá el cálculo SÍ incluye los minutos estimados y el
-- surge. El piso los omite a propósito para ser más permisivo; para un techo, "más permisivo"
-- es justo lo contrario -- un sugerido más bajo daría un techo más bajo y la base de datos
-- rechazaría ofertas que la app sí dejó pasar. Por eso acá se calcula igual que
-- suggestPrice()/_calcPrice() y además se redondea el techo HACIA ARRIBA.

CREATE OR REPLACE FUNCTION public.ag_enforce_max_offer_price()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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

  SELECT distance_km, vehicle_type, service_type, surge_multiplier
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
$$;

DROP TRIGGER IF EXISTS trg_ag_enforce_max_offer_price ON public.ag_trip_offers;
CREATE TRIGGER trg_ag_enforce_max_offer_price
  BEFORE INSERT OR UPDATE OF offered_price ON public.ag_trip_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.ag_enforce_max_offer_price();
