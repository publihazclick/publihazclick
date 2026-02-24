-- Agrega política RLS para que admins puedan insertar perfiles de cualquier usuario
-- El upsert desde el panel admin falla porque auth.uid() = admin_id, no el id del nuevo usuario
CREATE POLICY "Admins can insert profiles"
ON profiles
FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_dev(auth.uid()));
