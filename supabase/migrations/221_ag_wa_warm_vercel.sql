-- Migration 221: cron que mantiene "caliente" la función serverless de Vercel que sirve
-- /anda-gana, para eliminar el cold start de ~9-20s que causaba la pantalla en blanco al abrir
-- Movi. Encontrado el 2026-08-11 midiendo directamente: primera petición 9.4s de TTFB, las
-- siguientes <1s -- patrón clásico de cold start, reproducible en varios teléfonos distintos
-- (no era ni el WebView ni el HTML/CSS del splash, ambos ya verificados correctos por separado).
--
-- No se tocó el enrutamiento de Vercel (vercel.json ya dice que esta ruta debería servirse
-- estática, pero en la práctica sigue pasando por la función Express/SSR) porque cambiar eso a
-- ciegas es más riesgoso que mantener la función despierta con pings periódicos -- mismo patrón
-- ya usado en movi-health-check (migración 218).

SELECT cron.schedule(
  'movi-warm-anda-gana',
  '*/4 * * * *',
  $$ SELECT net.http_get(url := 'https://www.publihazclick.com/anda-gana', timeout_milliseconds := 15000); $$
);
