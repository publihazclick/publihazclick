-- 308: el conductor que no pudo recargar nos escribe él (botón en la app); lo automático queda de respaldo.
--
-- POR QUÉ (2026-10-04): decisión del usuario: "poner un botón que lleve al WhatsApp cuando alguien no
-- haya podido hacer la recarga, para que sea él quien nos escriba y no nosotros a él". La app ahora
-- muestra "¿No pudiste recargar? Escríbenos por WhatsApp" (siempre en el panel de recarga, y destacado
-- si el pago da error o si vuelve de ePayco sin que suba el saldo). El mensaje ya escrito lo reconoce
-- ag-whatsapp y responde con la lista de pasos. Como el conductor escribe primero, todo es gratis.
--
-- Este cron queda de RESPALDO: espera 30 min (antes 20) para darle tiempo de escribir, y ag-whatsapp
-- solo le escribe si tiene la ventana de 24 h abierta y no lo atendimos ya (sin plantilla pagada).
-- El aviso al admin con sus datos sigue igual.

CREATE OR REPLACE FUNCTION public.ag_alertar_recargas_fallidas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url  text;
  v_key  text;
  r      record;
  v_n    integer := 0;
  v_tel  text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN 0; END IF;

  FOR r IN
    SELECT p.driver_id,
           max(u.full_name)                                   AS nombre,
           max(u.phone)                                       AS celular,
           count(*)                                           AS intentos,
           (array_agg(p.amount ORDER BY p.created_at DESC))[1] AS monto,
           (array_agg(coalesce(p.epayco_estado, 'sin respuesta de ePayco') ORDER BY p.created_at DESC))[1] AS estado,
           (array_agg(p.epayco_motivo ORDER BY p.created_at DESC))[1] AS motivo,
           (array_agg(p.epayco_medio ORDER BY p.created_at DESC))[1]  AS medio,
           max(p.created_at)                                  AS ultimo,
           array_agg(p.id)                                    AS ids
    FROM public.ag_wallet_payments p
    JOIN public.ag_drivers d ON d.id = p.driver_id
    JOIN public.ag_users u   ON u.id = d.ag_user_id
    WHERE p.status IN ('pending', 'rejected', 'failed')
      AND p.aviso_admin_at IS NULL
      AND p.created_at BETWEEN now() - interval '48 hours' AND now() - interval '30 minutes'
      -- si después logró recargar, no hay nada que avisar
      AND NOT EXISTS (SELECT 1 FROM public.ag_wallet_payments a
                       WHERE a.driver_id = p.driver_id AND a.status = 'approved' AND a.created_at > p.created_at)
      -- máximo un aviso cada 6 h por conductor
      AND NOT EXISTS (SELECT 1 FROM public.ag_wallet_payments b
                       WHERE b.driver_id = p.driver_id AND b.aviso_admin_at > now() - interval '6 hours')
    GROUP BY p.driver_id
  LOOP
    UPDATE public.ag_wallet_payments SET aviso_admin_at = now() WHERE id = ANY(r.ids);
    v_tel := ltrim(coalesce(r.celular, ''), '+');

    BEGIN
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/ag-whatsapp',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body    := jsonb_build_object('to', 'admin', 'event', 'error_alert', 'data', jsonb_build_object(
          'kind',    'info',
          'context', '💳 Recarga no completada: ' || coalesce(r.nombre, 'conductor'),
          'message', 'Celular: ' || coalesce(r.celular, 'sin celular')
                     || ' | Monto: $' || to_char(r.monto, 'FM999G999G999')
                     || ' | Intentos: ' || r.intentos
                     || ' | ePayco: ' || r.estado
                     || coalesce(' (' || r.motivo || ')', '')
                     || coalesce(' | Medio: ' || r.medio, '')
                     || ' | Último intento: ' || to_char(r.ultimo AT TIME ZONE 'America/Bogota', 'DD/MM HH12:MI AM')
                     || CASE WHEN v_tel <> '' THEN ' | Escríbele: wa.me/' || v_tel ELSE '' END)),
        timeout_milliseconds := 15000);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Ayuda automática al conductor: ag-whatsapp le pregunta en qué paso se quedó (lista de
    -- opciones gratis si tiene la ventana de 24 h abierta; si no, la plantilla UTILITY
    -- movi_recarga_no_completada, y solo si Meta la aprobó como UTILITY).
    IF v_tel <> '' THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_url || '/functions/v1/ag-whatsapp',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
          body    := jsonb_build_object('_internal_event', 'ayuda_recarga', 'telefono', v_tel),
          timeout_milliseconds := 15000);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.ag_alertar_recargas_fallidas() FROM PUBLIC, anon, authenticated;
