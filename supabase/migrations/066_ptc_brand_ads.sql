-- =============================================================================
-- Migration 066: PTC ads for brand banner companies
-- Creates PTC tasks at 3 price tiers for each brand
-- mega=$2000/60s, standard_400=$400/30s, mini=$83.33/15s
-- All use the same advertiser_id as the banner (first profile)
-- =============================================================================

DO $$
DECLARE
  v_adv_id uuid;
BEGIN
  SELECT id INTO v_adv_id FROM profiles LIMIT 1;

  -- ── MEGA ($2,000 COP) ────────────────────────────────────────────────────
  INSERT INTO ptc_tasks (title, description, url, reward, duration, daily_limit, ad_type, status, location, advertiser_id) VALUES
  ('Bancolombia', 'Tu banco de confianza — Soluciones financieras para todos los colombianos', 'https://www.bancolombia.com', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('Avianca', 'Vuela con la aerolínea líder de Colombia — Ofertas especiales', 'https://www.avianca.com', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('Ecopetrol', 'Energía que transforma a Colombia — Compromiso con el futuro sostenible', 'https://www.ecopetrol.com.co', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('Postobón', 'El sabor de Colombia desde 1904 — Refrescamos tus mejores momentos', 'https://www.postobon.com', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('Davivienda', 'Aquí todo es posible — Tu aliado financiero de confianza', 'https://www.davivienda.com', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('Homecenter', 'Todo para tu hogar en un solo lugar — Descuentos hasta del 40%', 'https://www.homecenter.com.co', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('Almacenes Olímpica', 'Ahorra más, vive mejor — Siempre precios bajos', 'https://www.olimpica.com', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('Banco de Bogotá', 'Más de 150 años construyendo confianza — Tu aliado financiero', 'https://www.bancodebogota.com', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('Federación de Cafeteros', 'Café de Colombia para el mundo — El mejor suave del mundo', 'https://www.federaciondecafeteros.org', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('Toyota Colombia', 'Lets Go Places — Calidad y confiabilidad japonesa', 'https://www.toyota.com.co', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('Renault Colombia', 'Pasión por la vida — Descubre la nueva línea 2026', 'https://www.renault.com.co', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('Chevrolet Colombia', 'Find New Roads — Tecnología que te mueve hacia adelante', 'https://www.chevrolet.com.co', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('Universidad Nacional', 'La universidad de la nación — Excelencia académica desde 1867', 'https://www.unal.edu.co', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('Leonisa', 'Mujeres reales, belleza real — Ropa interior y moda colombiana', 'https://www.leonisa.com', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id),
  ('BBVA Colombia', 'Creando oportunidades — Banca digital para todos', 'https://www.bbva.com.co', 2000, 60, 100, 'mega', 'active', 'app', v_adv_id);

  -- ── STANDARD_400 ($400 COP) ──────────────────────────────────────────────
  INSERT INTO ptc_tasks (title, description, url, reward, duration, daily_limit, ad_type, status, location, advertiser_id) VALUES
  ('Movistar', 'Conectamos a los colombianos con el mundo — Planes móviles e internet', 'https://www.movistar.com.co', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('Tigo', 'Tu vida digital sin límites — Internet, móvil y entretenimiento', 'https://www.tigo.com.co', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('Efecty', 'Fácil, rápido y seguro — Envía y recibe dinero en toda Colombia', 'https://www.efecty.com.co', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('Carulla', 'FreshMarket — Lo mejor para tu mesa con frescura y calidad premium', 'https://www.carulla.com', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('Supermercados Metro', 'Precios bajos siempre — Tu supermercado de confianza', 'https://www.metro.com.co', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('Mazda Colombia', 'Feel Alive — Pasión por conducir con diseño innovador', 'https://www.mazda.com.co', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('LG Electronics', 'Life is Good — Tecnología e innovación para una vida mejor', 'https://www.lg.com/co', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('Mabe', 'Tu hogar, nuestra inspiración — Electrodomésticos que facilitan tu vida', 'https://www.mabe.com.co', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('Koaj', 'Tu estilo, tu precio — Moda accesible para toda la familia', 'https://www.koaj.co', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('Nueva EPS', 'Cuidamos de ti y tu familia — Tu salud es nuestra prioridad', 'https://www.nuevaeps.com.co', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('Sanitas', 'Tu bienestar es nuestra razón de ser — Salud con calidad humana', 'https://www.sanitas.com.co', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('Drogas La Rebaja', 'Salud y bienestar al mejor precio — Tu farmacia de confianza', 'https://www.larebajavirtual.com', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('Unicentro', 'Todo lo que necesitas en un solo lugar — El centro comercial de Colombia', 'https://www.unicentro.com.co', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('Arturo Calle', 'Elegancia colombiana — Moda masculina con estilo desde Colombia', 'https://www.arturocalle.com', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id),
  ('Studio F', 'Fashion for Women — Moda femenina premium colombiana', 'https://www.studiof.com.co', 400, 30, 50, 'standard_400', 'active', 'app', v_adv_id);

  -- ── MINI ($83.33 COP) ────────────────────────────────────────────────────
  INSERT INTO ptc_tasks (title, description, url, reward, duration, daily_limit, ad_type, status, location, advertiser_id) VALUES
  ('Bavaria', 'Tradición cervecera desde 1889 — Cerveza colombiana con historia', 'https://www.bavaria.co', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('Oster', 'Calidad en cada momento del día — Desde 1924 creando momentos', 'https://www.oster.com.co', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('Vélez', 'El arte del cuero desde 1986 — Cuero colombiano de clase mundial', 'https://www.velez.com.co', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('Café Galavis', 'Tradición cafetera — El mejor café de Norte de Santander', 'https://www.cafegalavis.com', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('Bodytec', 'Electrofitness inteligente — 20 minutos equivalen a 3 horas de gym', 'https://www.bodytec.com.co', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('Cementos Argos', 'Construimos sueños con solidez — Líder en cemento colombiano', 'https://www.argos.co', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('La Opinión', 'El diario de Cúcuta y Norte de Santander — Información veraz desde 1960', 'https://www.laopinion.com.co', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('Jardín Plaza', 'Un espacio para disfrutar en familia — Centro comercial en Cali', 'https://www.jardinplaza.com', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('Colchones Comodísimo', 'Tu descanso perfecto comienza aquí — Descansa como mereces', 'https://www.comodisimo.com', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('Fundación Valle del Lili', 'Excelencia médica — Medicina de alta complejidad en Colombia', 'https://www.valledellili.org', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('Fundación Santa Fe', 'Salud, docencia e investigación — Hospital universitario de referencia', 'https://www.fsfb.org.co', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('Fundación Ardilla Lülle', 'Educación y bienestar social — Transformando vidas en Colombia', 'https://www.fundacionardillalule.org', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('UIS', 'Ciencia y tecnología desde 1948 — Universidad Industrial de Santander', 'https://www.uis.edu.co', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('UFPS', 'Excelencia académica en Norte de Santander — Universidad Francisco de Paula Santander', 'https://www.ufps.edu.co', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('Viviendas y Valores', 'Tu hogar soñado es posible — Proyectos inmobiliarios de confianza', 'https://www.viviendasyvalores.com', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('Constructora Seleus', 'Diseño y construcción de excelencia — Arquitectura moderna y funcional', 'https://www.seleus.com.co', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id),
  ('Arroz Gélvez', 'El sabor que une a la familia — El arroz de los colombianos', 'https://www.arrozgelvez.com', 83.33, 15, 25, 'mini', 'active', 'app', v_adv_id);

END $$;
