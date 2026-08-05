-- =============================================================================
-- Migration 195: documentos por vehículo (SOAT, tecnomecánica, seguro, fotos)
-- en vez de por conductor -- pedido explícito del usuario 2026-08-05: un
-- conductor con carro Y moto guardados debe poder tener un SOAT distinto
-- para cada uno, no uno solo compartido.
--
-- La licencia de conducción y la cédula NO se tocan -- son del conductor
-- como persona, no del vehículo, así que siguen en ag_driver_documents.
--
-- Hallazgo que esto obligó a corregir primero: ag_driver_vehicles (la tabla
-- de "varios vehículos por conductor") tenía CERO filas para TODOS los
-- conductores reales, incluso el único activo hoy -- porque el registro
-- (normal y rápido) nunca creaba una fila ahí para el vehículo principal,
-- solo cuando alguien usaba "Agregar vehículo" explícitamente. Sin una fila
-- "actual" real, no hay contra qué vehículo colgar los documentos. Se
-- soluciona con un trigger que mantiene sincronizada automáticamente la
-- fila "actual" de ag_driver_vehicles cada vez que cambian los datos del
-- vehículo en ag_drivers -- cubre registro normal, registro rápido,
-- graduación de quick a completo, y cambio de vehículo (migración 194),
-- sin tener que tocar cada uno de esos flujos por separado.
-- =============================================================================

-- ── El formulario completo de registro usa sedan/suv/hatchback/moto/van;
--    "Agregar vehículo" usa carro/moto/suv/van/camion -- se unifican los dos
--    vocabularios en el mismo CHECK para que el trigger de sincronización de
--    abajo no falle con el vehículo principal de un conductor registrado por
--    el formulario completo. ────────────────────────────────────────────────
ALTER TABLE public.ag_driver_vehicles DROP CONSTRAINT IF EXISTS ag_driver_vehicles_vehicle_type_check;
ALTER TABLE public.ag_driver_vehicles ADD CONSTRAINT ag_driver_vehicles_vehicle_type_check
  CHECK (vehicle_type = ANY (ARRAY['carro','moto','suv','van','camion','sedan','hatchback']));

-- ── Mantiene sincronizada la fila "actual" de ag_driver_vehicles con los
--    datos reales del conductor en ag_drivers, sin importar qué código la
--    cambió. Si no existe fila "actual" todavía, la crea. ───────────────────
CREATE OR REPLACE FUNCTION public.ag_sync_current_vehicle_from_driver()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.vehicle_type IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.ag_driver_vehicles
  SET vehicle_type = NEW.vehicle_type,
      brand        = NEW.vehicle_brand,
      model        = NEW.vehicle_model,
      year         = NEW.vehicle_year,
      color        = NEW.vehicle_color,
      plate        = COALESCE(NEW.plate, NEW.vehicle_plate)
  WHERE driver_id = NEW.id AND is_current = true;

  IF NOT FOUND THEN
    INSERT INTO public.ag_driver_vehicles (driver_id, vehicle_type, brand, model, year, color, plate, is_active, is_current)
    VALUES (NEW.id, NEW.vehicle_type, NEW.vehicle_brand, NEW.vehicle_model, NEW.vehicle_year, NEW.vehicle_color, COALESCE(NEW.plate, NEW.vehicle_plate), true, true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_sync_current_vehicle ON public.ag_drivers;
CREATE TRIGGER trg_ag_sync_current_vehicle
  AFTER INSERT OR UPDATE OF vehicle_type, plate, vehicle_plate, vehicle_brand, vehicle_model, vehicle_year, vehicle_color
  ON public.ag_drivers
  FOR EACH ROW EXECUTE FUNCTION ag_sync_current_vehicle_from_driver();

-- ── Backfill: conductores que ya existían antes de este trigger y aún no
--    tienen fila "actual". Insert directo -- un UPDATE de updated_at NO
--    dispara el trigger de arriba porque esa columna no está en su lista
--    (bug real encontrado al probar: el primer intento con updated_at no
--    creó ninguna fila). ──────────────────────────────────────────────────
INSERT INTO public.ag_driver_vehicles (driver_id, vehicle_type, brand, model, year, color, plate, is_active, is_current)
SELECT id, vehicle_type, vehicle_brand, vehicle_model, vehicle_year, vehicle_color, COALESCE(plate, vehicle_plate), true, true
FROM public.ag_drivers
WHERE vehicle_type IS NOT NULL
  AND id NOT IN (SELECT driver_id FROM public.ag_driver_vehicles WHERE is_current = true);

-- =============================================================================
-- Tabla de documentos POR VEHÍCULO
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ag_vehicle_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id       uuid NOT NULL REFERENCES public.ag_driver_vehicles(id) ON DELETE CASCADE,
  driver_id        uuid NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  doc_type         text NOT NULL CHECK (doc_type IN ('soat', 'tecnomecanica', 'insurance', 'vehicle_front', 'vehicle_back')),
  file_url         text NOT NULL,
  file_path        text NOT NULL,
  number           text,
  expires_at       date,
  status           text NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, doc_type)
);

