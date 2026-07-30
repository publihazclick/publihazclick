package com.publihazclick.movi

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Acepta una solicitud de viaje 100% desde la notificacion, sin abrir la app -- pedido explicito
 * del usuario 2026-07-30 ("quiero que la notificacion sea de una vez el modal... sin tener que
 * ser redirigido a la app"). Llama directo a la edge function ag-quick-accept (misma logica de
 * negocio que submitDriverOffer() en el componente Angular, ver ese archivo si las reglas
 * cambian) usando goAsync() porque onReceive() corre en el hilo principal y no puede bloquear
 * para la llamada de red.
 */
class AcceptTripReceiver : BroadcastReceiver() {

    companion object {
        private const val SUPABASE_URL = "https://hndhgtnjyjwrnzdcgcca.supabase.co"
        private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhuZGhndG5qeWp3cm56ZGNnY2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMTQ5OTgsImV4cCI6MjA5ODc5MDk5OH0.Rg_3vQVTgn-0V7xpWILYVK32KHBRJTBUDX5K5bAvcq4"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val tripId = intent.getStringExtra("trip_request_id") ?: return
        val driverAuthUserId = intent.getStringExtra("driver_auth_user_id") ?: return
        val notificationId = intent.getIntExtra("notification_id", tripId.hashCode())

        val manager = context.getSystemService(NotificationManager::class.java)
        // Feedback inmediato mientras se confirma con el servidor (la llamada de red toma un
        // instante) -- evita que el conductor piense que no paso nada al tocar el boton.
        manager.notify(
            notificationId,
            NotificationCompat.Builder(context, "movi_trips")
                .setSmallIcon(android.R.drawable.ic_menu_directions)
                .setContentTitle("Aceptando...")
                .setContentText("Confirmando tu oferta")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setOngoing(true)
                .build()
        )

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val client = OkHttpClient.Builder()
                    .connectTimeout(10, TimeUnit.SECONDS)
                    .readTimeout(10, TimeUnit.SECONDS)
                    .build()
                val payload = JSONObject().apply {
                    put("trip_id", tripId)
                    put("driver_auth_user_id", driverAuthUserId)
                }
                val request = Request.Builder()
                    .url("$SUPABASE_URL/functions/v1/ag-quick-accept")
                    .addHeader("Content-Type", "application/json")
                    .addHeader("apikey", SUPABASE_ANON_KEY)
                    .addHeader("Authorization", "Bearer $SUPABASE_ANON_KEY")
                    .post(payload.toString().toRequestBody("application/json".toMediaType()))
                    .build()

                client.newCall(request).execute().use { response ->
                    val bodyStr = response.body?.string() ?: "{}"
                    val json = JSONObject(bodyStr)
                    val success = json.optBoolean("success", false)

                    val resultNotification = if (success) {
                        val price = json.optInt("price", 0)
                        NotificationCompat.Builder(context, "movi_trips")
                            .setSmallIcon(android.R.drawable.ic_menu_directions)
                            .setContentTitle("✓ Solicitud aceptada")
                            .setContentText("Oferta enviada por $$price")
                            .setPriority(NotificationCompat.PRIORITY_HIGH)
                            .setAutoCancel(true)
                            .build()
                    } else {
                        val error = json.optString("error", "No se pudo aceptar")
                        // Fallback: si algo bloquea el accept (saldo insuficiente, etc.) SI hace
                        // falta abrir la app para que el conductor vea el motivo real y actue.
                        val openAppIntent = Intent(context, MainActivity::class.java).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            putExtra("trip_request_id", tripId)
                        }
                        val openAppPending = android.app.PendingIntent.getActivity(
                            context, tripId.hashCode(), openAppIntent,
                            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
                        )
                        NotificationCompat.Builder(context, "movi_trips")
                            .setSmallIcon(android.R.drawable.ic_menu_directions)
                            .setContentTitle("No se pudo aceptar")
                            .setContentText(error)
                            .setPriority(NotificationCompat.PRIORITY_HIGH)
                            .setAutoCancel(true)
                            .setContentIntent(openAppPending)
                            .build()
                    }
                    manager.notify(notificationId, resultNotification)
                }
            } catch (e: Exception) {
                manager.notify(
                    notificationId,
                    NotificationCompat.Builder(context, "movi_trips")
                        .setSmallIcon(android.R.drawable.ic_menu_directions)
                        .setContentTitle("No se pudo aceptar")
                        .setContentText("Error de conexión, abre la app para intentar de nuevo")
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setAutoCancel(true)
                        .build()
                )
            } finally {
                pendingResult.finish()
            }
        }
    }
}
