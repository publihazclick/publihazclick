-- ============================================================
-- 025: Mejoras al perfil social - redes sociales y galería
-- ============================================================

-- Agregar columnas de redes sociales
ALTER TABLE social_business_profiles
  ADD COLUMN IF NOT EXISTS instagram text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS facebook text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tiktok text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS twitter text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gallery_images text[] DEFAULT '{}';
