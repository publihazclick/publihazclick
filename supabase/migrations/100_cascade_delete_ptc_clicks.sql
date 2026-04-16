-- ============================================================================
-- 100: Borrado en cascada de ptc_clicks cuando se elimina un ptc_task
-- ----------------------------------------------------------------------------
-- La FK ptc_clicks.task_id estaba con NO ACTION, lo que bloqueaba
-- silenciosamente cualquier DELETE de un ptc_task con clicks asociados.
-- Esto rompía el botón "Eliminar" del componente AdvertiserAds del usuario.
-- ============================================================================

ALTER TABLE public.ptc_clicks
  DROP CONSTRAINT IF EXISTS ptc_clicks_task_id_fkey;

ALTER TABLE public.ptc_clicks
  ADD CONSTRAINT ptc_clicks_task_id_fkey
  FOREIGN KEY (task_id)
  REFERENCES public.ptc_tasks(id)
  ON DELETE CASCADE;
