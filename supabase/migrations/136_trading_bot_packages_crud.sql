-- =============================================================================
-- 136: Trading Bot AI — CRUD admin para el catálogo de paquetes
-- ----------------------------------------------------------------------------
-- RPCs SECURITY DEFINER que validan rol admin/dev internamente. Esto evita
-- fricciones con RLS y mantiene la escritura confinada a admins.
-- =============================================================================

-- Helper: validación consistente
CREATE OR REPLACE FUNCTION _tb_assert_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin','dev') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ── Crear paquete ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_create_trading_package(
  p_name                text,
  p_price_usd           numeric,
  p_monthly_return_pct  numeric DEFAULT 2.0,
  p_description         text    DEFAULT NULL,
  p_display_order       int     DEFAULT 999,
  p_is_active           boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM _tb_assert_admin();

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_name');
  END IF;
  IF p_price_usd IS NULL OR p_price_usd <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_price');
  END IF;

  INSERT INTO trading_bot_packages (name, price_usd, monthly_return_pct, description, display_order, is_active)
  VALUES (trim(p_name), p_price_usd, COALESCE(p_monthly_return_pct, 2.0), p_description, COALESCE(p_display_order, 999), COALESCE(p_is_active, true))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_name');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'db_error', 'message', SQLERRM);
END;
$$;

-- ── Actualizar paquete ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_update_trading_package(
  p_id                  uuid,
  p_name                text    DEFAULT NULL,
  p_price_usd           numeric DEFAULT NULL,
  p_monthly_return_pct  numeric DEFAULT NULL,
  p_description         text    DEFAULT NULL,
  p_display_order       int     DEFAULT NULL,
  p_is_active           boolean DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _tb_assert_admin();

  UPDATE trading_bot_packages
  SET name               = COALESCE(p_name, name),
      price_usd          = COALESCE(p_price_usd, price_usd),
      monthly_return_pct = COALESCE(p_monthly_return_pct, monthly_return_pct),
      description        = COALESCE(p_description, description),
      display_order      = COALESCE(p_display_order, display_order),
      is_active          = COALESCE(p_is_active, is_active)
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_name');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'db_error', 'message', SQLERRM);
END;
$$;

-- ── Eliminar paquete ────────────────────────────────────────────────────────
-- Si tiene asignaciones activas (user_trading_packages), se bloquea para no
-- romper los datos del usuario. Si solo está inactivo, se permite.
CREATE OR REPLACE FUNCTION admin_delete_trading_package(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_active_count int;
BEGIN
  PERFORM _tb_assert_admin();

  SELECT count(*)::int INTO v_active_count
  FROM user_trading_packages
  WHERE package_id = p_id AND is_active = true;

  IF v_active_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'has_active_assignments',
      'count', v_active_count
    );
  END IF;

  DELETE FROM trading_bot_packages WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'has_assignments');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'db_error', 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_trading_package(text, numeric, numeric, text, int, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_trading_package(uuid, text, numeric, numeric, text, int, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_trading_package(uuid) TO authenticated;
