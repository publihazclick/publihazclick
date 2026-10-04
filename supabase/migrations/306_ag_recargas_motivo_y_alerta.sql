-- 306: recargas de saldo de conductor -- guardar el motivo de ePayco y avisar quién no logra recargar.
--
-- POR QUÉ (2026-10-04): el usuario notó que los conductores intentan recargar y "quedan rechazadas".
-- En la base: desde el 29-ago NINGUNA recarga se aprobó (25 intentos, todos 'pending' y sin
-- epayco_ref). ag-epayco-webhook ignoraba cualquier respuesta que no fuera "aceptada" sin guardar
-- nada, así que no había forma de saber si el banco rechazó, si el conductor abandonó el pago o si
-- ePayco nunca avisó. Desde esta migración el webhook guarda estado, motivo y medio de pago.
--
-- Además, pedido del usuario: "que me lleguen los datos de quien está intentando recargar para
-- poder contactar y ayudar de manera automática a quien no logra recargar".
-- ag_alertar_recargas_fallidas() (cron cada 10 min):
--   - Toma los intentos que llevan más de 20 min sin aprobarse (últimas 48 h), agrupados por
--     conductor, sin una recarga aprobada después.
--   - Le manda al admin (número de soporte) nombre, celular, monto, intentos, lo que dijo ePayco y
--     un enlace wa.me para escribirle con un toque.
--   - Si el conductor tiene abierta la ventana de 24 h del WhatsApp de conductores, le escribe
--     gratis ofreciéndole ayuda (fuera de la ventana no se le escribe: sería pago).
--   - Un aviso por intento (aviso_admin_at), y como máximo uno cada 6 h por conductor.

ALTER TABLE public.ag_wallet_payments
  ADD COLUMN IF NOT EXISTS epayco_cod     text,
  ADD COLUMN IF NOT EXISTS epayco_estado  text,
  ADD COLUMN IF NOT EXISTS epayco_motivo  text,
  ADD COLUMN IF NOT EXISTS epayco_medio   text,
  ADD COLUMN IF NOT EXISTS epayco_at      timestamptz,
  ADD COLUMN IF NOT EXISTS aviso_admin_at timestamptz;

-- Los intentos viejos ya no se avisan (solo los nuevos desde hoy).
UPDATE public.ag_wallet_payments SET aviso_admin_at = now()
 WHERE aviso_admin_at IS NULL AND created_at < now() - interval '48 hours';

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

    -- Ayuda automática al conductor, solo si la conversación está abierta (gratis).
    IF v_tel <> '' AND EXISTS (SELECT 1 FROM public.ag_wa_message_log l
                                WHERE l.wa_phone = v_tel AND l.role = 'conductor' AND l.direction = 'in'
                                  AND l.created_at > now() - interval '23 hours') THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_url || '/functions/v1/ag-whatsapp',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
          body    := jsonb_build_object('phone', v_tel, 'as', 'conductor', 'message',
            'Hola ' || split_part(coalesce(r.nombre, ''), ' ', 1) || ', vimos que intentaste recargar saldo en Movi y el pago no se completó. '
            || 'Ya le avisamos al equipo para ayudarte. Cuéntanos aquí qué medio de pago usaste (PSE, Nequi, tarjeta, efectivo) '
            || 'y qué mensaje te salió, y te ayudamos a terminar la recarga.'),
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

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'movi-alertar-recargas-fallidas';
SELECT cron.schedule('movi-alertar-recargas-fallidas', '*/10 * * * *', $c$SELECT public.ag_alertar_recargas_fallidas();$c$);
