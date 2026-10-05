-- 314 (2026-10-05): pulso cada minuto para que ag-whatsapp no arranque en frío.
-- Medido: ubicación con la función dormida 1,6-1,9 s; despierta 0,6-0,7 s. Con pocos
-- pasajeros al día casi todos caían en frío. ag-whatsapp responde a {"calentar":true}
-- sin mandar mensajes ni tocar datos (solo una consulta a la tabla de barrios).
-- ~43.000 llamadas al mes. Para apagarlo: SELECT cron.unschedule('movi-calentar-whatsapp');
SELECT cron.unschedule('movi-calentar-whatsapp')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'movi-calentar-whatsapp');

SELECT cron.schedule(
  'movi-calentar-whatsapp',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('calentar', true),
    timeout_milliseconds := 5000
  );
  $$
);
