-- =============================================================================
-- Migración 122: RLS estricta para el pool v2
--
-- Problema: la política "Anyone can view active PTC tasks" dejaba que cualquier
-- usuario autenticado leyera las 150 filas del pool v2_pool aunque no tuviera
-- grants activos. Aunque no podía RECLAMAR recompensas (consume_referral_mega_grant
-- bloquea sin grant), sí podía VER las empresas vía API.
--
-- Fix: separar la política en dos — una para location != 'v2_pool' (pública
-- para todos los activos, como antes) y otra para 'v2_pool' que exige grants
-- activos del tier específico.
-- =============================================================================

-- 1. Eliminar la política pública que permitía leer todo lo activo
DROP POLICY IF EXISTS "Anyone can view active PTC tasks" ON ptc_tasks;

-- 2. Política pública para anuncios normales (app / landing)
CREATE POLICY "Anyone can view active non-pool PTC tasks"
  ON ptc_tasks FOR SELECT
  USING (
    status = 'active'
    AND location <> 'v2_pool'
  );

-- 3. Política estricta para el pool v2: solo visible si el usuario tiene
--    al menos un grant activo del mismo ad_type.
CREATE POLICY "Only grant holders can view v2 pool PTC tasks"
  ON ptc_tasks FOR SELECT
  USING (
    status = 'active'
    AND location = 'v2_pool'
    AND EXISTS (
      SELECT 1
        FROM referral_mega_grants rmg
       WHERE rmg.referrer_id = auth.uid()
         AND rmg.remaining   > 0
         AND rmg.expires_at  > NOW()
         AND rmg.ad_type     = ptc_tasks.ad_type::text
    )
  );

-- Nota: las políticas existentes "Admins can manage all PTC tasks" y
-- "Advertisers can manage their PTC tasks" siguen activas y dan acceso total
-- para administración, sin cambios.
