-- Migración 273: apagar los SMS del chequeo diario de push (2026-09-05).
--
-- PEDIDO EXPLÍCITO DEL USUARIO: "ya no gastes más SMS porque eso creo que me vale plata".
-- Tiene razón, y con los datos de hoy no pierde nada:
--
-- Se midió el 2026-09-05 y **los 14 conductores sin push son TODOS registros abandonados**:
-- los 14 en estado `quick`, 13 de 14 sin una sola oferta, y el GPS de casi todos es del mismo
-- día en que se registraron. No son conductores que dejaron de recibir solicitudes — son
-- gente que se registró y nunca volvió.
--
-- Y el problema de fondo YA ESTÁ ARREGLADO: de los registrados desde el 2026-09-01 (con la
-- app 1.4.31, que corrigió el permiso de notificaciones atascado),
-- **9 de 9 tienen push, cero fallas**. Los 14 son la cohorte vieja que entró con la versión
-- rota. Ver [[movi_push_permission_stuck_settings_fix]].
--
-- O sea que cada SMS que este cron mandaba hoy era plata gastada en alguien que se fue hace
-- dos semanas. Ocho de los 14 ya habían agotado sus 3 avisos sin volver.
--
-- QUÉ CAMBIA Y QUÉ NO
-- Solo se apaga el ENVÍO (`dry_run: true`). El chequeo sigue corriendo todos los días y el
-- informe al admin sigue llegando completo con la lista de afectados — lo que se apagó es
-- el gasto, no la vigilancia. Si algún día un conductor REAL (con viajes hechos) pierde el
-- push, va a aparecer en ese informe y el usuario decide si le escribe.
--
-- PARA VOLVER A ENCENDERLO: cambiar 'dry_run' a false en este mismo cron.
--
-- Nota: este cron hace su POST sin encabezado Authorization y funciona (viene mandando SMS
-- reales). Confirma lo corregido en la migración 272: el 403 del warm keeper no era por
-- falta de autorización, era por pegarle a la ruta GET de verificación de webhook de Meta.

SELECT cron.unschedule('movi-chequeo-push-conductores');

SELECT cron.schedule(
  'movi-chequeo-push-conductores',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-push-health-check',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('dry_run', true),
    timeout_milliseconds := 25000
  );
  $$
);
