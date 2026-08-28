-- Keep-warm para ag-whatsapp (2026-08-28): reportado "cuando un pasajero manda
-- su ubicación por WhatsApp, tarda demasiado en cargar". Medido en producción
-- (function_edge_logs) que la mayoría de los mensajes de ubicación responden
-- en 0.5-1.5s (ya optimizado antes, ver migración/commit 1b6fe4d), pero se
-- encontró al menos un caso real el mismo día de una respuesta de 5.5s tras
-- ~35 minutos sin tráfico -- consistente con el isolate de Deno enfriándose.
-- El proyecto ya tiene un cron "movi-warm-anda-gana" que hace exactamente
-- esto para la app web (net.http_get cada 4 min) -- este es el mismo patrón
-- aplicado a la función del bot de WhatsApp, que no tenía ninguno.
--
-- El GET sin "hub.verify_token" válido responde 403 "Forbidden" rápido (ver
-- el bloque `if (req.method === 'GET')` en ag-whatsapp/index.ts) -- no importa,
-- el objetivo es solo forzar a Deno a mantener el isolate cargado en memoria,
-- no que la respuesta sea 200.
select cron.schedule(
  'movi-wa-warm-keeper',
  '*/4 * * * *',
  $$ SELECT net.http_get(
       url := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp',
       timeout_milliseconds := 8000
     ); $$
);
