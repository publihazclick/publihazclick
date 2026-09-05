-- Migración 263: separar los eventos informativos de los errores reales de viaje
-- (2026-09-05, disparada por una falsa alarma real).
--
-- QUÉ PASÓ
-- El 2026-09-05 a las 13:00 (COL) llegó al WhatsApp del admin la alerta
-- "⚠️ 5 errores de viaje reportados en los últimos 15 min -- revisa Sentry".
-- No había ningún error: lo que hubo fue UN viaje normal por WhatsApp
-- (moto, $6.000, Av 9 #6-33 Comuneros → Instituto Comfanorte) con
-- 1 solicitud + 2 ofertas + 1 aceptación + 1 "conductor en camino" = 5 avisos.
--
-- CAUSA
-- La migración 249 ("quiero que todo me llegue al WhatsApp en vivo") reusó el canal
-- ag-whatsapp event=error_alert para mandar los eventos normales, y ese canal guarda
-- CADA mensaje en ag_admin_notifications con type='trip_error'. La señal 3 de
-- ag_health_check cuenta exactamente esas filas (>=5 en 15 min → "revisa Sentry").
-- Con el tiempo se sumaron al mismo canal el monitor de capacidad (218/219/239), el
-- reporte de reparto sin ofertas (247) y el de conductores sin push (261): todos
-- terminaban contados como "errores de viaje".
--
-- Efecto doble y peor que el ruido: además de la falsa alarma, un pico de errores
-- DE VERDAD quedaba indistinguible del tráfico normal, que es justo lo que la señal 3
-- existía para detectar.
--
-- ARREGLO
-- El discriminante va en el código, no acá: ag-whatsapp ahora acepta data.kind y solo
-- guarda type='trip_error' cuando vale 'error', que es lo único que manda
-- reportTripError() en anda-gana.service.ts (los 8 métodos del ciclo de vida del viaje).
-- Todo lo demás pasa a type='admin_info'. Se eligió arreglarlo del lado del emisor y no
-- reescribiendo las 4 funciones de base de datos que usan el canal
-- (ag_notify_admin_live_event, ag_notify_new_registration, ag_check_and_retry_dispatch,
-- ag_health_check) para no tocar funciones grandes de producción sin necesidad.
--
-- ag_health_check NO se modifica: sigue contando type='trip_error', que a partir de
-- ahora vuelve a significar lo que decía significar.
--
-- Esta migración solo limpia el historial ya guardado con la etiqueta equivocada.

-- Los 8 contextos que sí son fallos reales de sistema son los nombres de método que
-- manda reportTripError(); cualquier otro título con el prefijo viejo era informativo
-- (eventos en vivo, monitor, reportes de push) o una prueba manual.
UPDATE public.ag_admin_notifications
SET type  = 'admin_info',
    title = substring(title from length('Error en flujo de viaje: ') + 1)
WHERE type = 'trip_error'
  AND title LIKE 'Error en flujo de viaje: %'
  AND substring(title from length('Error en flujo de viaje: ') + 1) NOT IN (
        'requestTrip', 'cancelTripRequest', 'acceptOffer', 'rejectOffer',
        'makeOffer', 'completeTrip', 'updateTripStage', 'driverCancelTrip'
      );

-- A los 12 que sí eran errores reales (requestTrip x7, makeOffer x5) se les quita el
-- prefijo redundante del título, pero conservan type='trip_error'.
UPDATE public.ag_admin_notifications
SET title = substring(title from length('Error en flujo de viaje: ') + 1)
WHERE type = 'trip_error'
  AND title LIKE 'Error en flujo de viaje: %';
