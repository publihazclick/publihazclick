-- ============================================================================
-- Migración 084: Mega Anuncios V2 - Nuevos niveles de recompensa
-- Fecha: 2026-04-08
--
-- Estos mega anuncios son EXCLUSIVOS para el sistema v2 (referidos nuevos
-- a partir del 8 de abril de 2026). NO afectan la lógica v1 existente.
-- ============================================================================

-- 1. Agregar nuevos valores al enum ptc_ad_type
ALTER TYPE ptc_ad_type ADD VALUE IF NOT EXISTS 'mega_100000';
ALTER TYPE ptc_ad_type ADD VALUE IF NOT EXISTS 'mega_50000';
ALTER TYPE ptc_ad_type ADD VALUE IF NOT EXISTS 'mega_20000';
ALTER TYPE ptc_ad_type ADD VALUE IF NOT EXISTS 'mega_10000';
ALTER TYPE ptc_ad_type ADD VALUE IF NOT EXISTS 'mega_5000';
ALTER TYPE ptc_ad_type ADD VALUE IF NOT EXISTS 'mega_2000';

-- 2. Crear los anuncios mega v2 en ptc_tasks
INSERT INTO ptc_tasks (title, description, url, image_url, reward, duration, daily_limit, total_clicks, status, ad_type, location, created_at)
VALUES
  (
    'Mega Anuncio $100.000',
    'Mega anuncio premium - Gana $100.000 COP',
    'https://publihazclick.com',
    'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400&h=300&fit=crop',
    100000, 30, 10000, 0, 'active', 'mega_100000', 'app', NOW()
  ),
  (
    'Mega Anuncio $50.000',
    'Mega anuncio premium - Gana $50.000 COP',
    'https://publihazclick.com',
    'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400&h=300&fit=crop',
    50000, 30, 10000, 0, 'active', 'mega_50000', 'app', NOW()
  ),
  (
    'Mega Anuncio $20.000',
    'Mega anuncio premium - Gana $20.000 COP',
    'https://publihazclick.com',
    'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400&h=300&fit=crop',
    20000, 30, 10000, 0, 'active', 'mega_20000', 'app', NOW()
  ),
  (
    'Mega Anuncio $10.000',
    'Mega anuncio premium - Gana $10.000 COP',
    'https://publihazclick.com',
    'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400&h=300&fit=crop',
    10000, 30, 10000, 0, 'active', 'mega_10000', 'app', NOW()
  ),
  (
    'Mega Anuncio $5.000',
    'Mega anuncio premium - Gana $5.000 COP',
    'https://publihazclick.com',
    'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400&h=300&fit=crop',
    5000, 30, 10000, 0, 'active', 'mega_5000', 'app', NOW()
  ),
  (
    'Mega Anuncio $2.000',
    'Mega anuncio premium - Gana $2.000 COP',
    'https://publihazclick.com',
    'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400&h=300&fit=crop',
    2000, 30, 10000, 0, 'active', 'mega_2000', 'app', NOW()
  );
