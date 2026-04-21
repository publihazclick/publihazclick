-- =============================================================================
-- Migración 127: auto-completar campaña al procesar el último mensaje
-- =============================================================================
-- Antes: update_wa_campaign_stats solo recalculaba contadores. El cambio de
-- status a 'completed' dependía de que el worker (cron cada 2 min) volviera
-- a entrar, viera 0 pendientes y lo marcara. Esto dejaba la campaña en
-- "Enviando" varios minutos después de enviado el último mensaje.
--
-- Ahora: el propio trigger detecta cuando `total_msgs == done_msgs` y cierra
-- la campaña de inmediato (status='completed', completed_at=now()).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_wa_campaign_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_msgs   int;
  done_msgs    int;
  current_st   text;
BEGIN
  UPDATE wa_campaigns SET
    sent_count      = (SELECT count(*) FROM wa_campaign_messages WHERE campaign_id = NEW.campaign_id AND status IN ('sent','delivered','replied')),
    delivered_count = (SELECT count(*) FROM wa_campaign_messages WHERE campaign_id = NEW.campaign_id AND status IN ('delivered','replied')),
    failed_count    = (SELECT count(*) FROM wa_campaign_messages WHERE campaign_id = NEW.campaign_id AND status = 'failed'),
    reply_count     = (SELECT count(*) FROM wa_campaign_messages WHERE campaign_id = NEW.campaign_id AND status = 'replied'),
    updated_at      = now()
  WHERE id = NEW.campaign_id;

  -- ¿Ya no quedan mensajes pendientes ni enviandose?
  SELECT count(*) INTO total_msgs FROM wa_campaign_messages WHERE campaign_id = NEW.campaign_id;
  SELECT count(*) INTO done_msgs  FROM wa_campaign_messages WHERE campaign_id = NEW.campaign_id AND status NOT IN ('pending','sending');

  IF total_msgs > 0 AND done_msgs >= total_msgs THEN
    SELECT status INTO current_st FROM wa_campaigns WHERE id = NEW.campaign_id;
    IF current_st IN ('running', 'scheduled') THEN
      UPDATE wa_campaigns
      SET status       = 'completed',
          completed_at = COALESCE(completed_at, now())
      WHERE id = NEW.campaign_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
