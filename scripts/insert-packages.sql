-- =============================================================================
-- Insertar los 4 paquetes de PublihazClick
-- Ejecutar en el SQL Editor de Supabase
-- =============================================================================

-- Eliminar paquetes existentes si hay duplicados
DELETE FROM packages WHERE name IN ('Starter', 'Growth', 'Business', 'Enterprise Pro');

-- Insertar los 4 paquetes
INSERT INTO packages (
  name, 
  description, 
  package_type, 
  price, 
  duration_days, 
  currency,
  features, 
  min_ptc_visits, 
  min_banner_views, 
  included_ptc_ads,
  has_clickable_banner, 
  banner_clicks_limit, 
  banner_impressions_limit,
  daily_ptc_limit, 
  max_ptc_ads, 
  max_banner_ads, 
  max_campaigns,
  ptc_reward_bonus, 
  banner_reward_bonus, 
  referral_bonus,
  is_active, 
  display_order
)
VALUES 
(
  'Starter',
  'Perfecto para empezar a ganar dinero con anuncios PTC.',
  'basic',
  25.00,
  30,
  'USD',
  '["Acceso a Mega Anuncios PTC", "Banner clickeable", "Sistema de referidos"]',
  50, 100, 5, 
  TRUE, 500, 1000, 
  5, 5, 1, 1, 
  5, 0, 5, 
  TRUE, 1
),
(
  'Growth',
  'Maximiza tus ganancias con mas beneficios y limites.',
  'premium',
  50.00,
  30,
  'USD',
  '["Acceso a Mega Anuncios y Standard", "Mas beneficios", "Bonos aumentados"]',
  150, 300, 15, 
  TRUE, 1500, 3000, 
  10, 15, 2, 3, 
  10, 5, 10, 
  TRUE, 2
),
(
  'Business',
  'Para profesionales del marketing digital.',
  'enterprise',
  100.00,
  30,
  'USD',
  '["Acceso a todos los tipos de anuncios", "Soporte prioritario", "API de gestion"]',
  400, 800, 40, 
  TRUE, 4000, 8000, 
  25, 40, 5, 10, 
  25, 15, 20, 
  TRUE, 3
),
(
  'Enterprise Pro',
  'El paquete maximo con acceso ilimitado.',
  'custom',
  150.00,
  30,
  'USD',
  '["Acceso ilimitado", "API", "Asesoria dedicada", "Soporte VIP"]',
  1000, 2000, 100, 
  TRUE, 10000, 20000, 
  50, 999999, 10, 999999, 
  50, 25, 30, 
  TRUE, 4
);

-- Verificar que se insertaron
SELECT name, package_type, price, is_active, display_order 
FROM packages 
WHERE name IN ('Starter', 'Growth', 'Business', 'Enterprise Pro')
ORDER BY display_order;
