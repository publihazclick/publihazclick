-- Desactivar todos los ptc_tasks de tipo standard_600
UPDATE ptc_tasks SET status = 'completed' WHERE ad_type = 'standard_600';
-- Verificar
SELECT COUNT(*) as std600_remaining FROM ptc_tasks WHERE ad_type = 'standard_600' AND status = 'active';
