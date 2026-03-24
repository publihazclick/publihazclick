-- =============================================================================
-- Migration 052: Rentabilidad mensual global del Trading Bot AI
-- El administrador puede fijar el % de retorno mensual desde el panel admin.
-- Rango: 2.5% (mínimo) a 30% (máximo). Por defecto: 30%.
-- =============================================================================

INSERT INTO platform_settings (key, value)
VALUES ('trading_monthly_return_pct', '30')
ON CONFLICT (key) DO NOTHING;
