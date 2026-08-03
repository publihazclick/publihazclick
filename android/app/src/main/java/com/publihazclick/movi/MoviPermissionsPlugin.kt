package com.publihazclick.movi

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Pide ubicacion + notificaciones en UNA sola llamada nativa combinada (pedido explicito del
 * usuario 2026-07-31): antes eran 2 llamadas separadas (WebView geolocation + plugin
 * PushNotifications), cada una disparando su propio ActivityCompat.requestPermissions() por
 * separado -- Android metia una pausa propia entre una y otra. Al pedir ambos alias juntos con
 * requestPermissionForAliases(), Capacitor arma un unico ActivityCompat.requestPermissions()
 * con los dos permisos, asi que Android los muestra seguidos sin ninguna espera intermedia.
 * Los flujos existentes (startGpsTracking/_registerNativePush en anda-gana.component.ts) no
 * cambian: una vez que esto ya resolvio el permiso, esos solo lo encuentran ya concedido/negado
 * y no vuelven a mostrar ningun cuadro.
 */
@CapacitorPlugin(
    name = "MoviPermissions",
    permissions = [
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION], alias = "location"),
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")
    ]
)
class MoviPermissionsPlugin : Plugin() {

    @PluginMethod
    fun requestCombined(call: PluginCall) {
        requestPermissionForAliases(arrayOf("location", "notifications"), call, "combinedResult")
    }

    @PermissionCallback
    private fun combinedResult(call: PluginCall) {
        val result = JSObject()
        result.put("location", getPermissionState("location")?.toString() == "granted")
        result.put("notifications", getPermissionState("notifications")?.toString() == "granted")
        call.resolve(result)
    }

    /**
     * Pide excluir a Movi de la optimizacion de bateria del sistema -- causa mas probable de
     * "a veces llega la notificacion de una solicitud, a veces no" (pedido explicito del usuario
     * 2026-08-03). Con la app cerrada o sin abrirse un rato, Doze/App Standby (agravado por los
     * administradores de bateria propios de MIUI/Xiaomi, Samsung, Huawei, etc.) retrasa o
     * descarta los mensajes FCM en background de forma NO determinista -- coincide exacto con el
     * sintoma reportado (intermitente, no constante). Si el usuario YA la tiene excluida (algunos
     * fabricantes ya la excluyen sola tras cierto uso), no se muestra ningun dialogo.
     */
    @PluginMethod
    fun requestIgnoreBatteryOptimizations(call: PluginCall) {
        val pm = context.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
        if (pm.isIgnoringBatteryOptimizations(context.packageName)) {
            val result = JSObject()
            result.put("alreadyIgnoring", true)
            call.resolve(result)
            return
        }
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:" + context.packageName)
        }
        startActivityForResult(call, intent, "batteryOptResult")
    }

    @ActivityCallback
    private fun batteryOptResult(call: PluginCall?, activityResult: ActivityResult) {
        if (call == null) return
        val pm = context.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
        val result = JSObject()
        result.put("alreadyIgnoring", pm.isIgnoringBatteryOptimizations(context.packageName))
        call.resolve(result)
    }
}
