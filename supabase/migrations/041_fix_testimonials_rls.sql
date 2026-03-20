-- Fix: política admin necesita WITH CHECK para INSERT
DROP POLICY IF EXISTS "pt_admin_all" ON payment_testimonials;
CREATE POLICY "pt_admin_all" ON payment_testimonials
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','dev')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','dev')
  ));

-- Fix: política de lectura que también permite al admin ver registros inactivos
DROP POLICY IF EXISTS "pt_admin_read_all" ON payment_testimonials;
CREATE POLICY "pt_admin_read_all" ON payment_testimonials
  FOR SELECT
  USING (
    active = true
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','dev'))
  );

-- Fix: políticas de storage para el bucket testimonials (faltaban completamente)
CREATE POLICY "testimonials_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'testimonials');

CREATE POLICY "testimonials_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'testimonials'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','dev')
    )
  );

CREATE POLICY "testimonials_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'testimonials'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','dev')
    )
  );
