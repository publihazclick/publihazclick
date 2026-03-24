-- =============================================================================
-- Migration 054: Anda y Gana — Método de pago en solicitudes de viaje
-- =============================================================================

ALTER TABLE ag_trip_requests
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'efectivo'
    CHECK (payment_method IN ('efectivo','nequi','daviplata','bancolombia','tarjeta'));
