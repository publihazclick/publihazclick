package com.publihazclick.movi

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import com.capacitorjs.plugins.pushnotifications.MessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Servicio FCM propio de Movi -- reemplaza al MessagingService por defecto de
 * @capacitor/push-notifications (ver AndroidManifest.xml, tools:node="remove" sobre el original)
 * para poder mostrar una notificacion de pantalla completa (full-screen intent) cuando llega una
 * solicitud de viaje, sin importar si la app esta en primer plano, en segundo plano o cerrada.
 *
 * Pedido explicito del usuario 2026-07-30: que el conductor VEA la solicitud en pantalla (no solo
 * escuche un sonido) sin importar el estado de la app -- el mismo patron que usan apps de
 * dispatch (Uber/inDrive) para llamadas/viajes entrantes.
 *
 * Decision final del usuario (mismo dia, tras probar 2 versiones con botones de accion en la
 * notificacion): la notificacion es SOLO informativa, sin botones de aceptar/rechazar -- tocarla
 * en cualquier parte abre la app y muestra el banner real (con Aceptar/Contra-oferta) que ya
 * existe ahi. Se descarto por completo el flujo de "aceptar sin abrir la app"
 * (ver AcceptTripReceiver.kt/ag-quick-accept, ya no se usan).
 *
 * Extiende el MessagingService de Capacitor (no lo reemplaza del todo) para no romper el puente
 * normal a JS cuando la app SI esta en primer plano (pushNotificationReceived sigue funcionando
 * igual que antes).
 */
