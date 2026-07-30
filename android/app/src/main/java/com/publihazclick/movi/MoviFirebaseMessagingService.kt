package com.publihazclick.movi

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import com.capacitorjs.plugins.pushnotifications.MessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Servicio FCM propio de Movi -- reemplaza al MessagingService por defecto de
 * @capacitor/push-notifications (ver AndroidManifest.xml, tools:node="remove" sobre el original)
 * para poder mostrar una notificacion de pantalla completa (full-screen intent) cuando llega una
 * solicitud de viaje, sin importar si la app esta en primer plano, en segundo plano o cerrada.
 *
 * Pedido explicito del usuario 2026-07-30: que el conductor VEA el modal de la solicitud en
 * pantalla (no solo escuche un sonido) sin importar el estado de la app -- el mismo patron que
 * usan apps de dispatch (Uber/inDrive) para llamadas/viajes entrantes.
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
        val tripId = data["trip_id"] ?: return // Solo actuamos en pushes de solicitud de viaje
        val title = data["title"] ?: "🚗 Nueva solicitud de viaje"
        val body = data["body"] ?: "Toca para ver los detalles"
        val price = data["price"]
        val driverAuthUserId = data["driver_auth_user_id"]

        showFullScreenTripNotification(tripId, title, body, price, driverAuthUserId)
    }

    // Pedido explicito del usuario 2026-07-30 (version 2 -- primero se probo abriendo la app con
    // auto_accept, pero el usuario pidio que NO se vea la app en absoluto): el boton "Aceptar"
    // ahora dispara AcceptTripReceiver.kt, que llama directo al servidor (ag-quick-accept) sin
    // abrir ninguna Activity. Solo si el servidor rechaza el accept (saldo insuficiente, etc.)
    // el receiver abre la app como respaldo para que el conductor vea el motivo real.
    private fun showFullScreenTripNotification(tripId: String, title: String, body: String, price: String?, driverAuthUserId: String?) {
        val channelId = "movi_trips"

        // El canal ya lo crea MainActivity.createNotificationChannels() en un uso normal de la
        // app, pero si el proceso arranca en frio solo para procesar el push (app nunca abierta
        // en este boot), el canal podria no existir todavia -- se asegura aca tambien.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            if (manager.getNotificationChannel(channelId) == null) {
                val channel = NotificationChannel(
                    channelId,
                    "Solicitudes de viaje",
                    NotificationManager.IMPORTANCE_HIGH
                )
                channel.description = "Nuevas solicitudes de viaje para conductores Movi"
                channel.enableVibration(true)
                channel.vibrationPattern = longArrayOf(0, 300, 100, 300, 100, 300, 100, 600)
                channel.enableLights(true)
                manager.createNotificationChannel(channel)
            }
        }

        // Intent que abre MainActivity directamente en la pantalla del modal de la solicitud --
        // mismo mecanismo que ya usa el resto de la app para deep-links via query param (ver
        // ngOnInit en anda-gana.component.ts, trip_request_id).
        val fullScreenIntent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("https://www.publihazclick.com/anda-gana?trip_request_id=$tripId")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("trip_request_id", tripId)
        }
        val pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val fullScreenPendingIntent = PendingIntent.getActivity(
            this, tripId.hashCode(), fullScreenIntent, pendingIntentFlags
        )

        // Boton "Aceptar": Broadcast directo a AcceptTripReceiver, SIN abrir ninguna Activity --
        // si no hay driverAuthUserId (push viejo/formato distinto) cae al viejo comportamiento
        // de abrir la app con auto_accept, por seguridad.
        val acceptPendingIntent = if (driverAuthUserId != null) {
            val acceptIntent = Intent(this, AcceptTripReceiver::class.java).apply {
                putExtra("trip_request_id", tripId)
                putExtra("driver_auth_user_id", driverAuthUserId)
                putExtra("notification_id", tripId.hashCode())
            }
            PendingIntent.getBroadcast(this, tripId.hashCode() + 1, acceptIntent, pendingIntentFlags)
        } else {
            val fallbackIntent = Intent(this, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse("https://www.publihazclick.com/anda-gana?trip_request_id=$tripId&auto_accept=1")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("trip_request_id", tripId)
                putExtra("auto_accept", true)
            }
            PendingIntent.getActivity(this, tripId.hashCode() + 1, fallbackIntent, pendingIntentFlags)
        }
        val acceptLabel = if (price != null) "Aceptar \$$price" else "Aceptar"

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_menu_directions)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setContentIntent(fullScreenPendingIntent)
            // La linea clave: pantalla completa aunque el celular este bloqueado/la app cerrada.
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(android.R.drawable.ic_menu_send, acceptLabel, acceptPendingIntent)
            .addAction(android.R.drawable.ic_menu_view, "Ver detalles", fullScreenPendingIntent)
            .build()

        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(tripId.hashCode(), notification)
    }
}
