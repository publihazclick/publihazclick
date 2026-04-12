-- ============================================================================
-- 095: Monitor diario de salud de la integración ePayco
--
-- Corre todos los días a las 00:05 hora Colombia (05:05 UTC) vía pg_cron.
-- Detecta pagos pending > 1h, revisa stats de últimas 24h, y si encuentra
-- alguna anomalía envía email a publihazclick@gmail.com vía Edge Function
-- send-alert-email (que usa Resend).
--
-- Depende de: pg_cron, pg_net (net.http_post), Edge Function send-alert-email
-- ============================================================================

-- ── 1. Tabla de logs de salud ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS epayco_health_log (
  id              BIGSERIAL PRIMARY KEY,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL CHECK (status IN ('ok','warn','alert')),
  total_24h       INT NOT NULL DEFAULT 0,
  approved_24h    INT NOT NULL DEFAULT 0,
  pending_24h     INT NOT NULL DEFAULT 0,
  rejected_24h    INT NOT NULL DEFAULT 0,
  stuck_pending   INT NOT NULL DEFAULT 0,  -- pending con >1h de vida
  anomalies       JSONB NOT NULL DEFAULT '[]'::jsonb,
  email_sent      BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_epayco_health_log_checked_at
  ON epayco_health_log(checked_at DESC);

-- Solo admins pueden leer el histórico
ALTER TABLE epayco_health_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_epayco_health" ON epayco_health_log;
CREATE POLICY "admin_read_epayco_health" ON epayco_health_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','dev')
    )
  );

-- ── 2. Función de chequeo ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_epayco_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_total        INT;
  v_approved     INT;
  v_pending      INT;
  v_rejected     INT;
  v_stuck        INT;
  v_status       TEXT := 'ok';
  v_anomalies    JSONB := '[]'::jsonb;
  v_log_id       BIGINT;
  v_email_sent   BOOLEAN := false;
  v_subject      TEXT;
  v_html         TEXT;
  v_anon_jwt     TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0a2RtZGh6b3V6dnpneXV6Z2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTM3NjcsImV4cCI6MjA4Njg2OTc2N30._vXkGfjlK_lql_KcE9nfBGP8VvkCJXQctNpuZDnYFz8';
