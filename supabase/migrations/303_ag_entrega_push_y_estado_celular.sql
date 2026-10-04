-- 303: confirmación de entrega del push desde el celular + estado del celular del conductor.
--
-- POR QUÉ (2026-10-03): medido ese día, el push sale del servidor en <0,5 s, pero de 579 avisos en
-- 30 días 386 nunca se vieron, y no había forma de saber si NO LLEGÓ al celular (Android/fabricante
-- lo retuvo) o si llegó y el conductor no lo miró. ag_trip_push_log solo sabía cuándo SALIÓ
-- (sent_at) y cuándo lo vio con la app abierta o lo tocó (foreground_at / tapped_at).
--
-- 1. ag_trip_push_log.delivered_at: lo marca el propio celular apenas Android le entrega el push,
--    aunque la app esté cerrada (MoviFirebaseMessagingService, APK 1.4.32+). El servicio nativo no
--    tiene sesión de usuario, así que se identifica con su token FCM: ag_push_recibido() solo marca
--    si ese token existe en ag_push_subs, y solo filas de ESE conductor y ESE viaje.
-- 2. ag_drivers.device_*: marca, modelo, Android, si tiene la batería sin restricción y si las
--    notificaciones están activas (lo reporta la app, ag_report_device_status). Sirve para saber a
--    qué conductores Android les retiene los avisos y por qué.

ALTER TABLE public.ag_trip_push_log
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

ALTER TABLE public.ag_drivers
  ADD COLUMN IF NOT EXISTS device_manufacturer     text,
  ADD COLUMN IF NOT EXISTS device_model            text,
  ADD COLUMN IF NOT EXISTS device_sdk              integer,
  ADD COLUMN IF NOT EXISTS device_battery_exempt   boolean,
  ADD COLUMN IF NOT EXISTS device_notifications_on boolean,
  ADD COLUMN IF NOT EXISTS device_app_version      text,
  ADD COLUMN IF NOT EXISTS device_status_at        timestamptz;

-- Llamada por el servicio nativo (sin sesión) con la llave pública. Devuelve cuántas filas marcó.
CREATE OR REPLACE FUNCTION public.ag_push_recibido(p_trip_id uuid, p_fcm_token text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer := 0;
BEGIN
  IF p_trip_id IS NULL OR coalesce(length(p_fcm_token), 0) < 20 THEN RETURN 0; END IF;
  UPDATE public.ag_trip_push_log l
     SET delivered_at = now()
    FROM public.ag_push_subs s
    JOIN public.ag_users u   ON u.auth_user_id = s.user_id
    JOIN public.ag_drivers d ON d.ag_user_id = u.id
   WHERE s.fcm_token = p_fcm_token
     AND l.driver_id = d.id
     AND l.trip_request_id = p_trip_id
     AND l.delivered_at IS NULL
     AND l.sent_at > now() - interval '1 hour';   -- solo avisos recientes: nada de marcar historia vieja
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.ag_push_recibido(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_push_recibido(uuid, text) TO anon, authenticated, service_role;

-- Llamada por la app del conductor (con su sesión) al abrir.
CREATE OR REPLACE FUNCTION public.ag_report_device_status(
  p_manufacturer text, p_model text, p_sdk integer,
  p_battery_exempt boolean, p_notifications_on boolean, p_app_version text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ag_drivers d
     SET device_manufacturer     = left(p_manufacturer, 60),
         device_model            = left(p_model, 60),
         device_sdk              = p_sdk,
         device_battery_exempt   = p_battery_exempt,
         device_notifications_on = p_notifications_on,
         device_app_version      = left(p_app_version, 20),
         device_status_at        = now()
    FROM public.ag_users u
   WHERE u.id = d.ag_user_id AND u.auth_user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.ag_report_device_status(text, text, integer, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ag_report_device_status(text, text, integer, boolean, boolean, text) TO authenticated, service_role;
