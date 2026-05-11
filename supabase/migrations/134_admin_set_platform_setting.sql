-- =============================================================================
-- 134: RPC seguro para escritura de platform_settings desde el admin
-- ----------------------------------------------------------------------------
-- La política RLS de platform_settings (migración 040) fue declarada como
-- FOR ALL USING (...) sin WITH CHECK explícito. Dependiendo del motor
-- Postgres/PostgREST, eso bloquea la creación/actualización de filas vía
-- upsert del cliente, aunque el usuario sí sea admin.
--
-- Esta migración agrega un RPC SECURITY DEFINER que:
--   1. Verifica que auth.uid() tenga rol admin/dev.
--   2. Hace el UPSERT directamente (el SECURITY DEFINER corre como owner,
--      esquivando RLS por diseño).
--   3. Retorna jsonb con el resultado.
--
-- Además refuerza la policy original agregando WITH CHECK explícito por si
-- algún otro flujo depende del upsert directo.
-- =============================================================================

-- ── 1) Reforzar policy con WITH CHECK explícito ─────────────────────────────
DROP POLICY IF EXISTS "platform_settings_admin_write" ON platform_settings;

CREATE POLICY "platform_settings_admin_write"
  ON platform_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );

-- ── 2) RPC SECURITY DEFINER para escritura garantizada ──────────────────────
CREATE OR REPLACE FUNCTION admin_set_platform_setting(
  p_key   text,
  p_value text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Verificar autenticación
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- Verificar rol admin/dev
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'dev') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden', 'role', v_role);
  END IF;

  -- Validar entrada
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_key');
  END IF;

  -- Upsert
  INSERT INTO platform_settings (key, value, updated_at)
  VALUES (p_key, COALESCE(p_value, ''), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();

  RETURN jsonb_build_object('ok', true, 'key', p_key, 'value', p_value);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'db_error', 'message', SQLERRM);
END;
$$;

-- El RPC es ejecutable por cualquier autenticado (la validación de rol va
-- dentro de la función)
GRANT EXECUTE ON FUNCTION admin_set_platform_setting(text, text) TO authenticated;
