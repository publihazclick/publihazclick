-- =============================================
-- Sample PTC Ads and Banners Data
-- =============================================

-- Insert sample PTC Ads (replace image_url with actual Supabase Storage URLs after uploading)
INSERT INTO ptc_ads (title, description, url, image_url, reward, duration, daily_limit, total_clicks, status, ad_type, advertiser_id, location, created_at)
VALUES 
  (
    'Promo Fin de Semana - Tienda Online',
    'Descubre las mejores ofertas de este fin de semana en nuestra tienda online',
    'https://example.com/tienda',
    'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=400&h=300&fit=crop',
    50, 30, 100, 0, 'active', 'mega', '00000000-0000-0000-0000-000000000001', 'app', NOW()
  ),
  (
    'Restaurante Los Parados',
    'Los mejores platos típicos colombianos con delivery gratis',
    'https://example.com/restaurante',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop',
    40, 25, 80, 0, 'active', 'standard_600', '00000000-0000-0000-0000-000000000001', 'app', NOW()
  ),
  (
    'Gran Venta de Electrónicos',
    ' hasta 50% de descuento en electronics',
    'https://example.com/electronicos',
    'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&h=300&fit=crop',
    35, 20, 60, 0, 'active', 'standard_400', '00000000-0000-0000-0000-000000000001', 'app', NOW()
  ),
  (
    'Spa & Wellness Centro',
    'Relájate y cuida tu bienestar con nuestros tratamientos especiales',
    'https://example.com/spa',
    'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop',
    30, 15, 50, 0, 'active', 'mini', '00000000-0000-0000-0000-000000000001', 'app', NOW()
  ),
  (
    'Academia de Idiomas',
    'Aprende inglés online con profesores nativos',
    'https://example.com/idiomas',
    'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=400&h=300&fit=crop',
    25, 15, 40, 0, 'active', 'mini', '00000000-0000-0000-0000-000000000001', 'app', NOW()
  ),
  (
    'Gimnasio FitLife',
    'Únete a FitLife y transforma tu cuerpo',
    'https://example.com/gimnasio',
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop',
    45, 25, 70, 0, 'active', 'standard_600', '00000000-0000-0000-0000-000000000001', 'app', NOW()
  ),
  (
    'Veterinaria PetCare',
    'Cuidado profesional para tu mascota',
    'https://example.com/veterinaria',
    'https://images.unsplash.com/photo-1548767797-d8c844163c4c?w=400&h=300&fit=crop',
    35, 20, 55, 0, 'active', 'standard_400', '00000000-0000-0000-0000-000000000001', 'app', NOW()
  ),
  (
    'Curso de Programación',
    'Aprende a programar desde cero',
    'https://example.com/curso',
    'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=400&h=300&fit=crop',
    50, 30, 90, 0, 'active', 'mega', '00000000-0000-0000-0000-000000000001', 'app', NOW()
  )
ON CONFLICT DO NOTHING;

-- Insert sample Banners
INSERT INTO banners (advertiser_id, name, description, image_url, url, position, impressions_limit, clicks_limit, daily_impressions, daily_clicks, total_impressions, total_clicks, reward, ctr, status, location, created_at, updated_at)
VALUES 
  (
    '00000000-0000-0000-0000-000000000001',
    'Banner Principal - Tienda Online',
    'Promociones de la semana',
    'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&h=200&fit=crop',
    'https://example.com/tienda',
    'hero',
    10000, 500, 0, 0, 0, 0, 100, 0, 'active', 'app', NOW(), NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Banner Lateral - Electrónicos',
    'Ofertas en electronics',
    'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&h=200&fit=crop',
    'https://example.com/electronicos',
    'sidebar',
    5000, 200, 0, 0, 0, 0, 50, 0, 'active', 'app', NOW(), NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Banner Footer - Suscríbete',
    'No te pierdas nuestras promociones',
    'https://images.unsplash.com/photo-1557200134-90327ee9fafa?w=800&h=100&fit=crop',
    'https://example.com/suscribirse',
    'footer',
    8000, 300, 0, 0, 0, 0, 75, 0, 'active', 'app', NOW(), NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Banner Popup - Descuento',
    '20% de descuento en tu primera compra',
    'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=600&h=400&fit=crop',
    'https://example.com/descuento',
    'popup',
    3000, 100, 0, 0, 0, 0, 80, 0, 'active', 'app', NOW(), NOW()
  )
ON CONFLICT DO NOTHING;

-- Verify data was inserted
SELECT 'PTC Ads' as table_name, COUNT(*) as count FROM ptc_ads
UNION ALL
SELECT 'Banners', COUNT(*) FROM banners;

-- Show all PTC ads
SELECT id, title, reward, ad_type, status FROM ptc_ads ORDER BY created_at DESC;

-- Show all banners
SELECT id, name, position, status FROM banners ORDER BY created_at DESC;
