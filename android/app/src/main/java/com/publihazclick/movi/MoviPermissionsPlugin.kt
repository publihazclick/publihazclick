package com.publihazclick.movi

import android.Manifest
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
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
}