BEGIN
  -- Stats últimas 24h
  SELECT
    COUNT(*) FILTER (WHERE status = 'approved'),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status IN ('rejected','failed')),
    COUNT(*)
  INTO v_approved, v_pending, v_rejected, v_total
  FROM payments
  WHERE gateway = 'epayco'
    AND created_at >= NOW() - INTERVAL '24 hours';

  -- Pagos pending con más de 1 hora (sospechosos)
  SELECT COUNT(*)::INT INTO v_stuck
  FROM payments
  WHERE gateway = 'epayco'
    AND status = 'pending'
    AND created_at < NOW() - INTERVAL '1 hour'
    AND created_at >= NOW() - INTERVAL '24 hours';

  -- Reglas de anomalía
  IF v_stuck > 0 THEN
    v_status := 'alert';
    v_anomalies := v_anomalies || jsonb_build_object(
      'type', 'stuck_pending',
      'count', v_stuck,
      'severity', 'alert',
      'message', v_stuck || ' pago(s) ePayco pending por más de 1 hora en las últimas 24h'
    );
  END IF;

  IF v_total >= 3 AND v_approved = 0 THEN
    v_status := 'alert';
    v_anomalies := v_anomalies || jsonb_build_object(
      'type', 'no_approvals',
      'total_attempts', v_total,
      'severity', 'alert',
      'message', 'Hubo ' || v_total || ' intentos de pago ePayco en 24h pero ninguno se aprobó'
    );
  END IF;

  IF v_total = 0 AND v_status = 'ok' THEN
    v_status := 'warn';
    v_anomalies := v_anomalies || jsonb_build_object(
      'type', 'no_activity',
      'severity', 'warn',
      'message', 'No hubo intentos de pago ePayco en las últimas 24h'
    );
  END IF;

  -- ── 3. Insertar log ──────────────────────────────────────────────────────
  INSERT INTO epayco_health_log (
    status, total_24h, approved_24h, pending_24h, rejected_24h,
    stuck_pending, anomalies
  ) VALUES (
    v_status, v_total, v_approved, v_pending, v_rejected,
    v_stuck, v_anomalies
  )
  RETURNING id INTO v_log_id;

  -- ── 4. Enviar email solo si hay alerta real ──────────────────────────────
  IF v_status = 'alert' THEN
    v_subject := '🚨 Alerta ePayco Publihazclick — ' ||
                 to_char(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI');
    v_html :=
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;padding:32px;border-radius:16px;">' ||
      '<h2 style="color:#ef4444;margin-top:0;">🚨 Integración ePayco con problemas</h2>' ||
      '<p style="color:#94a3b8;">Chequeo automático a las ' ||
      to_char(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI') ||
      ' (Colombia).</p>' ||
      '<table style="width:100%;border-collapse:collapse;margin:24px 0;background:#111827;border-radius:8px;overflow:hidden;">' ||
      '<tr><td style="padding:12px;border-bottom:1px solid #1e293b;color:#94a3b8;">Total intentos (24h)</td><td style="padding:12px;border-bottom:1px solid #1e293b;text-align:right;color:#fff;font-weight:bold;">' || v_total || '</td></tr>' ||
      '<tr><td style="padding:12px;border-bottom:1px solid #1e293b;color:#94a3b8;">✅ Aprobados</td><td style="padding:12px;border-bottom:1px solid #1e293b;text-align:right;color:#22c55e;font-weight:bold;">' || v_approved || '</td></tr>' ||
      '<tr><td style="padding:12px;border-bottom:1px solid #1e293b;color:#94a3b8;">⏸️ Pending</td><td style="padding:12px;border-bottom:1px solid #1e293b;text-align:right;color:#f59e0b;font-weight:bold;">' || v_pending || '</td></tr>' ||
      '<tr><td style="padding:12px;border-bottom:1px solid #1e293b;color:#94a3b8;">❌ Rechazados</td><td style="padding:12px;border-bottom:1px solid #1e293b;text-align:right;color:#94a3b8;font-weight:bold;">' || v_rejected || '</td></tr>' ||
      '<tr><td style="padding:12px;color:#94a3b8;">🚨 Pending >1h (sospechosos)</td><td style="padding:12px;text-align:right;color:#ef4444;font-weight:bold;">' || v_stuck || '</td></tr>' ||
      '</table>' ||
      '<h3 style="color:#ef4444;">Anomalías detectadas</h3>' ||
      '<pre style="background:#1e293b;padding:16px;border-radius:8px;color:#e2e8f0;overflow:auto;font-size:12px;">' || v_anomalies::text || '</pre>' ||
      '<p style="color:#475569;font-size:12px;margin-top:32px;">Log ID: ' || v_log_id || ' · Chequeo automático diario</p>' ||
      '</div>';

    -- Llamar a la Edge Function send-alert-email
    BEGIN
      PERFORM net.http_post(
        url := 'https://btkdmdhzouzvzgyuzgbh.supabase.co/functions/v1/send-alert-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_jwt
        ),
        body := jsonb_build_object(
          'subject', v_subject,
          'html', v_html
        )
      );
      v_email_sent := true;
    EXCEPTION WHEN OTHERS THEN
      v_email_sent := false;
    END;

    UPDATE epayco_health_log SET email_sent = v_email_sent WHERE id = v_log_id;
  END IF;

  RETURN jsonb_build_object(
    'log_id', v_log_id,
    'status', v_status,
    'total_24h', v_total,
    'approved_24h', v_approved,
    'pending_24h', v_pending,
    'rejected_24h', v_rejected,
    'stuck_pending', v_stuck,
    'anomalies', v_anomalies,
    'email_sent', v_email_sent
  );
END;
$$;

-- ── 5. Cron job: diario 00:05 Colombia (05:05 UTC) ──────────────────────────
-- Eliminar versión previa si existe (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('epayco-health-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'epayco-health-daily',
  '5 5 * * *',
  'SELECT check_epayco_health();'
);

-- ── 6. Función helper para consultar fácilmente los últimos N logs ──────────
CREATE OR REPLACE FUNCTION get_epayco_health_recent(p_days INT DEFAULT 7)
RETURNS TABLE (
  id BIGINT,
  checked_at TIMESTAMPTZ,
  status TEXT,
  total_24h INT,
  approved_24h INT,
  pending_24h INT,
  stuck_pending INT,
  anomalies JSONB,
  email_sent BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id, checked_at, status, total_24h, approved_24h,
         pending_24h, stuck_pending, anomalies, email_sent
  FROM epayco_health_log
  WHERE checked_at >= NOW() - (p_days || ' days')::INTERVAL
  ORDER BY checked_at DESC;
$$;

GRANT EXECUTE ON FUNCTION check_epayco_health() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_epayco_health_recent(INT) TO authenticated;
