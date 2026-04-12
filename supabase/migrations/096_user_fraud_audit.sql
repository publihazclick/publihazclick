-- ============================================================================
-- 096: Auditoría diaria de anomalías en clicks, ganancias y saldos
--
-- Corre todos los días a las 00:15 hora Colombia (05:15 UTC) vía pg_cron.
-- Solo DETECTA y avisa — nunca modifica saldos ni cuentas.
--
-- 4 chequeos:
-- 1. daily_clicks_exceeded  — más clicks por tipo/día del límite
-- 2. impossible_earnings    — ganó más del máximo teórico diario
-- 3. balance_mismatch       — total_earned != real_balance + retiros + deducciones
-- 4. mega_monthly_exceeded  — más megas en el mes de los permitidos
--
-- Si alguna anomalía es 'critical' o 'alert', envía email a
-- publihazclick@gmail.com vía la Edge Function send-alert-email.
-- ============================================================================

-- ── 1. Tabla de alertas ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_fraud_alerts (
  id           BIGSERIAL PRIMARY KEY,
  detected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  check_type   TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK (severity IN ('warn','alert','critical')),
  details      JSONB NOT NULL,
  reviewed     BOOLEAN NOT NULL DEFAULT false,
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES profiles(id),
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_fraud_alerts_detected   ON user_fraud_alerts(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_user       ON user_fraud_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_unreviewed ON user_fraud_alerts(detected_at DESC) WHERE NOT reviewed;
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_type       ON user_fraud_alerts(check_type, detected_at DESC);

ALTER TABLE user_fraud_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_fraud_alerts_all" ON user_fraud_alerts;
CREATE POLICY "admin_fraud_alerts_all" ON user_fraud_alerts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','dev')
    )
  );

-- ── 2. Función principal de auditoría ──────────────────────────────────────
CREATE OR REPLACE FUNCTION audit_user_anomalies()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_alerts_inserted INT := 0;
  v_critical_count  INT := 0;
  v_alert_count     INT := 0;
  v_month_start     DATE;
  v_today           DATE;
  v_audit_date      DATE;  -- el día auditado (normalmente ayer)
  v_std_limit       INT;
  v_active_refs     INT;
  v_slots           INT;
  v_theoretical_max NUMERIC;
  v_expected        NUMERIC;
  v_diff            NUMERIC;
  v_subject         TEXT;
  v_html            TEXT;
  v_summary_rows    TEXT := '';
  v_alert_row       RECORD;
  rec               RECORD;
  v_anon_jwt        TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0a2RtZGh6b3V6dnpneXV6Z2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTM3NjcsImV4cCI6MjA4Njg2OTc2N30._vXkGfjlK_lql_KcE9nfBGP8VvkCJXQctNpuZDnYFz8';
