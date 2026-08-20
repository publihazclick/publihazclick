-- Piso real de precio a nivel de base de datos para ag_trip_requests.offered_price.
--
-- Contexto (2026-08-19): el mismo día se agregó un piso de "75.23% del precio sugerido,
-- redondeado hacia arriba al múltiplo de $500" tanto en ag-whatsapp/index.ts (awaiting_price)
-- como en anda-gana.component.ts (adjustTripPrice/adjustTripPriceSmart/setTripPricePreset), para
-- que un pasajero no pueda ofrecer un precio injustamente bajo y afectar la ganancia del
-- conductor. Pero ambas validaciones son SOLO de aplicación (JS) -- la política RLS de esta
-- tabla (trip_requests_own) únicamente exige que el viaje sea del propio pasajero
-- (passenger_user_id = ag_current_user_id()), sin ninguna restricción sobre offered_price. Eso
-- significa que cualquier pasajero con su propia sesión válida podía saltarse el piso llamando
-- directo a la API REST de Supabase (Postman, consola del navegador, etc.), sin pasar por la app
-- ni por WhatsApp. Este trigger cierra ese hueco: la regla queda garantizada por la plataforma
-- misma, sin importar por dónde ni cómo se cree o edite la solicitud.
--
-- La fórmula de "precio sugerido" está DUPLICADA a propósito en 3 lugares (ag-whatsapp/index.ts
-- suggestPrice(), anda-gana.component.ts _calcPrice()/_calcDomPrice(), y esta función SQL) --
-- mismo patrón ya aceptado en este repo (ver el comentario de suggestPrice() en ag-whatsapp, que
-- ya advertía que debía coincidir con _calcPrice de la app). Si las tarifas base cambian, hay que
-- actualizar los 3 lugares.
--
-- Surge se omite a propósito en este trigger (a diferencia de las 2 copias en JS, que sí lo
-- aplican): sin el multiplicador de demanda, el piso que calcula la base de datos siempre es
-- IGUAL O MENOR al piso real que le muestra la app/WhatsApp al pasajero en ese momento (surge
-- multiplica por >= 1, nunca reduce el precio). Eso garantiza que este trigger nunca rechace de
-- more un precio que la app o WhatsApp sí hubieran dejado pasar en horas de alta demanda --
-- prefiere ser un poco más permisivo en vez de bloquear por accidente un viaje real.
--
-- vehicle_type: confirmado con pruebas reales 2026-08-19 que ag_trip_requests_vehicle_type_check
-- solo permite 'carro'/'moto' en esta tabla (la rama 'camion' que sí existe en _calcPrice()/
-- suggestPrice() nunca llega a insertarse acá -- fletes/camión viven en otro sistema, igual que
-- 'ciudad', que WhatsApp redirige a "no disponible por chat, usa la app" antes de crear nada).
-- Por eso este trigger solo contempla domicilio/moto/carro -- son los únicos 3 casos que el CHECK
-- constraint de la tabla deja pasar.

CREATE OR REPLACE FUNCTION ag_enforce_min_offered_price()
RETURNS TRIGGER AS $$
DECLARE
  v_suggested numeric;
  v_floor     numeric;
  v_dist      numeric := COALESCE(NEW.distance_km, 0);
BEGIN
  IF NEW.offered_price IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.service_type = 'domicilio' THEN
    v_suggested := GREATEST(5000, v_dist * 1500);
  ELSIF NEW.vehicle_type = 'moto' THEN
    v_suggested := GREATEST(3000, 2500 + v_dist * 700);
  ELSE -- carro (default, mismo fallback que suggestPrice()/_calcPrice())
    v_suggested := GREATEST(4500, 4000 + v_dist * 1000);
  END IF;

  v_floor := GREATEST(5000, CEIL(v_suggested * 0.7523 / 500) * 500);

  IF NEW.offered_price < v_floor THEN
    RAISE EXCEPTION 'offered_price (%) está por debajo del mínimo permitido (%) -- 75.23%% del precio sugerido, protege la ganancia del conductor', NEW.offered_price, v_floor
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ag_enforce_min_offered_price ON ag_trip_requests;
CREATE TRIGGER trg_ag_enforce_min_offered_price
  BEFORE INSERT OR UPDATE OF offered_price ON ag_trip_requests
  FOR EACH ROW
  EXECUTE FUNCTION ag_enforce_min_offered_price();
