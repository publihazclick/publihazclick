-- =============================================================================
-- Migration 063: Banners de marcas aliadas — 50+ empresas colombianas
-- Diseños profesionales únicos con SVG inline como data URI
-- =============================================================================

-- Limpiar banners de sample data anteriores (solo los de prueba)
DELETE FROM banner_ads WHERE name LIKE 'Banner Principal%' OR name LIKE 'Banner Lateral%' OR name LIKE 'Banner Footer%';

-- ── INSERTAR BANNERS DE MARCAS ─────────────────────────────────────────────
INSERT INTO banner_ads (advertiser_id, name, description, image_url, url, position, impressions_limit, clicks_limit, status, location) VALUES

-- 1. Bancolombia
((SELECT id FROM profiles LIMIT 1), 'Bancolombia', 'Tu banco de confianza — Soluciones financieras para todos',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#003DA5"/><stop offset="100%" style="stop-color:#0066CC"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="1050" cy="200" r="180" fill="#FFD100" opacity="0.15"/><circle cx="1100" cy="150" r="120" fill="#FFD100" opacity="0.1"/><rect x="80" y="160" width="8" height="80" rx="4" fill="#FFD100"/><text x="110" y="210" font-family="Arial Black,sans-serif" font-size="52" font-weight="900" fill="white">BANCOLOMBIA</text><text x="110" y="250" font-family="Arial,sans-serif" font-size="20" fill="#FFD100">Es el momento de crecer juntos</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.bancolombia.com', 'header', 500000, 100000, 'active', 'app'),

-- 2. Avianca
((SELECT id FROM profiles LIMIT 1), 'Avianca', 'Vuela con la aerolínea líder de Colombia',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#E31937"/><stop offset="100%" style="stop-color:#C41230"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><polygon points="900,50 1200,200 900,350" fill="white" opacity="0.08"/><polygon points="950,80 1200,200 950,320" fill="white" opacity="0.05"/><text x="80" y="200" font-family="Arial Black,sans-serif" font-size="58" font-weight="900" fill="white">AVIANCA</text><text x="80" y="245" font-family="Arial,sans-serif" font-size="22" fill="rgba(255,255,255,0.8)">El cielo es el comienzo</text><text x="80" y="290" font-family="Arial,sans-serif" font-size="16" fill="#FFD700">Ofertas desde $99.900 COP</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.avianca.com', 'header', 500000, 100000, 'active', 'app'),

-- 3. Chevrolet
((SELECT id FROM profiles LIMIT 1), 'Chevrolet Colombia', 'Encuentra tu vehículo ideal',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#1a1a1a"/><rect x="0" y="380" width="1200" height="20" fill="#C4A01C"/><circle cx="1000" cy="200" r="250" fill="#C4A01C" opacity="0.06"/><text x="80" y="180" font-family="Arial Black,sans-serif" font-size="60" font-weight="900" fill="white">CHEVROLET</text><text x="80" y="230" font-family="Arial,sans-serif" font-size="22" fill="#C4A01C">Find New Roads</text><text x="80" y="280" font-family="Arial,sans-serif" font-size="18" fill="rgba(255,255,255,0.5)">Tecnología que te mueve hacia adelante</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.chevrolet.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 4. Postobón
((SELECT id FROM profiles LIMIT 1), 'Postobón', 'Refrescamos los mejores momentos de Colombia',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#E8430A"/><stop offset="100%" style="stop-color:#C93000"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="200" cy="400" r="200" fill="white" opacity="0.05"/><circle cx="1000" cy="0" r="200" fill="#FFD700" opacity="0.08"/><text x="80" y="195" font-family="Arial Black,sans-serif" font-size="56" font-weight="900" fill="white">POSTOBÓN</text><text x="80" y="245" font-family="Arial,sans-serif" font-size="22" fill="rgba(255,255,255,0.85)">El sabor de Colombia desde 1904</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.postobon.com', 'header', 500000, 100000, 'active', 'app'),

-- 5. Ecopetrol
((SELECT id FROM profiles LIMIT 1), 'Ecopetrol', 'Energía que transforma a Colombia',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#005C2D"/><stop offset="50%" style="stop-color:#007A3D"/><stop offset="100%" style="stop-color:#009B4E"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="1100" cy="100" r="150" fill="#FFD700" opacity="0.1"/><rect x="80" y="155" width="6" height="90" rx="3" fill="#FFD700"/><text x="105" y="210" font-family="Arial Black,sans-serif" font-size="52" font-weight="900" fill="white">ECOPETROL</text><text x="105" y="255" font-family="Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.8)">Energía para el futuro sostenible</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.ecopetrol.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 6. Homecenter
((SELECT id FROM profiles LIMIT 1), 'Homecenter', 'Todo para tu hogar en un solo lugar',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#F58220"/><stop offset="100%" style="stop-color:#E06B10"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><rect x="900" y="0" width="300" height="400" fill="white" opacity="0.05"/><rect x="950" y="0" width="250" height="400" fill="white" opacity="0.03"/><text x="80" y="195" font-family="Arial Black,sans-serif" font-size="50" font-weight="900" fill="white">HOMECENTER</text><text x="80" y="240" font-family="Arial,sans-serif" font-size="22" fill="rgba(255,255,255,0.9)">Construye el hogar de tus sueños</text><text x="80" y="285" font-family="Arial,sans-serif" font-size="16" fill="#FFF3E0">Descuentos hasta del 40%</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.homecenter.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 7. Movistar
((SELECT id FROM profiles LIMIT 1), 'Movistar', 'Conectamos a los colombianos con el mundo',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#019DF4"/><stop offset="100%" style="stop-color:#0070C0"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="1050" cy="200" r="220" fill="white" opacity="0.06"/><circle cx="1050" cy="200" r="160" fill="white" opacity="0.04"/><circle cx="1050" cy="200" r="100" fill="white" opacity="0.03"/><text x="80" y="200" font-family="Arial Black,sans-serif" font-size="54" font-weight="900" fill="white">MOVISTAR</text><text x="80" y="250" font-family="Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.8)">Elegí conectarte con lo que más importa</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.movistar.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 8. Tigo
((SELECT id FROM profiles LIMIT 1), 'Tigo', 'Internet, móvil y entretenimiento digital',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#00377B"/><stop offset="100%" style="stop-color:#0055A5"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><rect x="0" y="350" width="1200" height="50" fill="#FFD100"/><text x="80" y="200" font-family="Arial Black,sans-serif" font-size="64" font-weight="900" fill="white">TIGO</text><text x="80" y="250" font-family="Arial,sans-serif" font-size="20" fill="#FFD100">Tu vida digital sin límites</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.tigo.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 9. Universidad Nacional
((SELECT id FROM profiles LIMIT 1), 'Universidad Nacional de Colombia', 'La universidad de la nación',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#1B2A4A"/><rect x="0" y="0" width="1200" height="6" fill="#BFA14A"/><rect x="0" y="394" width="1200" height="6" fill="#BFA14A"/><text x="80" y="190" font-family="Georgia,serif" font-size="40" font-weight="700" fill="white">UNIVERSIDAD NACIONAL</text><text x="80" y="235" font-family="Georgia,serif" font-size="24" fill="#BFA14A">DE COLOMBIA</text><text x="80" y="285" font-family="Arial,sans-serif" font-size="16" fill="rgba(255,255,255,0.6)">Excelencia académica desde 1867</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.unal.edu.co', 'header', 500000, 100000, 'active', 'app'),

-- 10. Renault
((SELECT id FROM profiles LIMIT 1), 'Renault Colombia', 'Pasión por la vida — Innovación automotriz',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#0D0D0D"/><rect x="0" y="380" width="1200" height="20" fill="#FFD700"/><polygon points="800,0 1200,0 1200,400 1000,400" fill="#FFD700" opacity="0.04"/><text x="80" y="200" font-family="Arial Black,sans-serif" font-size="58" font-weight="900" fill="white">RENAULT</text><text x="80" y="250" font-family="Arial,sans-serif" font-size="20" fill="#FFD700">Passion for life</text><text x="80" y="290" font-family="Arial,sans-serif" font-size="16" fill="rgba(255,255,255,0.5)">Descubre la nueva línea 2026</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.renault.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 11. LG
((SELECT id FROM profiles LIMIT 1), 'LG Electronics', 'Life is Good — Tecnología que inspira',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#A50034"/><stop offset="100%" style="stop-color:#7A0026"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="150" cy="200" r="300" fill="white" opacity="0.03"/><text x="80" y="195" font-family="Arial Black,sans-serif" font-size="72" font-weight="900" fill="white">LG</text><text x="80" y="245" font-family="Arial,sans-serif" font-size="24" fill="rgba(255,255,255,0.8)">Life is Good</text><text x="80" y="290" font-family="Arial,sans-serif" font-size="16" fill="rgba(255,255,255,0.5)">Innovación para una vida mejor</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.lg.com/co', 'header', 500000, 100000, 'active', 'app'),

-- 12. Mabe
((SELECT id FROM profiles LIMIT 1), 'Mabe', 'Electrodomésticos que facilitan tu vida',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#2E3192"/><stop offset="100%" style="stop-color:#1B1F6E"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><rect x="60" y="130" width="120" height="120" rx="20" fill="white" opacity="0.1"/><text x="80" y="205" font-family="Arial Black,sans-serif" font-size="56" font-weight="900" fill="white">mabe</text><text x="80" y="260" font-family="Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.7)">Tu hogar, nuestra inspiración</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.mabe.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 13. Oster
((SELECT id FROM profiles LIMIT 1), 'Oster', 'Calidad en cada momento del día',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#1C1C1C"/><rect x="0" y="0" width="600" height="400" fill="#B71C1C" opacity="0.9"/><polygon points="600,0 750,0 600,400 450,400" fill="#1C1C1C" opacity="0.3"/><text x="80" y="210" font-family="Arial Black,sans-serif" font-size="60" font-weight="900" fill="white">OSTER</text><text x="80" y="260" font-family="Arial,sans-serif" font-size="18" fill="rgba(255,255,255,0.7)">Desde 1924 creando momentos</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.oster.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 14. Bavaria
((SELECT id FROM profiles LIMIT 1), 'Bavaria', 'Cerveza colombiana con tradición',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#004D25"/><stop offset="100%" style="stop-color:#003318"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="1100" cy="350" r="200" fill="#C8A415" opacity="0.1"/><text x="80" y="200" font-family="Georgia,serif" font-size="56" font-weight="700" fill="#C8A415">BAVARIA</text><text x="80" y="250" font-family="Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.7)">Tradición cervecera desde 1889</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.bavaria.co', 'header', 500000, 100000, 'active', 'app'),

-- 15. Arturo Calle
((SELECT id FROM profiles LIMIT 1), 'Arturo Calle', 'Moda masculina con estilo colombiano',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#0A0A0A"/><rect x="70" y="120" width="3" height="160" fill="#B8860B"/><text x="95" y="195" font-family="Georgia,serif" font-size="44" font-weight="400" fill="white" letter-spacing="8">ARTURO CALLE</text><text x="95" y="240" font-family="Arial,sans-serif" font-size="16" fill="#B8860B" letter-spacing="6">ELEGANCIA COLOMBIANA</text><rect x="95" y="260" width="200" height="1" fill="#B8860B" opacity="0.5"/></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.arturocalle.com', 'header', 500000, 100000, 'active', 'app'),

-- 16. Vélez
((SELECT id FROM profiles LIMIT 1), 'Vélez', 'Cuero colombiano de clase mundial',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#2C1810"/><rect x="0" y="370" width="1200" height="30" fill="#8B6914"/><text x="80" y="210" font-family="Georgia,serif" font-size="56" font-weight="700" fill="#E8D5A0" letter-spacing="12">VÉLEZ</text><text x="80" y="260" font-family="Arial,sans-serif" font-size="18" fill="rgba(232,213,160,0.6)">El arte del cuero desde 1986</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.velez.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 17. Koaj
((SELECT id FROM profiles LIMIT 1), 'Koaj', 'Moda accesible para toda la familia',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#E91E63"/><stop offset="100%" style="stop-color:#9C27B0"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="1000" cy="200" r="250" fill="white" opacity="0.05"/><text x="80" y="210" font-family="Arial Black,sans-serif" font-size="68" font-weight="900" fill="white">KOAJ</text><text x="80" y="260" font-family="Arial,sans-serif" font-size="22" fill="rgba(255,255,255,0.8)">Tu estilo, tu precio</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.koaj.co', 'header', 500000, 100000, 'active', 'app'),

-- 18. Leonisa
((SELECT id FROM profiles LIMIT 1), 'Leonisa', 'Ropa interior y moda — Mujer real',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#8B1A4A"/><stop offset="100%" style="stop-color:#5C1133"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><text x="80" y="200" font-family="Georgia,serif" font-size="52" font-weight="400" fill="white" letter-spacing="6">LEONISA</text><text x="80" y="250" font-family="Arial,sans-serif" font-size="18" fill="rgba(255,255,255,0.7)">Mujeres reales, belleza real</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.leonisa.com', 'header', 500000, 100000, 'active', 'app'),

-- 19. Estudio F
((SELECT id FROM profiles LIMIT 1), 'Studio F', 'Moda femenina premium colombiana',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#F5F0E8"/><rect x="70" y="140" width="4" height="120" fill="#1a1a1a"/><text x="95" y="215" font-family="Georgia,serif" font-size="50" font-weight="400" fill="#1a1a1a" letter-spacing="10">STUDIO F</text><text x="95" y="260" font-family="Arial,sans-serif" font-size="16" fill="#666" letter-spacing="4">FASHION FOR WOMEN</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.studiof.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 20. Toyota
((SELECT id FROM profiles LIMIT 1), 'Toyota Colombia', 'Lets Go Places — Calidad y confiabilidad',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#1a1a1a"/><rect x="0" y="0" width="1200" height="5" fill="#EB0A1E"/><circle cx="1050" cy="200" r="120" fill="none" stroke="#EB0A1E" stroke-width="3" opacity="0.3"/><circle cx="1050" cy="200" r="80" fill="none" stroke="#EB0A1E" stroke-width="2" opacity="0.2"/><text x="80" y="200" font-family="Arial Black,sans-serif" font-size="56" font-weight="900" fill="white">TOYOTA</text><text x="80" y="250" font-family="Arial,sans-serif" font-size="20" fill="#EB0A1E">Lets Go Places</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.toyota.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 21. Mazda
((SELECT id FROM profiles LIMIT 1), 'Mazda Colombia', 'Driving Matters — Pasión por conducir',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#1A1A2E"/><stop offset="100%" style="stop-color:#16213E"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><rect x="0" y="390" width="1200" height="10" fill="#910A0A"/><text x="80" y="205" font-family="Arial Black,sans-serif" font-size="60" font-weight="900" fill="white">MAZDA</text><text x="80" y="255" font-family="Arial,sans-serif" font-size="20" fill="#C0C0C0">Feel Alive</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.mazda.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 22. Banco de Bogotá
((SELECT id FROM profiles LIMIT 1), 'Banco de Bogotá', 'Más de 150 años construyendo confianza',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#003B71"/><stop offset="100%" style="stop-color:#005299"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><rect x="0" y="370" width="1200" height="30" fill="#F7941D"/><text x="80" y="195" font-family="Arial Black,sans-serif" font-size="42" font-weight="900" fill="white">BANCO DE BOGOTÁ</text><text x="80" y="245" font-family="Arial,sans-serif" font-size="20" fill="#F7941D">Desde 1870 — Tu aliado financiero</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.bancodebogota.com', 'header', 500000, 100000, 'active', 'app'),

-- 23. BBVA
((SELECT id FROM profiles LIMIT 1), 'BBVA Colombia', 'Creando oportunidades',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#004481"/><circle cx="1050" cy="200" r="200" fill="#028AD8" opacity="0.2"/><text x="80" y="210" font-family="Arial Black,sans-serif" font-size="72" font-weight="900" fill="white">BBVA</text><text x="80" y="260" font-family="Arial,sans-serif" font-size="22" fill="#5BBEFF">Creando oportunidades</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.bbva.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 24. Davivienda
((SELECT id FROM profiles LIMIT 1), 'Davivienda', 'Aquí todo es posible',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#ED1C24"/><polygon points="900,0 1200,0 1200,400" fill="white" opacity="0.05"/><text x="80" y="210" font-family="Arial Black,sans-serif" font-size="54" font-weight="900" fill="white">DAVIVIENDA</text><text x="80" y="260" font-family="Arial,sans-serif" font-size="22" fill="rgba(255,255,255,0.8)">Aquí todo es posible</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.davivienda.com', 'header', 500000, 100000, 'active', 'app'),

-- 25. Efecty
((SELECT id FROM profiles LIMIT 1), 'Efecty', 'Envía y recibe dinero en todo Colombia',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#FFD100"/><stop offset="100%" style="stop-color:#FFC000"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="1050" cy="200" r="180" fill="#003DA5" opacity="0.08"/><text x="80" y="210" font-family="Arial Black,sans-serif" font-size="62" font-weight="900" fill="#003DA5">EFECTY</text><text x="80" y="260" font-family="Arial,sans-serif" font-size="20" fill="#003DA5" opacity="0.7">Fácil, rápido y seguro</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.efecty.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 26. Argos
((SELECT id FROM profiles LIMIT 1), 'Cementos Argos', 'Construimos sueños con solidez',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#00A651"/><stop offset="100%" style="stop-color:#007A3D"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><text x="80" y="210" font-family="Arial Black,sans-serif" font-size="58" font-weight="900" fill="white">ARGOS</text><text x="80" y="260" font-family="Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.8)">Construimos sueños con solidez</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.argos.co', 'header', 500000, 100000, 'active', 'app'),

-- 27. Arroz Gelvez
((SELECT id FROM profiles LIMIT 1), 'Arroz Gelvez', 'El arroz de los colombianos',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#C62828"/><stop offset="100%" style="stop-color:#8E0000"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="1000" cy="350" r="250" fill="#FFD54F" opacity="0.08"/><text x="80" y="195" font-family="Arial Black,sans-serif" font-size="48" font-weight="900" fill="white">ARROZ GÉLVEZ</text><text x="80" y="245" font-family="Arial,sans-serif" font-size="20" fill="#FFD54F">El sabor que une a la familia</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.arrozgelvez.com', 'header', 500000, 100000, 'active', 'app'),

-- 28. Fundación Ardilla Lülle
((SELECT id FROM profiles LIMIT 1), 'Fundación Ardilla Lülle', 'Transformando vidas en Colombia',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#1565C0"/><stop offset="100%" style="stop-color:#0D47A1"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="100" cy="200" r="300" fill="white" opacity="0.03"/><text x="80" y="185" font-family="Georgia,serif" font-size="36" fill="white">Fundación</text><text x="80" y="235" font-family="Georgia,serif" font-size="44" font-weight="700" fill="white">ARDILLA LÜLLE</text><text x="80" y="280" font-family="Arial,sans-serif" font-size="18" fill="rgba(255,255,255,0.7)">Educación, salud y bienestar social</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.fundacionardillalule.org', 'header', 500000, 100000, 'active', 'app'),

-- 29. Unicentro
((SELECT id FROM profiles LIMIT 1), 'Unicentro', 'El centro comercial de Colombia',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#6A1B9A"/><stop offset="100%" style="stop-color:#4A148C"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><text x="80" y="210" font-family="Arial Black,sans-serif" font-size="54" font-weight="900" fill="white">UNICENTRO</text><text x="80" y="260" font-family="Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.8)">Todo lo que necesitas en un solo lugar</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.unicentro.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 30. Jardín Plaza
((SELECT id FROM profiles LIMIT 1), 'Jardín Plaza', 'Centro comercial — Cali, Colombia',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#2E7D32"/><stop offset="100%" style="stop-color:#1B5E20"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><text x="80" y="195" font-family="Georgia,serif" font-size="48" font-weight="700" fill="white">JARDÍN PLAZA</text><text x="80" y="245" font-family="Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.7)">Un espacio para disfrutar en familia</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.jardinplaza.com', 'header', 500000, 100000, 'active', 'app'),

-- 31. Colchones Comodísimo
((SELECT id FROM profiles LIMIT 1), 'Colchones Comodísimo', 'Descansa como mereces',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#283593"/><stop offset="100%" style="stop-color:#1A237E"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="1000" cy="100" r="80" fill="#FFC107" opacity="0.15"/><text x="80" y="200" font-family="Arial Black,sans-serif" font-size="44" font-weight="900" fill="white">COMODÍSIMO</text><text x="80" y="250" font-family="Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.7)">Tu descanso perfecto comienza aquí</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.comodisimo.com', 'header', 500000, 100000, 'active', 'app'),

-- 32. Bodytec
((SELECT id FROM profiles LIMIT 1), 'Bodytec', 'Electrofitness — Entrena inteligente',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#0D0D0D"/><rect x="0" y="0" width="1200" height="4" fill="#00E5FF"/><rect x="0" y="396" width="1200" height="4" fill="#00E5FF"/><text x="80" y="210" font-family="Arial Black,sans-serif" font-size="58" font-weight="900" fill="white">BODYTEC</text><text x="80" y="260" font-family="Arial,sans-serif" font-size="20" fill="#00E5FF">20 minutos = 3 horas de gym</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.bodytec.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 33. Drogas La Rebaja
((SELECT id FROM profiles LIMIT 1), 'Drogas La Rebaja', 'Tu farmacia de confianza',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#00796B"/><rect x="0" y="380" width="1200" height="20" fill="#E65100"/><text x="80" y="200" font-family="Arial Black,sans-serif" font-size="42" font-weight="900" fill="white">DROGAS LA REBAJA</text><text x="80" y="250" font-family="Arial,sans-serif" font-size="20" fill="rgba(255,255,255,0.8)">Salud y bienestar al mejor precio</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.larebajavirtual.com', 'header', 500000, 100000, 'active', 'app'),

-- 34. Café Galavis
((SELECT id FROM profiles LIMIT 1), 'Café Galavis', 'El mejor café de Norte de Santander',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#3E2723"/><circle cx="1050" cy="200" r="150" fill="#5D4037" opacity="0.5"/><text x="80" y="195" font-family="Georgia,serif" font-size="48" font-weight="700" fill="#D7CCC8">CAFÉ GALAVIS</text><text x="80" y="245" font-family="Arial,sans-serif" font-size="20" fill="#A1887F">Tradición cafetera colombiana</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.cafegalavis.com', 'header', 500000, 100000, 'active', 'app'),

-- 35. Federación de Cafeteros
((SELECT id FROM profiles LIMIT 1), 'Federación Nacional de Cafeteros', 'Café de Colombia para el mundo',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#1B5E20"/><stop offset="100%" style="stop-color:#2E7D32"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><rect x="70" y="130" width="5" height="140" fill="#FFC107"/><text x="95" y="185" font-family="Georgia,serif" font-size="30" fill="white">FEDERACIÓN NACIONAL DE</text><text x="95" y="230" font-family="Georgia,serif" font-size="42" font-weight="700" fill="#FFC107">CAFETEROS</text><text x="95" y="275" font-family="Arial,sans-serif" font-size="16" fill="rgba(255,255,255,0.7)">Café de Colombia — El mejor suave del mundo</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.federaciondecafeteros.org', 'header', 500000, 100000, 'active', 'app'),

-- 36. Carulla
((SELECT id FROM profiles LIMIT 1), 'Carulla', 'Frescura y calidad premium',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#B71C1C"/><polygon points="800,0 1200,0 1200,400 900,400" fill="#7F0000" opacity="0.5"/><text x="80" y="210" font-family="Arial Black,sans-serif" font-size="60" font-weight="900" fill="white">CARULLA</text><text x="80" y="260" font-family="Arial,sans-serif" font-size="22" fill="rgba(255,255,255,0.8)">FreshMarket — Lo mejor para tu mesa</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.carulla.com', 'header', 500000, 100000, 'active', 'app'),

-- 37. Metro
((SELECT id FROM profiles LIMIT 1), 'Supermercados Metro', 'Ahorro y calidad para tu familia',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#FDD835"/><rect x="0" y="0" width="1200" height="80" fill="#003DA5"/><text x="80" y="55" font-family="Arial Black,sans-serif" font-size="40" font-weight="900" fill="white">METRO</text><text x="80" y="250" font-family="Arial Black,sans-serif" font-size="36" font-weight="900" fill="#003DA5">Precios bajos siempre</text><text x="80" y="300" font-family="Arial,sans-serif" font-size="20" fill="#003DA5" opacity="0.7">Tu supermercado de confianza</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.metro.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 38. Almacenes Olímpica
((SELECT id FROM profiles LIMIT 1), 'Almacenes Olímpica', 'Siempre precios bajos',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#D50000"/><stop offset="100%" style="stop-color:#B71C1C"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><circle cx="1100" cy="200" r="200" fill="#FFEB3B" opacity="0.1"/><text x="80" y="205" font-family="Arial Black,sans-serif" font-size="46" font-weight="900" fill="white">OLÍMPICA</text><text x="80" y="255" font-family="Arial,sans-serif" font-size="22" fill="#FFEB3B">Ahorra más, vive mejor</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.olimpica.com', 'header', 500000, 100000, 'active', 'app'),

-- 39. La Opinión
((SELECT id FROM profiles LIMIT 1), 'La Opinión', 'El diario de Cúcuta y Norte de Santander',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#263238"/><rect x="0" y="0" width="1200" height="6" fill="#D32F2F"/><text x="80" y="195" font-family="Georgia,serif" font-size="50" font-weight="700" fill="white" font-style="italic">La Opinión</text><text x="80" y="245" font-family="Arial,sans-serif" font-size="18" fill="rgba(255,255,255,0.6)">Información veraz desde 1960</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.laopinion.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 40. Nueva EPS
((SELECT id FROM profiles LIMIT 1), 'Nueva EPS', 'Tu salud es nuestra prioridad',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#00838F"/><stop offset="100%" style="stop-color:#006064"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><text x="80" y="205" font-family="Arial Black,sans-serif" font-size="52" font-weight="900" fill="white">NUEVA EPS</text><text x="80" y="255" font-family="Arial,sans-serif" font-size="22" fill="rgba(255,255,255,0.8)">Cuidamos de ti y tu familia</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.nuevaeps.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 41. Sanitas
((SELECT id FROM profiles LIMIT 1), 'Sanitas', 'Salud con calidad humana',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#1565C0"/><circle cx="1050" cy="200" r="200" fill="#42A5F5" opacity="0.15"/><text x="80" y="210" font-family="Arial Black,sans-serif" font-size="56" font-weight="900" fill="white">SANITAS</text><text x="80" y="260" font-family="Arial,sans-serif" font-size="22" fill="rgba(255,255,255,0.8)">Tu bienestar es nuestra razón de ser</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.sanitas.com.co', 'header', 500000, 100000, 'active', 'app'),

-- 42. Fundación Valle del Lili
((SELECT id FROM profiles LIMIT 1), 'Fundación Valle del Lili', 'Centro médico de excelencia',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#0277BD"/><stop offset="100%" style="stop-color:#01579B"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><text x="80" y="185" font-family="Georgia,serif" font-size="34" fill="rgba(255,255,255,0.7)">Fundación</text><text x="80" y="235" font-family="Georgia,serif" font-size="46" font-weight="700" fill="white">VALLE DEL LILI</text><text x="80" y="280" font-family="Arial,sans-serif" font-size="18" fill="rgba(255,255,255,0.6)">Medicina de alta complejidad</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.valledellili.org', 'header', 500000, 100000, 'active', 'app'),

-- 43. Fundación Santa Fe
((SELECT id FROM profiles LIMIT 1), 'Fundación Santa Fe de Bogotá', 'Salud, docencia e investigación',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#1A237E"/><rect x="70" y="140" width="4" height="120" fill="#43A047"/><text x="95" y="190" font-family="Georgia,serif" font-size="30" fill="rgba(255,255,255,0.7)">Fundación</text><text x="95" y="235" font-family="Georgia,serif" font-size="40" font-weight="700" fill="white">SANTA FE DE BOGOTÁ</text><text x="95" y="275" font-family="Arial,sans-serif" font-size="16" fill="#81C784">Hospital universitario de referencia</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.fsfb.org.co', 'header', 500000, 100000, 'active', 'app'),

-- 44. Universidad UIS
((SELECT id FROM profiles LIMIT 1), 'Universidad Industrial de Santander', 'Ciencia y tecnología para Colombia',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#004D40"/><rect x="0" y="0" width="1200" height="6" fill="#FFD600"/><rect x="0" y="394" width="1200" height="6" fill="#FFD600"/><text x="80" y="190" font-family="Georgia,serif" font-size="36" font-weight="700" fill="#FFD600">UIS</text><text x="80" y="240" font-family="Georgia,serif" font-size="28" fill="white">Universidad Industrial de Santander</text><text x="80" y="280" font-family="Arial,sans-serif" font-size="16" fill="rgba(255,255,255,0.6)">Formando líderes desde 1948</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.uis.edu.co', 'header', 500000, 100000, 'active', 'app'),

-- 45. UFPS
((SELECT id FROM profiles LIMIT 1), 'Universidad Francisco de Paula Santander', 'Formando el futuro del Nororiente',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#880E4F"/><circle cx="1050" cy="200" r="200" fill="white" opacity="0.04"/><text x="80" y="190" font-family="Georgia,serif" font-size="36" font-weight="700" fill="#F48FB1">UFPS</text><text x="80" y="235" font-family="Georgia,serif" font-size="24" fill="white">Universidad Francisco de Paula Santander</text><text x="80" y="275" font-family="Arial,sans-serif" font-size="16" fill="rgba(255,255,255,0.6)">Excelencia académica en Norte de Santander</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.ufps.edu.co', 'header', 500000, 100000, 'active', 'app'),

-- 46. Constructora Viviendas y Valores
((SELECT id FROM profiles LIMIT 1), 'Viviendas y Valores', 'Construimos tu futuro — Proyectos inmobiliarios',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#37474F"/><stop offset="100%" style="stop-color:#263238"/></linearGradient></defs><rect width="1200" height="400" fill="url(#g)"/><rect x="0" y="380" width="1200" height="20" fill="#FF6F00"/><text x="80" y="190" font-family="Arial Black,sans-serif" font-size="38" font-weight="900" fill="white">VIVIENDAS Y VALORES</text><text x="80" y="240" font-family="Arial,sans-serif" font-size="20" fill="#FFB74D">Tu hogar soñado es posible</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.viviendasyvalores.com', 'header', 500000, 100000, 'active', 'app'),

-- 47. Constructora Seleus
((SELECT id FROM profiles LIMIT 1), 'Constructora Seleus', 'Arquitectura moderna y funcional',
 'data:image/svg+xml,' || replace(replace(replace('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#1a1a1a"/><polygon points="800,400 1200,0 1200,400" fill="#B8860B" opacity="0.1"/><text x="80" y="210" font-family="Arial Black,sans-serif" font-size="50" font-weight="900" fill="white">SELEUS</text><text x="80" y="260" font-family="Arial,sans-serif" font-size="18" fill="#B8860B">Diseño y construcción de excelencia</text></svg>', '#', '%23'), '"', '%22'), '<', '%3C'),
 'https://www.seleus.com.co', 'header', 500000, 100000, 'active', 'app');
