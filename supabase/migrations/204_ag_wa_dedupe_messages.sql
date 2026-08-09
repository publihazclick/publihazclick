-- =============================================================================
-- Migración 204: Deduplicación de mensajes entrantes de WhatsApp.
--
-- Meta entrega los webhooks con garantía "al menos una vez", no "exactamente
-- una vez" -- si nuestra función tarda en responder o hay cualquier hipo de
-- red, Meta reintenta el mismo mensaje. Sin protección, eso hace que
-- handleConversation() se ejecute dos veces para el mismo mensaje (bug real
-- 2026-08-09: el saludo y el menú de Movi llegaban duplicados). Se guarda el
-- id de cada mensaje ya procesado; si ya existe, se descarta el reintento.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ag_wa_processed_messages (
  message_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ag_wa_processed_messages ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo el service role (usado por la edge function) puede
-- leer/escribir, igual que el resto de tablas internas de WhatsApp.

-- Limpieza diaria de mensajes viejos para que la tabla no crezca sin limite.
SELECT cron.schedule(
  'movi-wa-cleanup-processed-messages',
  '0 3 * * *',
  $$DELETE FROM public.ag_wa_processed_messages WHERE created_at < now() - interval '2 days'$$
);
