-- ============================================================================
-- 026: Limpieza de pagos resueltos
-- - Política RLS para que admins eliminen pagos no-pending
-- - Función para auto-eliminar pagos rechazados después de 24 horas
-- ============================================================================

-- 1. Política para permitir a admins eliminar pagos resueltos
CREATE POLICY "admins_delete_resolved_payments"
ON payments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'dev')
  )
  AND status <> 'pending'
);

-- 2. Función para eliminar pagos rechazados con más de 24 horas
CREATE OR REPLACE FUNCTION cleanup_rejected_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM payments
  WHERE status = 'declined'
    AND updated_at < NOW() - INTERVAL '24 hours';
END;
$$;

-- 3. Habilitar pg_cron si no está activo
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 4. Programar ejecución cada hora para limpiar rechazados vencidos
SELECT cron.schedule(
  'cleanup-rejected-payments',
  '0 * * * *',
  $$SELECT cleanup_rejected_payments()$$
);