class MoviFirebaseMessagingService : MessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        // Preserva el comportamiento normal de Capacitor (forwarding a JS si el bridge esta vivo).
        super.onMessageReceived(remoteMessage)

        val data = remoteMessage.data

        // Pedido explicito del usuario 2026-08-03: quitar de la bandeja la notificacion de una
        // solicitud que ya no esta disponible (el pasajero la cancelo, o otro conductor ya la
        // acepto) -- ver ag_notify_drivers_trip_no_longer_available (migracion 181) y
        // ag-send-push/index.ts. Este mensaje NO muestra nada, solo cancela; se reconoce por
        // traer `cancel_tag` en vez de las llaves normales (title/body/trip_id/urgent).
        val cancelTag = data["cancel_tag"]
        if (cancelTag != null) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.cancel(cancelTag.hashCode())
            // Respaldo: por si alguna vez se mostro via showFullScreenTripNotification (notifId =
            // tripId.hashCode(), sin el prefijo "trip-"), tambien se intenta cancelar con esa forma.
            cancelTag.removePrefix("trip-").let { if (it != cancelTag) manager.cancel(it.hashCode()) }
            return
        }

        val tripId = data["trip_id"]
        if (tripId != null) {
            // Push de solicitud de viaje para el CONDUCTOR (flujo ya existente).
            val title = data["title"] ?: "🚗 Nueva solicitud de viaje"
            val body = data["body"] ?: "Toca para ver los detalles"
            showFullScreenTripNotification(tripId, title, body, data["price"], data["dist"], data["origin"], data["dest"])
            // DESPUES de mostrarla (no la demora): confirmar al servidor que llego.
            reportarEntrega(tripId)
            return
        }

        // Aviso NORMAL (2026-10-03): recordatorios al conductor desconectado ("quedaste desconectado,
        // toca para volver a recibir viajes"). Antes no habia como mostrar una notificacion comun con
        // la app cerrada: solo existian la de solicitud y la urgente, las dos de PANTALLA COMPLETA,
        // demasiado invasivas para un recordatorio. Ver ag_recordar_conectarse (migracion 304).
        if (data["aviso"] == "1") {
            val title = data["title"] ?: "Movi"
            val body = data["body"] ?: ""
            val url = data["url"]?.let {
                if (it.startsWith("http")) it else "https://www.publihazclick.com$it"
            } ?: "https://www.publihazclick.com/anda-gana"
            val notifId = (data["tag"]?.takeIf { it.isNotEmpty() } ?: "movi-aviso").hashCode()
            showAvisoNotification(notifId, title, body, url)
            return
        }

        // Pedido explicito del usuario 2026-07-31: que al PASAJERO tambien le suene/vibre el
        // celular a pantalla completa (igual que al conductor) cuando el conductor llega al
        // punto de recogida. ag-send-push YA mandaba este push con urgent=1 desde advanceStage()
        // en anda-gana.component.ts, pero como no traia trip_id, onMessageReceived lo descartaba
        // en silencio -- nunca se mostraba nada si la app del pasajero estaba cerrada/en segundo
        // plano. bug real encontrado al implementar este pedido, no solo falta de feature.
        if (data["urgent"] == "1") {
            val title = data["title"] ?: "Movi"
            val body = data["body"] ?: ""
            val url = data["url"]?.let {
                if (it.startsWith("http")) it else "https://www.publihazclick.com$it"
            } ?: "https://www.publihazclick.com/anda-gana"
            val notifId = (data["tag"]?.takeIf { it.isNotEmpty() } ?: url).hashCode()
            showUrgentAlertNotification(notifId, title, body, url)
        }
    }

    /**
     * Notificacion de pantalla completa GENERICA para alertas urgentes que no son una solicitud
     * de viaje (ej. "tu conductor llego"). A diferencia de showFullScreenTripNotification, no
     * necesita un layout propio ni datos de precio/origen/destino -- el estado real (banner
     * "Tu conductor llego!" con countdown) ya lo pinta la app sola via su suscripcion realtime
     * en cuanto se abre, asi que tocar la notificacion solo necesita abrir la app normal.
     */
    private fun showUrgentAlertNotification(notifId: Int, title: String, body: String, url: String) {
        val channelId = "movi_trips" // mismo canal de alta prioridad que ya crea MainActivity

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannelHelper.ensureTripChannel(this, getSystemService(NotificationManager::class.java))
        }

        val tapIntent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(url)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val tapPendingIntent = PendingIntent.getActivity(
            this, notifId, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setColor(Color.parseColor("#245BDB"))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setContentIntent(tapPendingIntent)
            // La linea clave: pantalla completa aunque el celular este bloqueado/la app cerrada.
            .setFullScreenIntent(tapPendingIntent, true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        getSystemService(NotificationManager::class.java).notify(notifId, notification)
    }

    /**
     * Notificacion comun (sin pantalla completa) para avisos al conductor -- ver el bloque "aviso"
     * en onMessageReceived. Canal propio "movi_avisos" con importancia ALTA (aparece arriba de la
     * pantalla) pero sin el sonido de solicitud: no debe confundirse con un viaje entrante.
     * Tocarla abre Movi, y al abrir la app el conductor queda en linea solo (_initDriverHome).
     */
    private fun showAvisoNotification(notifId: Int, title: String, body: String, url: String) {
        val channelId = "movi_avisos"
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(channelId) == null) {
            val canal = android.app.NotificationChannel(channelId, "Avisos de Movi", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Recordatorios para conectarte y recibir viajes"
            }
            manager.createNotificationChannel(canal)
        }
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(url)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val tapPendingIntent = PendingIntent.getActivity(
            this, notifId, tapIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setColor(Color.parseColor("#245BDB"))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tapPendingIntent)
            .build()
        manager.notify(notifId, notification)
    }

    /**
     * Confirmacion de entrega (2026-10-03, migracion 303). Medido ese dia: de 579 avisos en 30 dias,
     * 386 nunca se vieron, y no habia forma de saber si Android NO lo entrego o si llego y nadie lo
     * miro. Esto le dice al servidor "me llego a esta hora" apenas Android entrega el push, aunque la
     * app este cerrada (ag_trip_push_log.delivered_at).
     *
     * - Sincrona a proposito: onMessageReceived ya corre en un hilo de trabajo de Firebase (no el
     *   principal) y Android puede matar el proceso apenas este metodo termina; un hilo aparte
     *   podria quedar cortado. La notificacion YA se mostro antes de llamar esto, asi que la espera
     *   no le demora nada al conductor. Tiempos acotados (2 s token + 4 s conexion + 4 s respuesta =
     *   10 s como maximo), por debajo del limite que Android le da a este servicio.
     * - Sin sesion (el servicio nativo no la tiene): se identifica con el token FCM del celular, y
     *   ag_push_recibido solo marca si ese token existe en ag_push_subs.
     * - Jamas puede tumbar el servicio: todo va dentro de try/catch(Throwable).
     */
    private fun reportarEntrega(tripId: String) {
        try {
            if (!Regex("^[0-9a-fA-F-]{36}$").matches(tripId)) return
            val token = try {
                com.google.android.gms.tasks.Tasks.await(
                    com.google.firebase.messaging.FirebaseMessaging.getInstance().token,
                    2, java.util.concurrent.TimeUnit.SECONDS
                )
            } catch (e: Exception) { null } ?: return
            val url = java.net.URL("${MoviBackend.SUPABASE_URL}/rest/v1/rpc/ag_push_recibido")
            val con = url.openConnection() as java.net.HttpURLConnection
            try {
                con.requestMethod = "POST"
                con.connectTimeout = 4000
                con.readTimeout = 4000
                con.doOutput = true
                con.setRequestProperty("apikey", MoviBackend.ANON_KEY)
                con.setRequestProperty("Authorization", "Bearer ${MoviBackend.ANON_KEY}")
                con.setRequestProperty("Content-Type", "application/json")
                val body = org.json.JSONObject().put("p_trip_id", tripId).put("p_fcm_token", token).toString()
                con.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                con.responseCode   // fuerza el envio; el resultado no cambia nada para el conductor
            } finally {
                con.disconnect()
            }
        } catch (t: Throwable) {
            // Solo medicion: nunca debe afectar el aviso.
        }
    }

    private fun showFullScreenTripNotification(
        tripId: String, title: String, body: String, price: String?, dist: String?,
        origin: String?, dest: String?
    ) {
        val channelId = "movi_trips"

        // El canal ya lo crea MainActivity.createNotificationChannels() en un uso normal de la
        // app, pero si el proceso arranca en frio solo para procesar el push (app nunca abierta
        // en este boot), el canal podria no existir todavia -- se asegura aca tambien.
        // NotificationChannelHelper (compartido con MainActivity) es quien de verdad crea el
        // canal, con el sonido propio (ver migracion 2026-08-30).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannelHelper.ensureTripChannel(this, getSystemService(NotificationManager::class.java))
        }

        // Unico destino posible al tocar la notificacion (en cualquier parte, ya no hay botones
        // separados): abre MainActivity con el trip_request_id -- la app agrega la solicitud a
        // driverRequests y el banner real (Aceptar/Contra-oferta) se muestra solo.
        val tapIntent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("https://www.publihazclick.com/anda-gana?trip_request_id=$tripId")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("trip_request_id", tripId)
        }
        val pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val tapPendingIntent = PendingIntent.getActivity(
            this, tripId.hashCode(), tapIntent, pendingIntentFlags
        )

        val priceFmt = price?.toDoubleOrNull()?.let { "$" + "%,.0f".format(it).replace(",", ".") } ?: (price ?: "")

        // Diseño personalizado (RemoteViews) pedido explicito por el usuario: que se vea lo mas
        // parecido posible al modal de la app (fondo morado/azul de marca + logo). Solo aplica a
        // la vista expandida en bandeja/heads-up -- el escenario de pantalla completa (celular
        // bloqueado) lanza la Activity real, no esta vista personalizada. Ya sin botones propios,
        // todo el layout dispara el mismo tapPendingIntent.
        val bigView = RemoteViews(packageName, R.layout.notification_trip_request).apply {
            setTextViewText(R.id.notif_price, if (dist != null) "$priceFmt · $dist km" else priceFmt)
            setTextViewText(R.id.notif_origin, "Desde: ${origin ?: "Origen sin nombre"}")
            setTextViewText(R.id.notif_dest, "Hasta: ${dest ?: "Destino sin nombre"}")
            setOnClickPendingIntent(R.id.notif_root, tapPendingIntent)
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setColor(Color.parseColor("#245BDB"))
            .setContentTitle(title)
            .setContentText(body)
            // Respaldo en dispositivos/OEMs que no respetan customBigContentView.
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setCustomBigContentView(bigView)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setContentIntent(tapPendingIntent)
            // La linea clave: pantalla completa aunque el celular este bloqueado/la app cerrada.
            .setFullScreenIntent(tapPendingIntent, true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(tripId.hashCode(), notification)
    }
}
