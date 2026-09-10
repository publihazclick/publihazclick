-- ═══════════════════════════════════════════════════════════════════════════
-- 282 — Los avisos de viaje al admin llevan el teléfono del pasajero Y del conductor
--
-- PEDIDO DEL USUARIO (2026-09-08): "cuando me envías a mi WhatsApp un viaje que se
-- está solicitando, así como me mandas el número del pasajero, también necesito el
-- número del conductor para poder resolver rápido cualquier error".
--
-- Lo que había de verdad: los avisos de viaje **no traían NINGÚN teléfono**, ni el del
-- pasajero. Llegaban así:
--     ✅ Oferta aceptada | ANTHONY RUEDA asignado · $7,000
--     🚗 Conductor en camino | Va hacia el punto de recogida
-- Con eso, para llamar a alguien había que entrar al panel a buscarlo. El número que sí
-- aparece hoy es el de los avisos de CHAT NUEVO (notifyAdminNewConversation), que es otra
-- cosa distinta.
--
-- Decisiones:
-- • Los contactos van **al PRINCIPIO** del detalle, no al final. tplParam() recorta a 900
--   caracteres por el final, y lo accionable no se puede perder ahí. Además es lo primero
--   que se lee al abrir el aviso.
-- • Los teléfonos salen en formato +57… para que WhatsApp los vuelva enlace y se pueda
--   llamar o escribir tocándolos, sin copiar y pegar.
-- • Se arma desde los ids que trae NEW, sin releer ag_trip_requests: así funciona igual
--   en un trigger BEFORE que en uno AFTER (hoy los dos son AFTER, pero no depende de eso).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ag_admin_contactos(
  p_passenger_user_id uuid,
  p_driver_id         uuid,
  p_wa_phone          text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $function$
DECLARE
  v_pas_nombre text;
  v_pas_tel    text;
  v_con_nombre text;
  v_con_tel    text;
  v_placa      text;
  v_out        text;
BEGIN
  -- Pasajero. El teléfono puede estar en la ficha del usuario o, si pidió por WhatsApp
  -- sin registrarse, solo en wa_phone.
  SELECT u.full_name, COALESCE(u.phone, p_wa_phone)
    INTO v_pas_nombre, v_pas_tel
    FROM public.ag_users u
   WHERE u.id = p_passenger_user_id;

  IF v_pas_tel IS NULL THEN v_pas_tel := p_wa_phone; END IF;

  v_out := 'Pasajero ' || COALESCE(NULLIF(v_pas_nombre, ''), 'sin nombre');
  IF v_pas_tel IS NOT NULL AND v_pas_tel <> '' THEN
    v_out := v_out || ' +' || regexp_replace(v_pas_tel, '\D', '', 'g');
  END IF;

  -- Conductor. Solo cuando ya hay uno asignado (en 'searching' todavía no).
  IF p_driver_id IS NOT NULL THEN
    SELECT u.full_name, u.phone, d.vehicle_plate
      INTO v_con_nombre, v_con_tel, v_placa
      FROM public.ag_drivers d
      LEFT JOIN public.ag_users u ON u.id = d.ag_user_id
     WHERE d.id = p_driver_id;

    v_out := v_out || ' · Conductor ' || COALESCE(NULLIF(v_con_nombre, ''), 'sin nombre');
    IF v_con_tel IS NOT NULL AND v_con_tel <> '' THEN
      v_out := v_out || ' +' || regexp_replace(v_con_tel, '\D', '', 'g');
    END IF;
    IF v_placa IS NOT NULL AND v_placa <> '' THEN
      v_out := v_out || ' (' || v_placa || ')';
    END IF;
  END IF;

  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION public.ag_admin_contactos(uuid, uuid, text) IS
  'Pasajero y conductor con teléfono en +E164, para encabezar los avisos al admin. Migración 282.';


-- ─── Nueva solicitud ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_admin_notify_trip_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.status <> 'searching' THEN RETURN NEW; END IF;
  PERFORM public.ag_notify_admin_live_event(
    '🆕 Nueva solicitud (' || COALESCE(NEW.vehicle_type,'?') || ', ' || COALESCE(NEW.source,'app') || ')',
    public.ag_admin_contactos(NEW.passenger_user_id, NEW.driver_id, NEW.wa_phone) || ' · ' ||
    '$' || to_char(NEW.offered_price, 'FM999G999G999') || ' · ' ||
    COALESCE(NEW.origin_name,'origen') || ' → ' || COALESCE(NEW.dest_name,'destino')
  );
  RETURN NEW;
END;
$function$;


-- ─── Progreso del viaje ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_admin_notify_trip_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_driver_name text;
  v_contactos   text;
BEGIN
  -- Una sola vez por disparo: lo usan todas las ramas de abajo.
  v_contactos := public.ag_admin_contactos(NEW.passenger_user_id, NEW.driver_id, NEW.wa_phone);

  -- Oferta aceptada por el pasajero
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    SELECT u.full_name INTO v_driver_name
    FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.id = NEW.driver_id;
    PERFORM public.ag_notify_admin_live_event(
      '✅ Oferta aceptada',
      v_contactos || ' · $' || to_char(NEW.offered_price, 'FM999G999G999')
    );
  END IF;

  -- Cancelado (por cualquiera de las dos partes)
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    PERFORM public.ag_notify_admin_live_event(
      '❌ Viaje cancelado',
      v_contactos || ' · ' || COALESCE(NEW.cancel_reason, 'Sin motivo indicado')
    );
    RETURN NEW;
  END IF;

  -- Cambios de etapa del conductor
  IF NEW.driver_stage IS DISTINCT FROM OLD.driver_stage AND NEW.driver_stage IS NOT NULL THEN
    IF NEW.driver_stage = 'heading_to_pickup' THEN
      PERFORM public.ag_notify_admin_live_event('🚗 Conductor en camino',
        v_contactos || ' · Va hacia el punto de recogida');
    ELSIF NEW.driver_stage = 'arrived_at_pickup' THEN
      PERFORM public.ag_notify_admin_live_event('📍 Conductor llegó',
        v_contactos || ' · Esperando al pasajero en el punto de recogida');
    ELSIF NEW.driver_stage = 'on_route' THEN
      PERFORM public.ag_notify_admin_live_event('🚀 Viaje iniciado',
        v_contactos || ' · Pasajero a bordo, en camino al destino');
    ELSIF NEW.driver_stage = 'arrived_at_destination' THEN
      PERFORM public.ag_notify_admin_live_event('📍 Llegó al destino',
        v_contactos || ' · Pendiente de finalizar el viaje');
    ELSIF NEW.driver_stage = 'completed' THEN
      PERFORM public.ag_notify_admin_live_event('🏁 Viaje completado',
        v_contactos ||
        ' · $' || to_char(COALESCE(NEW.final_price, NEW.offered_price), 'FM999G999G999') ||
        ' · comisión $' || to_char(COALESCE(NEW.commission_amount, 0), 'FM999G999G999')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
