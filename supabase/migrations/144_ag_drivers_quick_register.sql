-- Permite registro rápido de conductores sin placa ni documentos
-- (el conductor completa la información más tarde en su perfil)
ALTER TABLE public.ag_drivers
  ALTER COLUMN license_number   DROP NOT NULL,
  ALTER COLUMN license_category DROP NOT NULL,
  ALTER COLUMN license_expiry   DROP NOT NULL,
  ALTER COLUMN plate            DROP NOT NULL,
  ALTER COLUMN vehicle_brand    DROP NOT NULL,
  ALTER COLUMN vehicle_model    DROP NOT NULL,
  ALTER COLUMN vehicle_year     DROP NOT NULL,
  ALTER COLUMN vehicle_color    DROP NOT NULL;
