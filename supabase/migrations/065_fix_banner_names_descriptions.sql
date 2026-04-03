-- =============================================================================
-- Migration 065: Fix corrupted accented characters in banner names/descriptions
-- The original migration inserted UTF-8 accented chars that got corrupted to �
-- =============================================================================

-- ── FIX NAMES ──────────────────────────────────────────────────────────────

UPDATE banner_ads SET name = 'Almacenes Olímpica' WHERE id = 'ac8f6bfb-670f-4413-95d4-7d4a31110410';
UPDATE banner_ads SET name = 'Arroz Gélvez' WHERE id = '0cf596b2-0391-4eac-8906-6e5e823dc58e';
UPDATE banner_ads SET name = 'Banco de Bogotá' WHERE id = '5f9491cc-26b7-4074-a757-488cd2a7aad9';
UPDATE banner_ads SET name = 'Café Galavis' WHERE id = 'c9a845e4-2d00-49ed-8de1-cb4d996cd6c6';
UPDATE banner_ads SET name = 'Colchones Comodísimo' WHERE id = '3e0462c4-a8f3-4a1d-977b-182d6e99328d';
UPDATE banner_ads SET name = 'Federación de Cafeteros' WHERE id = '3f257408-dd36-47dc-b2f5-b9f09a1c9695';
UPDATE banner_ads SET name = 'Fundación Ardilla Lülle' WHERE id = 'fc6a733e-2b90-4a76-b3a0-46b5d03ac38c';
UPDATE banner_ads SET name = 'Fundación Santa Fe' WHERE id = '4c558306-a54f-4391-8e63-20ff7ffa2d36';
UPDATE banner_ads SET name = 'Fundación Valle del Lili' WHERE id = '6096f467-78de-4aee-bae0-80d8770ee54f';
UPDATE banner_ads SET name = 'Jardín Plaza' WHERE id = '96d9cbe0-ed83-4da1-8f0f-11372250c719';
UPDATE banner_ads SET name = 'La Opinión' WHERE id = '56f03cef-8f12-4518-959a-947191c7fc88';
UPDATE banner_ads SET name = 'Postobón' WHERE id = '2646fda9-feb0-41f4-8773-c3609779b230';
UPDATE banner_ads SET name = 'Vélez' WHERE id = '22f6ad57-7649-4fc8-ba61-d82de0378d28';

-- ── FIX DESCRIPTIONS ───────────────────────────────────────────────────────

UPDATE banner_ads SET description = 'Ahorra más, vive mejor' WHERE id = 'ac8f6bfb-670f-4413-95d4-7d4a31110410';
UPDATE banner_ads SET description = 'Tradición cervecera desde 1889' WHERE id = '857229ee-5612-409f-8d04-66121fab229a';
UPDATE banner_ads SET description = 'Tradición cafetera' WHERE id = 'c9a845e4-2d00-49ed-8de1-cb4d996cd6c6';
UPDATE banner_ads SET description = 'Energía que transforma' WHERE id = '6199b9fa-ce50-453a-9b1c-191414ac2920';
UPDATE banner_ads SET description = 'Fácil, rápido y seguro' WHERE id = '8977b2bd-180f-4330-8620-e29782967696';
UPDATE banner_ads SET description = 'El mejor café del mundo' WHERE id = '3f257408-dd36-47dc-b2f5-b9f09a1c9695';
UPDATE banner_ads SET description = 'Educación y bienestar social' WHERE id = 'fc6a733e-2b90-4a76-b3a0-46b5d03ac38c';
UPDATE banner_ads SET description = 'Salud e investigación' WHERE id = '4c558306-a54f-4391-8e63-20ff7ffa2d36';
UPDATE banner_ads SET description = 'Excelencia médica' WHERE id = '6096f467-78de-4aee-bae0-80d8770ee54f';
UPDATE banner_ads SET description = 'Construye el hogar de tus sueños' WHERE id = '3cac2013-4e92-4f2e-8b1d-790f7c6260eb';
UPDATE banner_ads SET description = 'El diario de Cúcuta' WHERE id = '56f03cef-8f12-4518-959a-947191c7fc88';
UPDATE banner_ads SET description = 'Tu hogar, nuestra inspiración' WHERE id = '4ab7dff9-b5f9-4542-a991-e3bddadc8fc1';
UPDATE banner_ads SET description = 'Tu vida digital sin límites' WHERE id = '8c4e8ff8-3f34-41fb-85ca-5d9a2fcaa82b';
UPDATE banner_ads SET description = 'Ciencia y tecnología desde 1948' WHERE id = '383a3a09-7d67-49d5-b0b0-099ee746db23';
UPDATE banner_ads SET description = 'Excelencia académica desde 1867' WHERE id = 'd0dd7dbf-9c17-464c-85ab-63ace8cf91d1';
UPDATE banner_ads SET description = 'Tu hogar soñado' WHERE id = 'bccb6dde-77f2-4d5c-9111-f7bf2a05b79f';
UPDATE banner_ads SET description = 'Diseño y construcción' WHERE id = '33643e3b-1f32-4ad4-a211-255d777e1060';
UPDATE banner_ads SET description = 'Aquí todo es posible' WHERE id = 'dbad14c0-f740-4f90-a504-dcd499369058';
