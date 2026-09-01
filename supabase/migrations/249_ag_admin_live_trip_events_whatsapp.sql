-- Migration 249: cada evento de cada viaje llega al WhatsApp del admin en vivo (2026-09-01)
--
-- Pedido explicito del usuario: "necesito que todo me llegue a mi whatsapp para saber en
-- vivo en tiempo real todos los eventos, cada cosa que pase con cada solicitud". Verificado
-- primero que el canal SI funciona (prueba real confirmada por el usuario: "si me llego").
--
-- Se implementa con triggers de base de datos (no desde el cliente) para cubrir TODOS los
-- caminos por igual -- app, WhatsApp del pasajero, o cualquier otro que exista a futuro --
-- sin depender de que el navegador/app de un usuario especifico ejecute JS con exito.
--
-- Reusa el mismo canal ya probado (ag-whatsapp, event=error_alert, plantilla aprobada
-- trip_error_alert de 2 variables) en vez de pedir una plantilla nueva a Meta -- el nombre
-- del evento es "context", el detalle es "message", ninguno de los dos tiene que ser
-- literalmente un error.

CREATE OR REPLACE FUNCTION public.ag_notify_admin_live_event(p_context text, p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url TEXT;
BEGIN
  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  IF v_supabase_url IS NULL THEN RETURN; END IF;
  BEGIN
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/ag-whatsapp',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object('to', 'admin', 'event', 'error_alert',
                   'data', jsonb_build_object('context', p_context, 'message', p_message)),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$$;

-- ── 1. Nueva solicitud creada ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_admin_notify_trip_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status <> 'searching' THEN RETURN NEW; END IF;
  PERFORM public.ag_notify_admin_live_event(
    '🆕 Nueva solicitud (' || COALESCE(NEW.vehicle_type,'?') || ', ' || COALESCE(NEW.source,'app') || ')',
    '$' || to_char(NEW.offered_price, 'FM999G999G999') || ' · ' ||
    COALESCE(NEW.origin_name,'origen') || ' → ' || COALESCE(NEW.dest_name,'destino')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_admin_notify_trip_created ON public.ag_trip_requests;
CREATE TRIGGER trg_ag_admin_notify_trip_created
  AFTER INSERT ON public.ag_trip_requests
  FOR EACH ROW EXECUTE FUNCTION public.ag_admin_notify_trip_created();

-- ── 2. Conductor hace una oferta ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_admin_notify_offer_made()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_driver_name text;
BEGIN
  SELECT u.full_name INTO v_driver_name
  FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id
  WHERE d.id = NEW.driver_id;

  PERFORM public.ag_notify_admin_live_event(
    '💰 Oferta de conductor',
    COALESCE(v_driver_name, 'Conductor') || ' ofrece $' || to_char(NEW.offered_price, 'FM999G999G999')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_admin_notify_offer_made ON public.ag_trip_offers;
CREATE TRIGGER trg_ag_admin_notify_offer_made
  AFTER INSERT ON public.ag_trip_offers
  FOR EACH ROW EXECUTE FUNCTION public.ag_admin_notify_offer_made();

-- ── 3. Cambios de estado/etapa del viaje (aceptado, en camino, llegó, abordo, llegó
--      destino, completado, cancelado) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_admin_notify_trip_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_driver_name text;
BEGIN
  -- Oferta aceptada por el pasajero
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    SELECT u.full_name INTO v_driver_name
    FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.id = NEW.driver_id;
    PERFORM public.ag_notify_admin_live_event(
      '✅ Oferta aceptada',
      COALESCE(v_driver_name, 'Conductor') || ' asignado · $' || to_char(NEW.offered_price, 'FM999G999G999')
    );
  END IF;

  -- Cancelado (por cualquiera de las dos partes)
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    PERFORM public.ag_notify_admin_live_event(
      '❌ Viaje cancelado',
      COALESCE(NEW.cancel_reason, 'Sin motivo indicado')
    );
    RETURN NEW;
  END IF;

  -- Cambios de etapa del conductor
  IF NEW.driver_stage IS DISTINCT FROM OLD.driver_stage AND NEW.driver_stage IS NOT NULL THEN
    IF NEW.driver_stage = 'heading_to_pickup' THEN
      PERFORM public.ag_notify_admin_live_event('🚗 Conductor en camino', 'Va hacia el punto de recogida');
    ELSIF NEW.driver_stage = 'arrived_at_pickup' THEN
      PERFORM public.ag_notify_admin_live_event('📍 Conductor llegó', 'Esperando al pasajero en el punto de recogida');
    ELSIF NEW.driver_stage = 'on_route' THEN
      PERFORM public.ag_notify_admin_live_event('🚀 Viaje iniciado', 'Pasajero a bordo, en camino al destino');
    ELSIF NEW.driver_stage = 'arrived_at_destination' THEN
      PERFORM public.ag_notify_admin_live_event('📍 Llegó al destino', 'Pendiente de finalizar el viaje');
    ELSIF NEW.driver_stage = 'completed' THEN
      PERFORM public.ag_notify_admin_live_event(
        '🏁 Viaje completado',
        '$' || to_char(COALESCE(NEW.final_price, NEW.offered_price), 'FM999G999G999') ||
        ' · comisión $' || to_char(COALESCE(NEW.commission_amount, 0), 'FM999G999G999')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_admin_notify_trip_progress ON public.ag_trip_requests;
CREATE TRIGGER trg_ag_admin_notify_trip_progress
  AFTER UPDATE ON public.ag_trip_requests
  FOR EACH ROW EXECUTE FUNCTION public.ag_admin_notify_trip_progress();
