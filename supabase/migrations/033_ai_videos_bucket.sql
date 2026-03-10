-- ============================================================
-- Migración 033: Bucket de Storage para videos generados con IA
-- ============================================================

-- Crear bucket ai-videos (privado, acceso público por URL)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-videos',
  'ai-videos',
  true,
  104857600, -- 100 MB límite por archivo
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- Política: usuarios autenticados pueden subir sus propios videos
CREATE POLICY "Users can upload their ai videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ai-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Política: lectura pública (los videos son públicos para compartir)
CREATE POLICY "Public read ai videos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'ai-videos');

-- Política: usuarios pueden eliminar sus propios videos
CREATE POLICY "Users can delete their ai videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ai-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Política: service role puede subir (para la edge function check-vertex-video)
CREATE POLICY "Service role can upload ai videos"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'ai-videos');
