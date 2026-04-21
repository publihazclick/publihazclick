-- =============================================================================
-- Migración 128: soporte multimedia múltiple en plantillas WhatsApp
-- =============================================================================
-- Antes una plantilla tenía a lo sumo UN media (media_url + message_type).
-- Ahora puede tener varios archivos (imágenes + audios + videos + PDFs)
-- y se envían en orden como mensajes separados por el worker.
--
-- Cada item en media_items tiene forma:
--   { "kind": "image"|"audio"|"video"|"pdf",
--     "url":  "...",
--     "filename": "...",
--     "mimetype": "..." }
-- =============================================================================

ALTER TABLE wa_templates
  ADD COLUMN IF NOT EXISTS media_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Back-fill: las plantillas que ya tenían media_url se migran al nuevo formato
-- para que el worker nuevo las respete igual.
UPDATE wa_templates
SET media_items = jsonb_build_array(
  jsonb_build_object(
    'kind', message_type,
    'url', media_url,
    'filename', COALESCE(media_filename, 'archivo'),
    'mimetype', CASE message_type
      WHEN 'image' THEN 'image/jpeg'
      WHEN 'video' THEN 'video/mp4'
      WHEN 'audio' THEN 'audio/mpeg'
      WHEN 'pdf'   THEN 'application/pdf'
      ELSE 'application/octet-stream'
    END
  )
)
WHERE media_url IS NOT NULL
  AND message_type IN ('image','video','audio','pdf')
  AND media_items = '[]'::jsonb;
