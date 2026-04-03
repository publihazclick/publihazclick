-- =============================================================================
-- Migration 067: Add YouTube videos to brand PTC ads
-- Videos sourced from official YouTube channels via RSS feeds
-- =============================================================================

-- ── Mega tier ($2,000) ─────────────────────────────────────────────────────
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=cVDciybD2Cs' WHERE title = 'Bancolombia' AND ad_type = 'mega' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=MoNoAdEW1Sk' WHERE title = 'Avianca' AND ad_type = 'mega' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=z7uDGfdhs38' WHERE title = 'Ecopetrol' AND ad_type = 'mega' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=Lh2sKre6fhU' WHERE title = 'Postobón' AND ad_type = 'mega' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=jsiE3gY9vR4' WHERE title = 'Davivienda' AND ad_type = 'mega' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=nKFbymoYlp8' WHERE title = 'Banco de Bogotá' AND ad_type = 'mega' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=IXDzkhtlaqQ' WHERE title = 'Federación de Cafeteros' AND ad_type = 'mega' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=NjwHbvzxdbo' WHERE title = 'Toyota Colombia' AND ad_type = 'mega' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=nR2U938QRHA' WHERE title = 'Renault Colombia' AND ad_type = 'mega' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=oRHiSiWJIS4' WHERE title = 'Chevrolet Colombia' AND ad_type = 'mega' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=VjMXP-zQgEA' WHERE title = 'Universidad Nacional' AND ad_type = 'mega' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=6wYrZz70G7E' WHERE title = 'Leonisa' AND ad_type = 'mega' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=8gbjpUplJFk' WHERE title = 'Almacenes Olímpica' AND ad_type = 'mega' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=VKdsVbTq8D8' WHERE title = 'BBVA Colombia' AND ad_type = 'mega' AND youtube_url IS NULL;

-- ── Standard_400 tier ($400) ───────────────────────────────────────────────
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=_IIkDdieUdM' WHERE title = 'Movistar' AND ad_type = 'standard_400' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=VCZF-YfCyiA' WHERE title = 'Tigo' AND ad_type = 'standard_400' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=3E458FKyTuY' WHERE title = 'Mabe' AND ad_type = 'standard_400' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=2LYz-L22JaU' WHERE title = 'Mazda Colombia' AND ad_type = 'standard_400' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=WmH4f74VniU' WHERE title = 'Arturo Calle' AND ad_type = 'standard_400' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=ocEwPTL5T4U' WHERE title = 'Sanitas' AND ad_type = 'standard_400' AND youtube_url IS NULL;

-- ── Mini tier ($83.33) ─────────────────────────────────────────────────────
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=u54QK77wue4' WHERE title = 'Bavaria' AND ad_type = 'mini' AND youtube_url IS NULL;
UPDATE ptc_tasks SET youtube_url = 'https://www.youtube.com/watch?v=t0p0GT8J388' WHERE title = 'Cementos Argos' AND ad_type = 'mini' AND youtube_url IS NULL;
