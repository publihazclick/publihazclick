-- =============================================================================
-- Migration 079: Sistema de notificaciones de usuario + broadcasts de admin
-- - user_notifications: notificaciones individuales por usuario
-- - admin_broadcasts: mensajes masivos del admin (se borran en 3 días)
-- =============================================================================

-- ── 1. Tabla de notificaciones de usuario ─────────────────────────────────
CREATE TABLE IF NOT EXISTS user_notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  message      text        NOT NULL,
  type         text        NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning')),
  is_read      boolean     NOT NULL DEFAULT false,
  broadcast_id uuid,       -- si viene de un broadcast masivo
  expires_at   timestamptz, -- auto-eliminar después de esta fecha
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notif_user ON user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notif_broadcast ON user_notifications(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_user_notif_expires ON user_notifications(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_reads_own_notifications" ON user_notifications;
CREATE POLICY "user_reads_own_notifications" ON user_notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_updates_own_notifications" ON user_notifications;
CREATE POLICY "user_updates_own_notifications" ON user_notifications FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "service_manages_notifications" ON user_notifications;
CREATE POLICY "service_manages_notifications" ON user_notifications FOR ALL
  USING (true) WITH CHECK (true);

-- ── 2. Tabla de broadcasts del admin ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  message      text        NOT NULL,
  type         text        NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning')),
  sent_by      uuid        REFERENCES profiles(id),
  recipient_count integer  DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE admin_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_manages_broadcasts" ON admin_broadcasts;
CREATE POLICY "service_manages_broadcasts" ON admin_broadcasts FOR ALL
  USING (true) WITH CHECK (true);

-- ── 3. Función: enviar broadcast a todos los usuarios ─────────────────────
CREATE OR REPLACE FUNCTION send_broadcast_notification(
  p_title      text,
  p_message    text,
  p_type       text DEFAULT 'info',
  p_sent_by    uuid DEFAULT NULL,
  p_expires_days integer DEFAULT 3
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_broadcast_id uuid;
  v_expires_at   timestamptz;
  v_count        integer;
BEGIN
  v_expires_at := now() + (p_expires_days || ' days')::interval;

  -- Crear registro de broadcast
  INSERT INTO admin_broadcasts (title, message, type, sent_by, expires_at)
  VALUES (p_title, p_message, p_type, p_sent_by, v_expires_at)
  RETURNING id INTO v_broadcast_id;

  -- Insertar notificación para cada usuario activo
  INSERT INTO user_notifications (user_id, title, message, type, broadcast_id, expires_at)
  SELECT id, p_title, p_message, p_type, v_broadcast_id, v_expires_at
  FROM profiles
  WHERE role IN ('advertiser', 'admin', 'dev', 'guest');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Actualizar conteo
  UPDATE admin_broadcasts SET recipient_count = v_count WHERE id = v_broadcast_id;

  RETURN jsonb_build_object('ok', true, 'broadcast_id', v_broadcast_id, 'recipients', v_count);
END;
$$;

-- ── 4. Función: eliminar notificaciones expiradas ─────────────────────────
CREATE OR REPLACE FUNCTION cleanup_expired_notifications()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM user_notifications WHERE expires_at IS NOT NULL AND expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ── 5. Función: eliminar un broadcast y sus notificaciones ────────────────
CREATE OR REPLACE FUNCTION delete_broadcast(p_broadcast_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM user_notifications WHERE broadcast_id = p_broadcast_id;
  DELETE FROM admin_broadcasts WHERE id = p_broadcast_id;
END;
$$;
