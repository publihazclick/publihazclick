-- =============================================================================
-- Migración 120: Limpieza automática de pagos no aprobados > 24 h
--
-- Contexto:
--   La tabla payments acumula intentos fallidos/abandonados (status != 'approved')
--   cuando el webhook de la pasarela no confirma el cobro. Solo los 'approved'
--   representan compras reales y deben conservarse como auditoría.
--
-- Comportamiento:
--   - Función cleanup_stale_payments(): borra payments con status != 'approved'
--     cuya antigüedad > 24 h.
--   - Cron diario a las 08:00 UTC (03:00 hora Colombia) que la ejecuta.
--
-- Garantías de no-daño:
--   - Solo DELETE sobre la tabla payments; no toca profiles, user_packages,
--     balances, roles ni paquetes activos.
--   - Preserva TODOS los 'approved' (auditoría intacta).
--   - Preserva pending/declined/voided/error de las últimas 24 h (un pago en
--     curso todavía puede recibir su webhook).
-- =============================================================================

-- 1. Extensión pg_cron (idempotente, Supabase ya la tiene disponible)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Función de limpieza reutilizable
CREATE OR REPLACE FUNCTION public.cleanup_stale_payments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM payments
   WHERE status <> 'approved'
     AND created_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_payments() IS
  'Borra payments no aprobados con más de 24 h. Conserva approved (auditoría) y pendientes recientes.';

-- 3. Desagendar job previo si existiera (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-stale-payments');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 4. Agendar ejecución diaria a las 08:00 UTC (= 03:00 America/Bogotá)
SELECT cron.schedule(
  'cleanup-stale-payments',
  '0 8 * * *',
  $cron$SELECT public.cleanup_stale_payments();$cron$
);
