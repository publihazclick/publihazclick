-- 167: Borra el módulo domicilios para rehacerlo desde cero
DROP TABLE IF EXISTS ag_delivery_offers CASCADE;
DROP TABLE IF EXISTS ag_delivery_requests CASCADE;
DROP VIEW IF EXISTS ag_delivery_offers_v;
DROP FUNCTION IF EXISTS ag_complete_delivery_earnings(UUID);
DROP FUNCTION IF EXISTS ag_notify_motos_on_delivery_request();
DROP TRIGGER IF EXISTS ag_delivery_request_notify ON ag_delivery_requests;
