-- =============================================================================
-- Migration 028: Panel de Reporte PTC por Anunciante
-- Crea daily_task_assignments (si no existe), RPCs de reporte y asignación manual
-- =============================================================================

-- 1. Tabla daily_task_assignments
-- =============================================================================
CREATE TABLE IF NOT EXISTS daily_task_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id         UUID NOT NULL REFERENCES ptc_tasks(id) ON DELETE CASCADE,
  assignment_date DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Bogota')::date,
  ad_type         TEXT,
  reward          NUMERIC DEFAULT 0,
  is_completed    BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, task_id, assignment_date)
);

CREATE INDEX IF NOT EXISTS idx_dta_user_date
  ON daily_task_assignments (user_id, assignment_date);
CREATE INDEX IF NOT EXISTS idx_dta_date
  ON daily_task_assignments (assignment_date);

ALTER TABLE daily_task_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'daily_task_assignments' AND policyname = 'Users view own assignments'
  ) THEN
    CREATE POLICY "Users view own assignments"
      ON daily_task_assignments FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'daily_task_assignments' AND policyname = 'Admins manage assignments'
  ) THEN
    CREATE POLICY "Admins manage assignments"
      ON daily_task_assignments FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role IN ('admin', 'dev')
        )
      );
  END IF;
END $$;