CREATE INDEX IF NOT EXISTS ag_vehicle_documents_driver_idx ON public.ag_vehicle_documents (driver_id);

ALTER TABLE public.ag_vehicle_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_vehicle_docs_self" ON public.ag_vehicle_documents;
CREATE POLICY "ag_vehicle_docs_self" ON public.ag_vehicle_documents FOR ALL
  USING (
    driver_id IN (
      SELECT ag_drivers.id FROM public.ag_drivers
      WHERE ag_drivers.ag_user_id IN (SELECT ag_users.id FROM public.ag_users WHERE ag_users.auth_user_id = auth.uid())
    )
  );

-- Migra cualquier documento vehicular que hubiera quedado guardado en el
-- esquema viejo (por conductor) hacia el vehículo actual del conductor --
-- en la práctica no había ninguno todavía, pero se deja por completitud.
INSERT INTO public.ag_vehicle_documents (vehicle_id, driver_id, doc_type, file_url, file_path, number, expires_at, status, rejection_reason)
SELECT v.id, dd.driver_id, dd.doc_type, dd.file_url, dd.file_path, dd.number, dd.expires_at, dd.status, dd.rejection_reason
FROM public.ag_driver_documents dd
JOIN public.ag_driver_vehicles v ON v.driver_id = dd.driver_id AND v.is_current = true
WHERE dd.doc_type IN ('soat', 'tecnomecanica', 'insurance', 'vehicle_front', 'vehicle_back')
ON CONFLICT (vehicle_id, doc_type) DO NOTHING;

DELETE FROM public.ag_driver_documents WHERE doc_type IN ('soat', 'tecnomecanica', 'insurance', 'vehicle_front', 'vehicle_back');