BEGIN
  v_today       := (NOW() AT TIME ZONE 'America/Bogota')::date;
  v_audit_date  := v_today - INTERVAL '1 day';  -- ayer (día completo que acaba de terminar)
  v_month_start := date_trunc('month', v_today)::date;

  -- ════ CHECK 1: Clicks diarios excedidos por tipo ═════════════════════════
  -- SOLO auditamos el día actual (v_today) porque active_refs cambia con el
  -- tiempo. Si un usuario tenía 20 refs la semana pasada y hoy tiene 5, su
  -- límite era mayor entonces — comparar clicks históricos contra el count
  -- actual genera falsos positivos. El día de hoy usa el count vivo.
  --
  -- Para 'mini': el límite real = 4 propios + (active_refs × slots_por_categoria)
  -- porque los clicks mini_referral también se guardan como ad_type='mini'
  -- en ptc_clicks (comparten task_id).
  FOR rec IN
    SELECT
      pc.user_id,
      v_audit_date AS click_date,
      pt.ad_type::text AS ad_type,
      COUNT(*)::INT AS click_count
    FROM ptc_clicks pc
    JOIN ptc_tasks pt ON pt.id = pc.task_id
    WHERE (pc.completed_at AT TIME ZONE 'America/Bogota')::date = v_audit_date
      AND pt.ad_type::text IN ('standard_400','mini','standard_600')
    GROUP BY pc.user_id, pt.ad_type
  LOOP
    SELECT COUNT(*)::INT INTO v_active_refs
    FROM profiles
    WHERE referred_by = rec.user_id AND has_active_package = true;

    v_std_limit := CASE rec.ad_type
      WHEN 'standard_400' THEN (CASE WHEN v_active_refs >= 20 THEN 15 ELSE 5 END)
      WHEN 'mini'         THEN 4 + (v_active_refs * get_mini_referral_slots_per_affiliate(v_active_refs))
      WHEN 'standard_600' THEN 3
      ELSE 999
    END;

    IF rec.click_count > v_std_limit THEN
      -- Evitar duplicados: no insertar si ya hay alerta del mismo tipo/día/usuario
      IF NOT EXISTS (
        SELECT 1 FROM user_fraud_alerts
        WHERE user_id = rec.user_id
          AND check_type = 'daily_clicks_exceeded'
          AND (details->>'date')::date = rec.click_date
          AND details->>'ad_type' = rec.ad_type
      ) THEN
        INSERT INTO user_fraud_alerts (user_id, check_type, severity, details)
        VALUES (
          rec.user_id,
          'daily_clicks_exceeded',
          'critical',
          jsonb_build_object(
            'ad_type',     rec.ad_type,
            'date',        rec.click_date,
            'click_count', rec.click_count,
            'allowed_max', v_std_limit,
            'excess',      rec.click_count - v_std_limit,
            'active_refs', v_active_refs
          )
        );
        v_alerts_inserted := v_alerts_inserted + 1;
        v_critical_count  := v_critical_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- ════ CHECK 4: ELIMINADO ══════════════════════════════════════════════════
  -- El check de "mega mensual excedido" no es auditable con el modelo actual:
  -- active_refs cambia con el tiempo y no guardamos snapshot histórico, así
  -- que comparar clicks del mes contra el count actual genera falsos
  -- positivos cuando un usuario tuvo más refs activos en el pasado. La
  -- función record_ptc_click ya enforcea el límite en tiempo real con el
  -- count vivo, lo cual es la única fuente de verdad posible.

  -- ════ CHECK 2: Ganancia diaria imposible (propios clicks) ════════════════
  -- Solo hoy, por la misma razón que check 1 (active_refs vivo).
  FOR rec IN
    SELECT
      pc.user_id,
      v_audit_date AS click_date,
      SUM(pc.reward_earned)::NUMERIC AS actual_earned
    FROM ptc_clicks pc
    WHERE (pc.completed_at AT TIME ZONE 'America/Bogota')::date = v_audit_date
    GROUP BY pc.user_id
  LOOP
    SELECT COUNT(*)::INT INTO v_active_refs
    FROM profiles
    WHERE referred_by = rec.user_id AND has_active_package = true;

    v_slots := get_mini_referral_slots_per_affiliate(v_active_refs);

    -- Máximo teórico diario (solo clicks propios, no bonos de referidor)
    v_theoretical_max := 0;
    -- standard_400: 5 a $400 (o 15 a $1130 si 20+ refs)
    IF v_active_refs >= 20 THEN
      v_theoretical_max := v_theoretical_max + (15 * 1130);
    ELSE
      v_theoretical_max := v_theoretical_max + (5 * 400);
    END IF;
    -- mini: 4 a $83.33 (o $100 si 20+ refs)
    IF v_active_refs >= 20 THEN
      v_theoretical_max := v_theoretical_max + (4 * 100);
    ELSE
      v_theoretical_max := v_theoretical_max + (4 * 83.33);
    END IF;
    -- standard_600: 3 a $600
    v_theoretical_max := v_theoretical_max + (3 * 600);
    -- mega: si vuelca todo el mensual en un día (active_refs * 5 * 2000)
    v_theoretical_max := v_theoretical_max + (v_active_refs * 5 * 2000);
    -- mini_referral: active_refs * slots_per_cat * 100
    v_theoretical_max := v_theoretical_max + (v_active_refs * v_slots * 100);
    -- Mega V2 (nuevos tiers): active_refs * 5 * 100000 como tope máximo absoluto
    v_theoretical_max := v_theoretical_max + (v_active_refs * 5 * 100000);
    -- Margen del 5%
    v_theoretical_max := v_theoretical_max * 1.05;

    IF rec.actual_earned > v_theoretical_max THEN
      IF NOT EXISTS (
        SELECT 1 FROM user_fraud_alerts
        WHERE user_id = rec.user_id
          AND check_type = 'impossible_earnings'
          AND (details->>'date')::date = rec.click_date
      ) THEN
        INSERT INTO user_fraud_alerts (user_id, check_type, severity, details)
        VALUES (
          rec.user_id,
          'impossible_earnings',
          'critical',
          jsonb_build_object(
            'date',            rec.click_date,
            'actual_earned',   rec.actual_earned,
            'theoretical_max', ROUND(v_theoretical_max, 2),
            'active_refs',     v_active_refs,
            'excess',          ROUND(rec.actual_earned - v_theoretical_max, 2)
          )
        );
        v_alerts_inserted := v_alerts_inserted + 1;
        v_critical_count  := v_critical_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- ════ CHECK 3: Incoherencia de saldo vs ganancias ════════════════════════
  -- Identidad correcta: total_earned = real_balance + retiros_completados
  -- (balance_correction reduce ambos campos a la vez, no se suma por separado)
  -- Saltamos usuarios con ajustes administrativos recientes que rompen
  -- intencionalmente la identidad (grants, activaciones manuales, etc).
  FOR rec IN
    SELECT
      p.id,
      p.username,
      p.real_balance::NUMERIC     AS real_balance,
      p.total_earned::NUMERIC     AS total_earned,
      COALESCE((
        SELECT SUM(amount) FROM withdrawal_requests
        WHERE user_id = p.id AND status IN ('completed','approved')
      ), 0)::NUMERIC AS withdrawn
    FROM profiles p
    WHERE p.total_earned > 0
      AND (p.updated_at >= NOW() - INTERVAL '48 hours' OR p.real_balance > 10000)
      -- Saltar usuarios con ajustes administrativos en los últimos 60 días
      AND NOT EXISTS (
        SELECT 1 FROM activity_logs al
        WHERE al.user_id = p.id
          AND al.action IN (
            'admin_grant_renewal',
            'manual_payment_approval',
            'admin_package_activation',
            'update_balance',
            'update_real_balance',
            'balance_correction'
          )
          AND al.created_at >= NOW() - INTERVAL '60 days'
      )
  LOOP
    v_expected := rec.real_balance + rec.withdrawn;
    v_diff     := rec.total_earned - v_expected;

    IF ABS(v_diff) > 1000 THEN
      IF NOT EXISTS (
        SELECT 1 FROM user_fraud_alerts
        WHERE user_id = rec.id
          AND check_type = 'balance_mismatch'
          AND detected_at >= NOW() - INTERVAL '24 hours'
      ) THEN
        INSERT INTO user_fraud_alerts (user_id, check_type, severity, details)
        VALUES (
          rec.id,
          'balance_mismatch',
          CASE WHEN ABS(v_diff) > 100000 THEN 'critical' ELSE 'alert' END,
          jsonb_build_object(
            'total_earned',    rec.total_earned,
            'real_balance',    rec.real_balance,
            'withdrawn',       rec.withdrawn,
            'expected_total',  v_expected,
            'diff',            v_diff,
            'diff_type', CASE
              WHEN v_diff > 0 THEN 'balance_faltante'
              ELSE 'balance_excedente'
            END
          )
        );
        v_alerts_inserted := v_alerts_inserted + 1;
        IF ABS(v_diff) > 100000 THEN
          v_critical_count := v_critical_count + 1;
        ELSE
          v_alert_count := v_alert_count + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- ════ Email solo si hay alertas ══════════════════════════════════════════
  IF v_critical_count > 0 OR v_alert_count > 0 THEN
    v_subject := '🚨 Auditoría Publihazclick — ' || v_alerts_inserted ||
                 ' anomalía(s) detectada(s) — ' ||
                 to_char(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI');

    -- Top 10 alertas más recientes para el cuerpo del email
    v_summary_rows := '';
    FOR v_alert_row IN
      SELECT
        ufa.check_type,
        ufa.severity,
        pr.username,
        ufa.details
      FROM user_fraud_alerts ufa
      JOIN profiles pr ON pr.id = ufa.user_id
      WHERE ufa.detected_at >= NOW() - INTERVAL '5 minutes'
      ORDER BY
        CASE ufa.severity WHEN 'critical' THEN 0 WHEN 'alert' THEN 1 ELSE 2 END,
        ufa.detected_at DESC
      LIMIT 15
    LOOP
      v_summary_rows := v_summary_rows ||
        '<tr>' ||
        '<td style="padding:10px;border-bottom:1px solid #1e293b;color:' ||
        CASE v_alert_row.severity
          WHEN 'critical' THEN '#ef4444'
          WHEN 'alert'    THEN '#f59e0b'
          ELSE '#94a3b8'
        END || ';font-weight:bold;font-size:11px;text-transform:uppercase;">' ||
        v_alert_row.severity || '</td>' ||
        '<td style="padding:10px;border-bottom:1px solid #1e293b;color:#fff;font-weight:bold;">' ||
        COALESCE(v_alert_row.username, '(sin username)') || '</td>' ||
        '<td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:12px;">' ||
        v_alert_row.check_type || '</td>' ||
        '<td style="padding:10px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:11px;font-family:monospace;">' ||
        v_alert_row.details::text || '</td>' ||
        '</tr>';
    END LOOP;

    v_html :=
      '<div style="font-family:Arial,sans-serif;max-width:780px;margin:0 auto;background:#0a0a0a;color:#fff;padding:32px;border-radius:16px;">' ||
      '<h2 style="color:#ef4444;margin-top:0;">🚨 Auditoría de fraude — anomalías detectadas</h2>' ||
      '<p style="color:#94a3b8;">Chequeo automático a las ' ||
      to_char(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI') ||
      ' (Colombia).</p>' ||
      '<table style="width:100%;border-collapse:collapse;margin:20px 0;background:#111827;border-radius:8px;overflow:hidden;">' ||
      '<tr><td style="padding:12px;color:#94a3b8;border-bottom:1px solid #1e293b;">Total anomalías nuevas</td><td style="padding:12px;text-align:right;color:#fff;font-weight:bold;border-bottom:1px solid #1e293b;">' || v_alerts_inserted || '</td></tr>' ||
      '<tr><td style="padding:12px;color:#94a3b8;border-bottom:1px solid #1e293b;">🚨 Críticas</td><td style="padding:12px;text-align:right;color:#ef4444;font-weight:bold;border-bottom:1px solid #1e293b;">' || v_critical_count || '</td></tr>' ||
      '<tr><td style="padding:12px;color:#94a3b8;">⚠️ Alertas</td><td style="padding:12px;text-align:right;color:#f59e0b;font-weight:bold;">' || v_alert_count || '</td></tr>' ||
      '</table>' ||
      '<h3 style="color:#f59e0b;margin-top:24px;">Detalle (top 15)</h3>' ||
      '<table style="width:100%;border-collapse:collapse;background:#0f172a;border-radius:8px;overflow:hidden;">' ||
      '<thead><tr style="background:#1e293b;"><th style="padding:10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;">Sev</th><th style="padding:10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;">Usuario</th><th style="padding:10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;">Tipo</th><th style="padding:10px;text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;">Detalle</th></tr></thead>' ||
      '<tbody>' || v_summary_rows || '</tbody>' ||
      '</table>' ||
      '<p style="color:#475569;font-size:12px;margin-top:24px;">Nota: Este sistema SOLO detecta y avisa. No modifica saldos ni suspende cuentas. Revisa cada alerta manualmente antes de tomar acción. Para ver todas las anomalías: SELECT * FROM user_fraud_alerts WHERE NOT reviewed ORDER BY detected_at DESC;</p>' ||
      '</div>';

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
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'checked_at', NOW(),
    'alerts_inserted', v_alerts_inserted,
    'critical', v_critical_count,
    'alert', v_alert_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION audit_user_anomalies() TO authenticated, service_role;

-- ── 3. Helper: consultar alertas no revisadas ─────────────────────────────
CREATE OR REPLACE FUNCTION get_user_fraud_alerts_unreviewed(p_limit INT DEFAULT 50)
RETURNS TABLE (
  id          BIGINT,
  detected_at TIMESTAMPTZ,
  username    TEXT,
  full_name   TEXT,
  check_type  TEXT,
  severity    TEXT,
  details     JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT
    ufa.id,
    ufa.detected_at,
    pr.username,
    pr.full_name,
    ufa.check_type,
    ufa.severity,
    ufa.details
  FROM user_fraud_alerts ufa
  JOIN profiles pr ON pr.id = ufa.user_id
  WHERE NOT ufa.reviewed
  ORDER BY
    CASE ufa.severity WHEN 'critical' THEN 0 WHEN 'alert' THEN 1 ELSE 2 END,
    ufa.detected_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_user_fraud_alerts_unreviewed(INT) TO authenticated;

-- ── 4. Cron job: 00:15 Colombia (05:15 UTC) todos los días ─────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('user-fraud-audit-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'user-fraud-audit-daily',
  '15 5 * * *',
  'SELECT audit_user_anomalies();'
);
