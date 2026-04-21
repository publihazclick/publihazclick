-- =============================================================================
-- Migración 130: pausa entre bloques (por día o 1h 20min)
-- =============================================================================
-- El worker marca block_completed_at cuando ya no hay mensajes pending/sending
-- del current_block. Luego espera antes de avanzar al siguiente bloque:
--   - Si la campaña tiene schedule con 2+ días permitidos → espera al próximo
--     día permitido (1 bloque por día).
--   - Si tiene schedule con un solo día → espera 80 minutos (1h 20min).
--   - Si no tiene schedule → avanza de inmediato.
--
-- Al reanudar un bloque nuevo, se limpia block_completed_at.
-- =============================================================================

ALTER TABLE wa_campaigns
  ADD COLUMN IF NOT EXISTS block_completed_at timestamptz;
