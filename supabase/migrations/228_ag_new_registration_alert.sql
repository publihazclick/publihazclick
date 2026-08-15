-- ═══════════════════════════════════════════════════════════════════════════
-- 228: Aviso al dueño cada vez que alguien se registra en Movi
-- ═══════════════════════════════════════════════════════════════════════════
-- Pedido explícito del usuario 2026-08-15: enterarse por WhatsApp Y correo
-- cada vez que alguien se registra (pasajero o conductor), sin costo.
--
-- Por qué un trigger en la tabla en vez de enganchar el frontend: hay al
-- menos 3 caminos distintos que insertan en ag_users (registerPassenger()
-- directo, registerQuickPassenger()/registerQuickDriver() vía RPC
-- ag_upsert_user_by_phone) -- un trigger AFTER INSERT los cubre todos por
-- igual sin tener que tocar cada uno de esos flujos por separado.
--
-- Reusa EXACTO el mismo mecanismo de doble canal ya probado en producción
-- (migración 218, monitoreo de capacidad): WhatsApp vía ag-whatsapp con la
-- plantilla aprobada "trip_error_alert" (categoría Utilidad, evita depender
-- de la ventana de 24h) + correo directo vía Resend, cada canal independiente
-- del otro (si uno falla, el otro igual llega). El único objeto nuevo tocado
-- es esta función/trigger propios de ag_users -- no se modifica ningún
-- trigger ni función existente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ag_notify_new_registration()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_resend_key   TEXT;
  v_role_label   TEXT;
  v_message      TEXT;
BEGIN
  v_role_label := CASE NEW.role WHEN 'driver' THEN 'Conductor' ELSE 'Pasajero' END;
  v_message := v_role_label || ': ' || COALESCE(NEW.full_name, '(sin nombre)')
    || CASE WHEN NEW.phone IS NOT NULL AND NEW.phone <> '' THEN ' · ' || NEW.phone ELSE '' END
    || CASE WHEN NEW.city  IS NOT NULL AND NEW.city  <> '' THEN ' · ' || NEW.city  ELSE '' END
    || CASE WHEN NEW.email IS NOT NULL AND NEW.email <> '' THEN ' · ' || NEW.email ELSE '' END;

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  SELECT decrypted_secret INTO v_resend_key   FROM vault.decrypted_secrets WHERE name = 'resend_api_key' LIMIT 1;

  -- canal 1: WhatsApp (mismo mecanismo probado de error_alert / 218)
  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url     := v_supabase_url || '/functions/v1/ag-whatsapp',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body    := jsonb_build_object(
          'to', 'admin', 'event', 'new_registration',
          'data', jsonb_build_object('context', '🆕 Nuevo registro en Movi', 'message', v_message)
        ),
        timeout_milliseconds := 8000
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- canal 2: correo (independiente del canal de WhatsApp)
  IF v_resend_key IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_resend_key),
        body    := jsonb_build_object(
          'from',    'Movi <noreply@publihazclick.com>',
          'to',      ARRAY['publihazclick.com@gmail.com'],
          'subject', '🆕 Nuevo registro en Movi — ' || v_role_label,
          'text',    v_message
        ),
        timeout_milliseconds := 8000
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ag_users_notify_registration ON public.ag_users;
CREATE TRIGGER ag_users_notify_registration
  AFTER INSERT ON public.ag_users
  FOR EACH ROW EXECUTE FUNCTION public.ag_notify_new_registration();
