-- ============================================================================
-- Migración 291: limpiar de verdad la basura que inflaba la base (2026-09-30).
--
-- ── EL PROBLEMA ────────────────────────────────────────────────────────────
-- La base de publihazclick pesaba **163 MB**, pero los datos del negocio son
-- minúsculos: la tabla más grande con información real es `ptc_clicks` con 4.703
-- filas. De esos 163 MB:
--     96 MB  ->  net._http_response      (540 filas vivas)
--     28 MB  ->  cron.job_run_details    (23.206 filas)
-- O sea **124 MB, el 76% de la base, eran hinchazón de dos tablas de registro**.
--
-- ── POR QUÉ NO LO ARREGLABA EL CRON QUE YA EXISTÍA ─────────────────────────
-- Ya había un cron semanal (`limpiar-historial-crons`) que hacía
--     delete from cron.job_run_details where start_time <= now() - interval '7 days'
-- y aun así la tabla pesaba 28 MB. La razón es la trampa clásica de Postgres:
-- **DELETE no devuelve el espacio al disco.** Marca las filas como muertas y deja
-- el archivo del mismo tamaño, esperando que autovacuum reuse los huecos. Con
-- cinco crons corriendo cada minuto (movi-chat-sin-respuesta, movi-check-retry-
-- dispatch, movi-driver-wait-prompt, movi-wa-arrival-reminder, movi-wa-stale-
-- search-check) autovacuum nunca alcanzaba, y el archivo solo crecía.
--
-- Lo mismo con `net._http_response`: pg_net borra sus propias respuestas viejas,
-- pero el archivo ya estaba inflado a 96 MB para 540 filas vivas.
--
-- ── QUÉ SE HIZO ────────────────────────────────────────────────────────────
-- Se corrió `VACUUM FULL` sobre las dos (reescribe el archivo compacto y devuelve
-- el espacio), **sin perder ninguna fila** en net._http_response, y borrando de
-- job_run_details solo lo de más de 2 días.
--     net._http_response    96 MB -> 776 kB   (540 filas intactas)
--     cron.job_run_details  28 MB -> 2,6 MB   (4.382 filas recientes conservadas)
--     BASE COMPLETA        163 MB -> 42 MB
--
-- ── POR QUÉ IMPORTA AHORA ──────────────────────────────────────────────────
-- Esta organización de Supabase está en plan Pro facturado a través de Vercel y se
-- va a bajar a Free, cuyo límite es 500 MB. A 163 MB cabía, pero con la basura
-- creciendo sola el margen se iba comiendo. A 42 MB sobra espacio de verdad.
--
-- Esta migración deja el mantenimiento automático para que no vuelva a pasar.
-- ============================================================================

-- ─── Mantenimiento de las tablas de registro ────────────────────────────────
-- Se conservan 2 días de historial de crons: alcanza para diagnosticar un fallo
-- reciente (que es para lo único que sirve) y evita acumular decenas de miles de
-- filas. El VACUUM va DESPUÉS del DELETE en la misma corrida, que es justo lo que
-- le faltaba al cron anterior.
--
-- VACUUM no puede correr dentro de una transacción, y una función plpgsql SIEMPRE
-- corre dentro de una. Por eso el cron ejecuta los comandos sueltos, uno por uno,
-- en vez de llamar a una función que los envuelva.
SELECT cron.unschedule('limpiar-historial-crons')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpiar-historial-crons');

SELECT cron.unschedule('limpiar-basura-registros')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpiar-basura-registros');

-- Diario a las 4:10 UTC (11:10 p.m. de Colombia), cuando no hay casi nadie.
SELECT cron.schedule('limpiar-basura-registros', '10 4 * * *', $$
  DELETE FROM cron.job_run_details WHERE start_time <= now() - interval '2 days';
$$);

-- El VACUUM FULL va aparte y solo UNA VEZ POR SEMANA: toma un bloqueo exclusivo
-- sobre la tabla y no vale la pena pagarlo a diario. Domingos 4:20 UTC.
--
-- OJO si alguien lo mueve: mientras corre, cualquier cron que intente escribir su
-- resultado espera. En una tabla de pocos MB son segundos, pero a una hora de
-- tráfico real sí se notaría.
SELECT cron.schedule('compactar-tablas-de-registro', '20 4 * * 0', $$
  VACUUM FULL cron.job_run_details;
$$);

SELECT cron.schedule('compactar-respuestas-http', '25 4 * * 0', $$
  VACUUM FULL net._http_response;
$$);