-- ── Trigger de recálculo -- mismo patrón que ya existía para
--    ag_driver_documents (migración 193), ahora también en la tabla nueva. ──
CREATE OR REPLACE FUNCTION public.ag_trg_recompute_driver_docs_vehicle()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.ag_recompute_driver_document_status(NEW.driver_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_recompute_driver_docs_vehicle ON public.ag_vehicle_documents;
CREATE TRIGGER trg_ag_recompute_driver_docs_vehicle
  AFTER INSERT OR UPDATE ON public.ag_vehicle_documents
  FOR EACH ROW EXECUTE FUNCTION ag_trg_recompute_driver_docs_vehicle();

-- ── ag_recompute_driver_document_status: ahora revisa licencia (por
--    conductor, ag_driver_documents) + SOAT/tecnomecánica/seguro del
--    vehículo ACTUAL (ag_vehicle_documents) -- no de vehículos guardados
--    que el conductor no está usando ahora mismo. ───────────────────────────
CREATE OR REPLACE FUNCTION public.ag_recompute_driver_document_status(p_driver_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_has_expired        boolean;
  v_current_vehicle_id uuid;
BEGIN
  SELECT id INTO v_current_vehicle_id
  FROM public.ag_driver_vehicles WHERE driver_id = p_driver_id AND is_current = true LIMIT 1;

  SELECT
    EXISTS(
      SELECT 1 FROM public.ag_driver_documents
      WHERE driver_id = p_driver_id AND doc_type = 'license'
        AND expires_at IS NOT NULL AND expires_at < CURRENT_DATE
    )
    OR (
      v_current_vehicle_id IS NOT NULL AND EXISTS(
        SELECT 1 FROM public.ag_vehicle_documents
        WHERE vehicle_id = v_current_vehicle_id
          AND doc_type IN ('soat', 'tecnomecanica', 'insurance')
          AND expires_at IS NOT NULL AND expires_at < CURRENT_DATE
      )
    )
  INTO v_has_expired;

  UPDATE public.ag_drivers
  SET documents_expired = v_has_expired,
      is_online = CASE WHEN v_has_expired THEN false ELSE is_online END
  WHERE id = p_driver_id;
END;
$$;

-- ── ag_get_driver_document_alerts: mismo alcance -- licencia del conductor
--    + documentos del vehículo actual, no de vehículos guardados sin usar. ──
CREATE OR REPLACE FUNCTION public.ag_get_driver_document_alerts(p_driver_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result             jsonb;
  v_current_vehicle_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.id = p_driver_id AND u.auth_user_id = auth.uid()
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT id INTO v_current_vehicle_id
  FROM public.ag_driver_vehicles WHERE driver_id = p_driver_id AND is_current = true LIMIT 1;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'expires_at')), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'doc_type', doc_type, 'expires_at', expires_at,
      'days_left', (expires_at - CURRENT_DATE), 'is_expired', expires_at < CURRENT_DATE
    ) AS row_data
    FROM public.ag_driver_documents
    WHERE driver_id = p_driver_id AND doc_type = 'license'
      AND expires_at IS NOT NULL AND expires_at <= CURRENT_DATE + INTERVAL '5 days'
    UNION ALL
    SELECT jsonb_build_object(
      'doc_type', doc_type, 'expires_at', expires_at,
      'days_left', (expires_at - CURRENT_DATE), 'is_expired', expires_at < CURRENT_DATE
    ) AS row_data
    FROM public.ag_vehicle_documents
    WHERE vehicle_id = v_current_vehicle_id
      AND doc_type IN ('soat', 'tecnomecanica', 'insurance')
      AND expires_at IS NOT NULL AND expires_at <= CURRENT_DATE + INTERVAL '5 days'
  ) alerts;

  RETURN v_result;
END;
$$;

-- ── Barrido diario: ahora recorre conductores con documentos relevantes en
--    CUALQUIERA de las dos tablas. ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_expire_driver_documents_daily()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT driver_id FROM public.ag_driver_documents
    WHERE doc_type = 'license' AND expires_at IS NOT NULL
    UNION
    SELECT driver_id FROM public.ag_vehicle_documents
    WHERE doc_type IN ('soat', 'tecnomecanica', 'insurance') AND expires_at IS NOT NULL
  LOOP
    PERFORM public.ag_recompute_driver_document_status(r.driver_id);
  END LOOP;
END;
$$;

-- ── ag_set_current_vehicle (migración 194): al cambiar de vehículo actual,
--    también hay que reevaluar el bloqueo por documentos -- el vehículo
--    nuevo puede tener SOAT vencido, o el anterior lo tenía y el nuevo no. ──
CREATE OR REPLACE FUNCTION public.ag_set_current_vehicle(p_driver_id uuid, p_vehicle_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_vehicle record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.id = p_driver_id AND u.auth_user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  IF EXISTS (SELECT 1 FROM public.ag_trip_requests WHERE driver_id = p_driver_id AND status = 'accepted') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No puedes cambiar de vehículo mientras tienes un viaje en curso.');
  END IF;

  SELECT * INTO v_vehicle FROM public.ag_driver_vehicles
  WHERE id = p_vehicle_id AND driver_id = p_driver_id AND is_active = true;
  IF v_vehicle IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Vehículo no encontrado.');
  END IF;

  UPDATE public.ag_driver_vehicles SET is_current = false WHERE driver_id = p_driver_id;
  UPDATE public.ag_driver_vehicles SET is_current = true WHERE id = p_vehicle_id;

  UPDATE public.ag_drivers
  SET vehicle_type   = v_vehicle.vehicle_type,
      plate          = v_vehicle.plate,
      vehicle_plate  = v_vehicle.plate,
      vehicle_brand  = v_vehicle.brand,
      vehicle_model  = v_vehicle.model,
      vehicle_year   = v_vehicle.year,
      vehicle_color  = v_vehicle.color,
      updated_at     = now()
  WHERE id = p_driver_id;

  PERFORM public.ag_recompute_driver_document_status(p_driver_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;
