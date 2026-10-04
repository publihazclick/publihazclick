-- 309: celular de quien escribe con el número OCULTO en WhatsApp, para que los avisos al admin lo traigan.
--
-- POR QUÉ (2026-10-04): el usuario: "asegúrate que todo lo que me envías a mi WhatsApp (solicitudes de
-- viaje, nueva conversación) siempre traiga el número de celular del usuario, porque dejó de llegarme".
-- Causa: cada vez más gente activa el "nombre de usuario" de WhatsApp. Para ellos Meta NO manda el
-- número, solo un BSUID ("CO.1749967832941734"). Solo el 4-oct hubo 3 (un pasajero que pidió viaje y
-- dos leads de conductor de la pauta). No hay forma de sacar el número de Meta: hay que pedírselo.
--
-- ag-whatsapp le pide el celular a quien escribe con número oculto (una vez cada 24 h hasta que lo dé),
-- lo guarda acá cuando lo escribe y avisa al admin. ag_tel_contacto() es lo que usan los avisos para
-- mostrar el teléfono: el número real, el que dio la persona, o "número oculto" dicho claramente.

CREATE TABLE IF NOT EXISTS public.ag_wa_celular_oculto (
  bsuid      text PRIMARY KEY,        -- tal cual llega de Meta, p. ej. 'CO.1749967832941734'
  celular    text,                    -- E.164, p. ej. '+573001234567' (NULL hasta que lo da)
  pedido_at  timestamptz,             -- última vez que el bot se lo pidió
  dado_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ag_wa_celular_oculto ENABLE ROW LEVEL SECURITY;   -- solo service_role

-- Teléfono para mostrar en los avisos. Un BSUID empieza con el país y un punto ("CO.").
CREATE OR REPLACE FUNCTION public.ag_tel_contacto(p_tel text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cel text;
BEGIN
  IF p_tel IS NULL OR p_tel = '' THEN RETURN NULL; END IF;
  IF p_tel ~ '^[A-Za-z]{2}\.' THEN
    SELECT celular INTO v_cel FROM public.ag_wa_celular_oculto WHERE bsuid = p_tel;
    IF v_cel IS NOT NULL THEN RETURN v_cel || ' (lo dio por el chat; su WhatsApp tiene el número oculto)'; END IF;
    RETURN '(número oculto en WhatsApp, ya se le pidió el celular)';
  END IF;
  RETURN '+' || regexp_replace(p_tel, '\D', '', 'g');
END;
$$;
REVOKE ALL ON FUNCTION public.ag_tel_contacto(text) FROM PUBLIC, anon, authenticated;

-- Igual que antes, pero el teléfono pasa por ag_tel_contacto (antes un BSUID salía como
-- "+1749967832941734": parecía un número y no lo era).
CREATE OR REPLACE FUNCTION public.ag_admin_contactos(p_passenger_user_id uuid, p_driver_id uuid, p_wa_phone text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    v_out := v_out || ' ' || public.ag_tel_contacto(v_pas_tel);
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
      v_out := v_out || ' ' || public.ag_tel_contacto(v_con_tel);
    END IF;
    IF v_placa IS NOT NULL AND v_placa <> '' THEN
      v_out := v_out || ' (' || v_placa || ')';
    END IF;
  END IF;

  RETURN v_out;
END;
$function$;

-- Aviso de registro nuevo: mismo cambio (el teléfono pasa por ag_tel_contacto). Resto idéntico.
CREATE OR REPLACE FUNCTION public.ag_avisar_registro(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url    TEXT;
  v_key    TEXT;
  v_resend TEXT;
  u        RECORD;
  d        RECORD;
  v_titulo TEXT;
  v_msg    TEXT;
  v_veh    TEXT;
BEGIN
  -- Reclamar el registro: si otro camino ya avisó, acá no se hace nada.
  UPDATE ag_users SET alerta_registro_at = NOW()
   WHERE id = p_user_id AND alerta_registro_at IS NULL
  RETURNING * INTO u;
  IF u.id IS NULL THEN RETURN false; END IF;

  SELECT * INTO d FROM ag_drivers WHERE ag_user_id = p_user_id
   ORDER BY created_at DESC LIMIT 1;

  IF u.role = 'driver' THEN
    v_veh := NULLIF(TRIM(COALESCE(d.vehicle_type, '')), '');
    v_titulo := CASE
      WHEN v_veh = 'moto'                  THEN '🏍️ Conductor nuevo — MOTO'
      WHEN v_veh IN ('carro','sedan','suv') THEN '🚗 Conductor nuevo — CARRO'
      WHEN v_veh = 'camion'                THEN '🚛 Conductor nuevo — CAMIÓN'
      WHEN v_veh IS NOT NULL               THEN '🚙 Conductor nuevo — ' || upper(v_veh)
      ELSE '⏳ Conductor nuevo — SIN VEHÍCULO AÚN'
    END;
  ELSE
    v_titulo := '🆕 Pasajero nuevo en Movi';
  END IF;

  v_msg := COALESCE(NULLIF(TRIM(u.full_name), ''), '(sin nombre)')
    || CASE WHEN COALESCE(u.phone, '') <> '' THEN ' · ' || public.ag_tel_contacto(u.phone) ELSE '' END
    || CASE WHEN COALESCE(u.city,  '') <> '' THEN ' · ' || u.city  ELSE '' END
    -- Datos del vehículo: lo que de verdad sirve para reconocerlo de un vistazo.
    || CASE WHEN v_veh IS NOT NULL THEN
         ' · ' || COALESCE(NULLIF(TRIM(d.vehicle_brand), ''), 'sin marca')
         || COALESCE(' ' || NULLIF(d.vehicle_year::text, ''), '')
         || COALESCE(' · placa ' || NULLIF(TRIM(COALESCE(d.vehicle_plate, d.plate)), ''), '')
       ELSE '' END;

  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'supabase_url'     LIMIT 1;
  SELECT decrypted_secret INTO v_key    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  SELECT decrypted_secret INTO v_resend FROM vault.decrypted_secrets WHERE name = 'resend_api_key'   LIMIT 1;

  IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/ag-whatsapp',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || v_key),
        body    := jsonb_build_object(
          'to', 'admin', 'event', 'new_registration',
          'data', jsonb_build_object('context', v_titulo, 'message', v_msg)
        ),
        timeout_milliseconds := 8000
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF v_resend IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'Authorization', 'Bearer ' || v_resend),
        body    := jsonb_build_object(
          'from',    'Movi <noreply@publihazclick.com>',
          'to',      ARRAY['publihazclick.com@gmail.com'],
          'subject', v_titulo,
          'text',    v_msg
        ),
        timeout_milliseconds := 8000
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN true;
END;
$function$
;