-- 2. RPC: Reporte de anunciantes PTC por rango de fechas
-- =============================================================================
-- Retorna por cada anunciante + día: clics por tipo, total ganado, total completados
-- Nota: sin DEFAULT values (evita 400 en PostgREST); SET row_security=off para bypass RLS
CREATE OR REPLACE FUNCTION admin_get_advertiser_ptc_report(
  p_date_from DATE,
  p_date_to   DATE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Solo admin/dev
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dev')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id',         r.user_id,
      'username',        r.username,
      'full_name',       r.full_name,
      'report_date',     r.report_date,
      'std400_count',    r.std400_count,
      'mini_count',      r.mini_count,
      'std600_count',    r.std600_count,
      'mega_count',      r.mega_count,
      'completed_count', r.completed_count,
      'earned_cop',      r.earned_cop,
      'has_assignments', r.has_assignments
    )
    ORDER BY r.report_date DESC, r.username
  )
  INTO v_result
  FROM (
    SELECT
      p.id                                                              AS user_id,
      p.username,
      p.full_name,
      (pc.completed_at AT TIME ZONE 'America/Bogota')::date             AS report_date,
      COUNT(*) FILTER (WHERE pt.ad_type = 'standard_400')               AS std400_count,
      COUNT(*) FILTER (WHERE pt.ad_type = 'mini')                       AS mini_count,
      COUNT(*) FILTER (WHERE pt.ad_type = 'standard_600')               AS std600_count,
      COUNT(*) FILTER (WHERE pt.ad_type = 'mega')                       AS mega_count,
      COUNT(*)                                                           AS completed_count,
      COALESCE(SUM(pc.reward_earned), 0)                                AS earned_cop,
      -- ¿Tiene asignaciones manuales para ese día?
      EXISTS (
        SELECT 1 FROM daily_task_assignments dta2
        WHERE dta2.user_id        = p.id
          AND dta2.assignment_date = (pc.completed_at AT TIME ZONE 'America/Bogota')::date
      )                                                                  AS has_assignments
    FROM ptc_clicks pc
    JOIN ptc_tasks   pt ON pt.id = pc.task_id
    JOIN profiles    p  ON p.id  = pc.user_id
    WHERE p.role IN ('advertiser', 'admin', 'dev')
      AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date
          BETWEEN p_date_from AND p_date_to
    GROUP BY p.id, p.username, p.full_name,
             (pc.completed_at AT TIME ZONE 'America/Bogota')::date
  ) r;

  RETURN jsonb_build_object(
    'success', true,
    'data',    COALESCE(v_result, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_advertiser_ptc_report(DATE, DATE) TO authenticated;

-- 3. RPC: Asignación manual de tareas para un anunciante en una fecha
-- =============================================================================
CREATE OR REPLACE FUNCTION admin_assign_ptc_tasks_for_user(
  p_user_id UUID,
  p_date    DATE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_task   RECORD;
  v_count  INT := 0;
  v_limit  INT;
  v_reward NUMERIC;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dev')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND role IN ('advertiser', 'admin', 'dev')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no es anunciante');
  END IF;

  FOR v_task IN
    SELECT t.id, t.ad_type,
           ROW_NUMBER() OVER (PARTITION BY t.ad_type ORDER BY t.created_at) AS rn
    FROM ptc_tasks t
    WHERE t.status = 'active' AND t.location = 'app'
      AND (t.is_demo_only IS NULL OR t.is_demo_only = false)
  LOOP
    v_limit  := CASE v_task.ad_type WHEN 'standard_400' THEN 5 WHEN 'mini' THEN 4 WHEN 'standard_600' THEN 3 WHEN 'mega' THEN 1 ELSE 5 END;
    v_reward := CASE v_task.ad_type WHEN 'standard_400' THEN 400.00 WHEN 'mini' THEN 83.33 WHEN 'standard_600' THEN 600.00 WHEN 'mega' THEN 2000.00 ELSE 83.33 END;
    IF v_task.rn <= v_limit THEN
      INSERT INTO daily_task_assignments (user_id, task_id, assignment_date, ad_type, reward, is_completed)
      VALUES (p_user_id, v_task.id, p_date, v_task.ad_type, v_reward, FALSE)
      ON CONFLICT (user_id, task_id, assignment_date) DO NOTHING;
      IF FOUND THEN v_count := v_count + 1; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'assigned', v_count, 'date', p_date::text, 'user_id', p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_assign_ptc_tasks_for_user(UUID, DATE) TO authenticated;

-- 4. RPC: Detalle diario de un anunciante (drill-down por usuario)
-- =============================================================================
CREATE OR REPLACE FUNCTION admin_get_advertiser_ptc_detail(
  p_user_id   UUID,
  p_date_from DATE,
  p_date_to   DATE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_result  JSONB;
  v_profile JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dev')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  -- Info del usuario
  SELECT jsonb_build_object(
    'id',               id,
    'username',         username,
    'full_name',        full_name,
    'email',            email,
    'role',             role,
    'has_active_package', has_active_package
  ) INTO v_profile
  FROM profiles WHERE id = p_user_id;

  -- Días con actividad
  SELECT jsonb_agg(
    jsonb_build_object(
      'report_date',     r.report_date,
      'std400_count',    r.std400_count,
      'mini_count',      r.mini_count,
      'std600_count',    r.std600_count,
      'mega_count',      r.mega_count,
      'completed_count', r.completed_count,
      'earned_cop',      r.earned_cop,
      'assigned_count',  r.assigned_count,
      'lost_count',      GREATEST(0, r.assigned_count - r.completed_count)
    )
    ORDER BY r.report_date DESC
  )
  INTO v_result
  FROM (
    SELECT
      (pc.completed_at AT TIME ZONE 'America/Bogota')::date                  AS report_date,
      COUNT(*) FILTER (WHERE pt.ad_type = 'standard_400')                     AS std400_count,
      COUNT(*) FILTER (WHERE pt.ad_type = 'mini')                             AS mini_count,
      COUNT(*) FILTER (WHERE pt.ad_type = 'standard_600')                     AS std600_count,
      COUNT(*) FILTER (WHERE pt.ad_type = 'mega')                             AS mega_count,
      COUNT(*)                                                                 AS completed_count,
      COALESCE(SUM(pc.reward_earned), 0)                                      AS earned_cop,
      -- Asignaciones de ese día (si existen registros manuales)
      COALESCE((
        SELECT COUNT(*) FROM daily_task_assignments dta
        WHERE dta.user_id = p_user_id
          AND dta.assignment_date = (pc.completed_at AT TIME ZONE 'America/Bogota')::date
      ), 13)                                                                   AS assigned_count
    FROM ptc_clicks pc
    JOIN ptc_tasks   pt ON pt.id = pc.task_id
    WHERE pc.user_id = p_user_id
      AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date
          BETWEEN p_date_from AND p_date_to
    GROUP BY (pc.completed_at AT TIME ZONE 'America/Bogota')::date
  ) r;

  RETURN jsonb_build_object(
    'success', true,
    'profile', v_profile,
    'days',    COALESCE(v_result, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_advertiser_ptc_detail(UUID, DATE, DATE) TO authenticated;
