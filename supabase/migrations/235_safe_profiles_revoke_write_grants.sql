-- Higiene de seguridad: safe_profiles (creada en la migracion 233 para reemplazar la lectura
-- wide-open de profiles) tenia grants de escritura (INSERT/UPDATE/DELETE/TRUNCATE) heredados por
-- defecto para anon/authenticated que nunca se necesitaron -- la vista es de solo lectura por
-- diseno. Se revocan para no depender de que Postgres rechace la escritura por otras vias.
revoke insert, update, delete, truncate, references, trigger on public.safe_profiles from anon, authenticated;
