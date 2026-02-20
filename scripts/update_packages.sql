-- =============================================================================
-- Script para actualizar los paquetes de precios en PublihazClick
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

-- 1. Agregar columnas adicionales a la tabla packages (si no existen)
-- =============================================================================
ALTER TABLE packages ADD COLUMN IF NOT EXISTS min_ptc_visits INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS min_banner_views INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS included_ptc_ads INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS has_clickable_banner BOOLEAN DEFAULT FALSE;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS banner_clicks_limit INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS banner_impressions_limit INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS daily_ptc_limit INTEGER DEFAULT 0;

-- 2. Eliminar paquetes existentes (si hay datos previos)
-- =============================================================================
DELETE FROM packages;

-- 3. Insertar los nuevos paquetes
-- =============================================================================
INSERT INTO packages (name, description, package_type, price, duration_days, features, min_ptc_visits, min_banner_views, max_ptc_ads, max_banner_ads, max_campaigns, included_ptc_ads, has_clickable_banner, banner_clicks_limit, banner_impressions_limit, daily_ptc_limit, ptc_reward_bonus, banner_reward_bonus, referral_bonus, display_order)
VALUES 
(
  'Básico',
  'Perfecto para comenzar tu estrategia de publicidad online.',
  'basic',
  25,
  30,
  '["20.000 vistas banner mensuales", "9.000 vistas post", "120 vistas PTC", "Reporte básico de métricas", "Segmentación por país", "Duración: 30 días"]',
  120,
  20000,
  5,
  1,
  1,
  5,
  true,
  9000,
  20000,
  10,
  5,
  0,
  5,
  1
),
(
  'Básico Plus',
  'Plan recomendado para maximizar tu alcance publicitario.',
  'premium',
  50,
  30,
  '["40.000 vistas banner mensuales", "20.000 vistas post", "250 vistas PTC", "Reporte detallado de conversiones", "Segmentación avanzada", "Banner en rotación principal", "Duración: 30 días"]',
  250,
  40000,
  15,
  3,
  3,
  15,
  true,
  20000,
  40000,
  20,
  10,
  5,
  10,
  2
),
(
  'Avanzado',
  'Para profesionales que buscan resultados avanzados.',
  'enterprise',
  100,
  30,
  '["80.000 vistas banner mensuales", "40.000 vistas post", "500 vistas PTC", "Analytics en tiempo real", "Segmentación premium por intereses", "Prioridad en ubicaciones", "A/B Testing de anuncios", "Soporte prioritario 24/7", "Duración: 30 días"]',
  500,
  80000,
  40,
  10,
  10,
  40,
  true,
  40000,
  80000,
  40,
  25,
  15,
  20,
  3
),
(
  'Avanzado Pro',
  'El paquete máximo con beneficios empresariales exclusivos.',
  'custom',
  150,
  30,
  '["120.000 vistas banner mensuales", "60.000 vistas post", "750 vistas PTC", "Dashboard empresarial completo", "Consultoría de marketing incluida", "Videos promocionales destacados", "Campañas personalizadas multicanal", "API de integración avanzada", "Gerente de cuenta dedicado", "Duración: 30 días"]',
  750,
  120000,
  999999,
  999999,
  999999,
  100,
  true,
  60000,
  120000,
  60,
  50,
  25,
  30,
  4
);

-- 4. Verificar que los paquetes se insertaron correctamente
-- =============================================================================
SELECT id, name, package_type, price, duration_days, display_order 
FROM packages 
ORDER BY display_order;

-- =============================================================================
-- Fin del script
-- =============================================================================
