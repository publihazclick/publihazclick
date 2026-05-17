-- Añade país y departamento/estado a ag_users para mejor geolocalización
ALTER TABLE ag_users
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Colombia',
  ADD COLUMN IF NOT EXISTS department TEXT DEFAULT '';
