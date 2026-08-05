-- =============================================================================
-- Migration 187: Ajuste de topes de antigüedad -- pedido explícito del usuario
-- 2026-08-04, tras ver la recomendación inicial (20/15 años, migración 185):
-- sube el tope de carros a 23 años y el de motos a 17.
-- =============================================================================

UPDATE public.platform_settings SET value = '23' WHERE key = 'ag_max_vehicle_age_car';
UPDATE public.platform_settings SET value = '17' WHERE key = 'ag_max_vehicle_age_moto';
