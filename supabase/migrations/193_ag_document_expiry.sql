-- =============================================================================
-- Migration 193: validación de vencimiento de documentos (licencia, SOAT,
-- tecnomecánica, seguro) -- pedido explícito del usuario 2026-08-05.
--
-- Hallazgo importante antes de implementar (ver respuesta al usuario): hoy
-- NO existe ningún chequeo de vencimiento real. Solo había un helper de UI
-- (docIsExpiringSoon, ventana de 30 días) usado nada más si el conductor
-- entraba manualmente a la sección de documentos -- sin aviso proactivo, sin
-- bloqueo real. Tampoco existe todavía una pantalla de revisión/aprobación
-- de admin para estos documentos (a diferencia del status 'approved' que
-- se menciona en la UI, nada en el código lo pone nunca) -- por eso este
-- bloqueo se basa directamente en la fecha de vencimiento (expires_at), NO
-- en un estado 'approved' que en la práctica nunca se llega a asignar. Un
-- conductor puede desbloquearse solo con volver a subir el documento con
-- fecha de vencimiento futura, sin depender de una revisión manual que hoy
-- no existe.
--
-- Qué hace esto:
-- 1. ag_get_driver_document_alerts(driver_id): documentos vencidos o que
--    vencen en los próximos 5 días -- para el banner diario en la app.
-- 2. ag_recompute_driver_document_status(driver_id): marca ag_drivers.
--    documents_expired = true si hay algún documento vencido, y en ese caso
--    fuerza is_online = false (no puede seguir recibiendo viajes). Se
--    dispara automáticamente cada vez que el conductor sube/actualiza un
--    documento -- si lo renueva con fecha futura, se desbloquea al instante.
-- 3. Barrido diario (cron) para los conductores que no tocan nada pero cuyo
--    documento cruza la fecha de vencimiento solo -- sin esto, is_online no
--    se pondría en false hasta que el conductor volviera a interactuar.
-- 4. Trigger que bloquea intentar volver a poner is_online = true mientras
--    documents_expired = true -- y de paso corrige el mismo hueco que ya
--    existía con vehicle_needs_update (la bandera de vehículo muy antiguo
--    se ponía en false por el cron, pero nada impedía que el conductor
--    volviera a marcarse online igual con una actualización directa).
-- =============================================================================

ALTER TABLE public.ag_drivers
  ADD COLUMN IF NOT EXISTS documents_expired boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.ag_get_driver_document_alerts(p_driver_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.id = p_driver_id AND u.auth_user_id = auth.uid()
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'doc_type', doc_type,
    'expires_at', expires_at,
    'days_left', (expires_at - CURRENT_DATE),
    'is_expired', expires_at < CURRENT_DATE
  ) ORDER BY expires_at), '[]'::jsonb)
  INTO v_result
  FROM public.ag_driver_documents
  WHERE driver_id = p_driver_id
    AND doc_type IN ('license', 'soat', 'tecnomecanica', 'insurance')
    AND expires_at IS NOT NULL
    AND expires_at <= CURRENT_DATE + INTERVAL '5 days';

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ag_recompute_driver_document_status(p_driver_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_has_expired boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.ag_driver_documents
    WHERE driver_id = p_driver_id
      AND doc_type IN ('license', 'soat', 'tecnomecanica', 'insurance')
      AND expires_at IS NOT NULL AND expires_at < CURRENT_DATE
  ) INTO v_has_expired;

  UPDATE public.ag_drivers
  SET documents_expired = v_has_expired,
      is_online = CASE WHEN v_has_expired THEN false ELSE is_online END
  WHERE id = p_driver_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ag_trg_recompute_driver_docs()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.ag_recompute_driver_document_status(NEW.driver_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_recompute_driver_docs ON public.ag_driver_documents;
CREATE TRIGGER trg_ag_recompute_driver_docs
  AFTER INSERT OR UPDATE ON public.ag_driver_documents
  FOR EACH ROW EXECUTE FUNCTION ag_trg_recompute_driver_docs();

-- ── Barrido diario: cubre a los conductores que no suben nada pero cuyo
--    documento vence solo con el paso del tiempo. ───────────────────────────
CREATE OR REPLACE FUNCTION public.ag_expire_driver_documents_daily()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT driver_id FROM public.ag_driver_documents
    WHERE doc_type IN ('license', 'soat', 'tecnomecanica', 'insurance')
      AND expires_at IS NOT NULL
  LOOP
    PERFORM public.ag_recompute_driver_document_status(r.driver_id);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'expire-driver-documents-daily',
  '0 12 * * *', -- 7am Bogotá (UTC-5), antes de que empiecen a trabajar
  $$ SELECT public.ag_expire_driver_documents_daily(); $$
);

-- ── Bloquear pasar a is_online = true con documentos vencidos o con el
--    vehículo marcado para actualizar (esto último ya existía como bandera
--    pero nada impedía saltárselo con un update directo). ──────────────────
CREATE OR REPLACE FUNCTION public.ag_block_online_if_blocked()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_online = true AND (OLD.is_online IS DISTINCT FROM true) THEN
    IF NEW.documents_expired THEN
      RAISE EXCEPTION 'DOCUMENTOS_VENCIDOS: Tienes documentos vencidos (licencia, SOAT, tecnomecánica o seguro). Renuévalos para volver a aceptar viajes.';
    END IF;
    IF NEW.vehicle_needs_update THEN
      RAISE EXCEPTION 'VEHICULO_DEBE_ACTUALIZARSE: Actualiza los datos de tu vehículo para volver a aceptar viajes.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_block_online_if_blocked ON public.ag_drivers;
CREATE TRIGGER trg_ag_block_online_if_blocked
  BEFORE UPDATE OF is_online ON public.ag_drivers
  FOR EACH ROW EXECUTE FUNCTION ag_block_online_if_blocked();
