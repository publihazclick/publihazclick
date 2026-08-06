-- ════════════════════════════════════════════════════════════
-- 199: Fase 3 del canal WhatsApp -- lenguaje natural / notas de voz
-- ════════════════════════════════════════════════════════════
-- Cuando el pasajero describe todo de una vez ("necesito un carro al
-- aeropuerto") en lenguaje natural (texto libre o nota de voz transcrita),
-- el destino mencionado se recuerda aquí mientras se termina de resolver
-- el origen, para no tener que volver a preguntarlo.

ALTER TABLE ag_wa_sessions
  ADD COLUMN IF NOT EXISTS pending_dest_text text;
