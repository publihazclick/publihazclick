-- 307: la ayuda al conductor que no logra recargar pasa a ser una conversación guiada.
--
-- POR QUÉ (2026-10-04): pedido del usuario: "una atención coherente, una automatización que le
-- escriba de manera automática a una persona que queda rechazada la recarga para saber en qué paso
-- se están quedando". La 306 solo mandaba un texto suelto (y solo con ventana abierta). Ahora el cron
-- llama el evento 'ayuda_recarga' de ag-whatsapp, que le pregunta en qué paso tuvo problema con una
-- lista de 6 opciones (no abrió el pago / banco o Nequi rechazó / no sé cómo pagar / no entiendo el
-- cobro / pagué y no veo saldo / otro). Cada respuesta tiene su ayuda, queda guardada en
-- ag_wallet_payments.ayuda_paso y le llega al admin. Lo demás de la 306 queda igual.

ALTER TABLE public.ag_wallet_payments
  ADD COLUMN IF NOT EXISTS ayuda_paso text,
  ADD COLUMN IF NOT EXISTS ayuda_at   timestamptz;

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
      AND p.created_at BETWEEN now() - interval '48 hours' AND now() - interval '20 minutes'
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
