-- 257: restaurar el paso 'quick' -> 'pending_docs' al cerrar el primer viaje
--
-- Regla del negocio: un conductor puede hacer su PRIMER viaje sin papeles, sin aprobacion
-- y sin saldo. Del segundo en adelante tiene que mandar la documentacion completa.
--
-- La parte del "primer viaje libre" siempre funciono, y el reparto de solicitudes tambien
-- (verificado el 2026-09-02 sobre una solicitud real: de 15 notificaciones enviadas, 12
-- fueron a conductores de registro rapido, y uno de ellos alcanzo a ofertar).
--
-- Lo que NO funcionaba era el cierre del ciclo. La migracion 145 dejo esta linea dentro de
-- ag_complete_trip:
--     status = CASE WHEN status = 'quick' THEN 'pending_docs' ELSE status END
-- y la migracion 182 (bonos por hitos) reescribio la funcion ENTERA desde cero y la dejo
-- por fuera. Las migraciones 183 y 190 partieron de esa version ya rota. Resultado: el
-- conductor se quedaba en 'quick' de por vida y nunca se le pedian los papeles, aunque la
-- app ya tenia listos el aviso "Completa tu registro" y el bloqueo de submitDriverOffer()
-- para el estado 'pending_docs'. Los dos esperaban un estado que nadie asignaba.
--
-- Alcance del dano: ninguno. Al momento de restaurarlo, los 41 conductores de registro
-- rapido tenian 0 viajes completados, asi que nadie llego a saltarse la documentacion.
--
-- El CHECK de ag_drivers.status ya aceptaba 'pending_docs' (eso si sobrevivio de la 145),
-- por lo que este cambio no necesita tocar la restriccion.
--
-- AL REESCRIBIR ag_complete_trip EN EL FUTURO: conservar la asignacion de status. Es una
-- sola linea y es facil perderla de vista entre las comisiones, los bonos y los referidos.
-- Aplicado en produccion el 2026-09-02 por Management API.

CREATE OR REPLACE FUNCTION public.ag_complete_trip(p_trip_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_driver_id          uuid;
  v_trip               record;
  v_passenger          record;
  v_driver_user        record;
  v_pass_referrer_id   uuid;
  v_driver_referrer_id uuid;
  v_ref_commission     integer;
  v_wallet_id          uuid;
  v_trip_value         integer;
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
    SET metric_trips_completed = COALESCE(metric_trips_completed, 0) + 1,
        -- Al cerrar su PRIMER viaje, el conductor de registro rapido pasa a 'pending_docs'.
        -- Ahi la app le muestra "Completa tu registro" y le bloquea aceptar mas viajes hasta
        -- que mande la documentacion (regla: primer viaje sin papeles, del segundo en adelante
        -- con papeles).
        -- Esto se programo en la migracion 145 y la 182 (bonos por hitos) lo borro sin querer
        -- al reescribir esta funcion entera; 183 y 190 heredaron la version rota, asi que
        -- estuvo inactivo hasta el 2026-09-02. Ningun conductor alcanzo a quedarse sin pedirle
        -- papeles porque todavia ninguno de registro rapido habia cerrado un viaje.
        -- SI VUELVES A REESCRIBIR ESTA FUNCION, CONSERVA ESTA LINEA.
        status = CASE WHEN status = 'quick' THEN 'pending_docs' ELSE status END
    WHERE id = v_driver_id;

    PERFORM public.ag_check_and_award_milestone(v_driver_id);
    PERFORM public.ag_check_trip_gps_integrity(p_trip_request_id);
  END IF;

  -- ── Comisión de invitados: 2% a quien invitó al pasajero, 2% a quien invitó
  --    al conductor (evita pago doble si ambos fueron invitados por la misma
  --    persona) ──────────────────────────────────────────────────────────────
  SELECT * INTO v_trip FROM public.ag_trip_requests WHERE id = p_trip_request_id;
  IF v_trip IS NOT NULL AND v_trip.status = 'completed' THEN
    v_trip_value := COALESCE(v_trip.final_price, v_trip.offered_price, 0);

    SELECT * INTO v_passenger FROM public.ag_users WHERE id = v_trip.passenger_user_id;
    v_pass_referrer_id := v_passenger.referred_by;

    v_driver_referrer_id := NULL;
    IF v_trip.driver_id IS NOT NULL THEN
      SELECT au.* INTO v_driver_user
      FROM public.ag_users au
      JOIN public.ag_drivers ad ON ad.ag_user_id = au.id
      WHERE ad.id = v_trip.driver_id;
      v_driver_referrer_id := v_driver_user.referred_by;
    END IF;

    -- Comisión por quien invitó al PASAJERO
    IF v_pass_referrer_id IS NOT NULL AND v_trip_value > 0 THEN
      v_ref_commission := CEIL(v_trip_value::numeric * 2 / 100.0)::integer;
      IF v_ref_commission > 0 THEN
        INSERT INTO public.ag_referral_wallet (ag_user_id) VALUES (v_pass_referrer_id)
        ON CONFLICT (ag_user_id) DO NOTHING;

        SELECT id INTO v_wallet_id FROM public.ag_referral_wallet WHERE ag_user_id = v_pass_referrer_id;

        UPDATE public.ag_referral_wallet
        SET balance = balance + v_ref_commission, total_earned = total_earned + v_ref_commission, updated_at = now()
        WHERE id = v_wallet_id;

        INSERT INTO public.ag_referral_transactions
          (wallet_id, referrer_user_id, referred_user_id, trip_request_id, trip_value, commission_pct, commission_amount, description)
        VALUES (
          v_wallet_id, v_pass_referrer_id, v_passenger.id, p_trip_request_id,
          v_trip_value, 2, v_ref_commission,
          'Comisión 2% — viaje de invitado ' || COALESCE(v_passenger.full_name, '') || ' $' || v_trip_value
        );
      END IF;
    END IF;

    -- Comisión por quien invitó al CONDUCTOR (solo si es un invitador distinto
    -- al del pasajero, para no pagar doble por el mismo viaje)
    IF v_driver_referrer_id IS NOT NULL
       AND (v_pass_referrer_id IS NULL OR v_driver_referrer_id <> v_pass_referrer_id)
       AND v_trip_value > 0 THEN
      v_ref_commission := CEIL(v_trip_value::numeric * 2 / 100.0)::integer;
      IF v_ref_commission > 0 THEN
        INSERT INTO public.ag_referral_wallet (ag_user_id) VALUES (v_driver_referrer_id)
        ON CONFLICT (ag_user_id) DO NOTHING;

        SELECT id INTO v_wallet_id FROM public.ag_referral_wallet WHERE ag_user_id = v_driver_referrer_id;

        UPDATE public.ag_referral_wallet
        SET balance = balance + v_ref_commission, total_earned = total_earned + v_ref_commission, updated_at = now()
        WHERE id = v_wallet_id;

        INSERT INTO public.ag_referral_transactions
          (wallet_id, referrer_user_id, referred_user_id, trip_request_id, trip_value, commission_pct, commission_amount, description)
        VALUES (
          v_wallet_id, v_driver_referrer_id, v_driver_user.id, p_trip_request_id,
          v_trip_value, 2, v_ref_commission,
          'Comisión 2% — viaje de invitado ' || COALESCE(v_driver_user.full_name, '') || ' $' || v_trip_value
        );
      END IF;
    END IF;
  END IF;
END;
$function$
;
