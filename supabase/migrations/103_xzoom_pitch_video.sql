-- =============================================================================
-- Migración 103: XZOOM EN VIVO — pitch_video_url para landing privada de anfitrión
--
-- Cada anfitrión puede configurar un video de "captación" que se muestra en
-- su landing privada (/xzoom/h/:slug) cuando un invitado llega por su link.
-- =============================================================================

ALTER TABLE xzoom_hosts
  ADD COLUMN IF NOT EXISTS pitch_video_url TEXT;

COMMENT ON COLUMN xzoom_hosts.pitch_video_url IS
  'URL del video de captación (YouTube, Vimeo o MP4 directo) que se muestra a los invitados en /xzoom/h/:slug antes de suscribirse';
