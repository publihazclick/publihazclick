-- ════════════════════════════════════════════════════════════════════════════
-- 296 — "Cotizar" en el WhatsApp de pasajeros (2026-10-01)
--
-- El menú de pasajeros suma la opción "💰 Cotizar un viaje": misma ruta que pedir
-- (recogida -> destino -> resumen), pero el resumen muestra el precio de CARRO y
-- de MOTO a la vez y nada se pide hasta que toque uno de los dos.
--   cotizar      -> la sesión viene de "Cotizar" (resumen con los dos precios).
--   precio_moto  -> precio sugerido de moto para ese mismo recorrido; el de carro
--                   va en offered_price como siempre.
-- Aplicada vía Management API, NO db push (ver movi_migration_history_desync_danger).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ag_wa_sessions
  ADD COLUMN IF NOT EXISTS cotizar     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS precio_moto integer;

COMMENT ON COLUMN public.ag_wa_sessions.cotizar IS
  'La conversación viene de "Cotizar un viaje": el resumen muestra carro y moto. Migración 296.';
COMMENT ON COLUMN public.ag_wa_sessions.precio_moto IS
  'Precio sugerido de moto para el recorrido cotizado (el de carro va en offered_price). Migración 296.';
