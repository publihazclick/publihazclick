-- =============================================================================
-- Migration 236: permite 'cedula_back' y 'license_back' en ag_driver_documents
-- =============================================================================
-- La pantalla "Mis documentos" (2026-08-23) agregó tarjetas separadas para el
-- reverso de cédula y licencia ('cedula_back' / 'license_back'), pero el CHECK
-- constraint original (migración 115) nunca se actualizó -- todo conductor que
-- intentaba subir esos dos documentos recibía el error crudo de Postgres
-- "violates check constraint ag_driver_documents_doc_type_check" en pantalla.

ALTER TABLE ag_driver_documents
  DROP CONSTRAINT IF EXISTS ag_driver_documents_doc_type_check;

ALTER TABLE ag_driver_documents
  ADD CONSTRAINT ag_driver_documents_doc_type_check
  CHECK (doc_type IN (
    'license', 'soat', 'tecnomecanica', 'cedula', 'vehicle_front', 'vehicle_back',
    'insurance', 'cedula_back', 'license_back'
  ));
