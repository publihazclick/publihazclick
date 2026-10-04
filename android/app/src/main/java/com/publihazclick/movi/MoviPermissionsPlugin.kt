package com.publihazclick.movi

import android.Manifest
import android.content.ComponentName
import android.os.Build
import androidx.core.app.NotificationManagerCompat
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

    /**
     * Estado del celular para la tarjeta "Recibe las solicitudes al instante" y para el informe
     * (ag_report_device_status, migracion 303) -- 2026-10-03. Solo LEE, nunca abre nada.
     * autostartBrand: la marca si es de las que matan apps en segundo plano y tienen pantalla de
     * "inicio automatico" (null si no), para que la app ofrezca el boton solo donde sirve.
     */
    @PluginMethod
    fun getDeviceStatus(call: PluginCall) {
        val result = JSObject()
        try {
            val pm = context.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
            result.put("manufacturer", Build.MANUFACTURER ?: "")
            result.put("brand", Build.BRAND ?: "")
            result.put("model", Build.MODEL ?: "")
            result.put("sdk", Build.VERSION.SDK_INT)
            result.put("batteryExempt", pm.isIgnoringBatteryOptimizations(context.packageName))
            result.put("notificationsOn", NotificationManagerCompat.from(context).areNotificationsEnabled())
            val version = try {
                context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: ""
            } catch (e: Exception) { "" }
            result.put("appVersion", version)
            result.put("autostartBrand", marcaConAutostart())
        } catch (e: Exception) {
            // Nunca rechazar: la app sigue funcionando sin estos datos.
        }
        call.resolve(result)
    }

    /**
     * Abre la pantalla de "inicio automatico" / "apps protegidas" del fabricante (2026-10-03). Esas
     * marcas (Xiaomi, Huawei, Oppo, Vivo...) matan las apps en segundo plano y retienen sus
     * notificaciones aunque la optimizacion de bateria de Android este desactivada: es la causa
     * mas probable de que a un conductor con la app cerrada no le llegue la solicitud.
     *
     * Las pantallas son internas de cada fabricante y cambian entre versiones, asi que se prueban
     * varias en orden y cada intento va en try/catch (ActivityNotFoundException si no existe,
     * SecurityException si existe pero no esta exportada). Si ninguna abre, se cae a los ajustes
     * generales de la app (siempre existen). No se usa resolveActivity(): desde Android 11 no ve
     * paquetes de otros fabricantes sin declararlos en <queries>, y daria falsos "no existe".
     */
    @PluginMethod
    fun openAutostartSettings(call: PluginCall) {
        val result = JSObject()
        for (cn in candidatosAutostart()) {
            try {
                val intent = Intent().apply {
                    component = cn
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
                result.put("opened", "autostart")
                result.put("component", cn.flattenToShortString())
                call.resolve(result)
                return
            } catch (e: Exception) {
                // siguiente candidato
            }
        }
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:" + context.packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            result.put("opened", "app_details")
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("No se pudo abrir Ajustes: " + e.message)
        }
    }

    private fun marcaConAutostart(): String? {
        val m = ((Build.MANUFACTURER ?: "") + " " + (Build.BRAND ?: "")).lowercase()
        return listOf("xiaomi", "redmi", "poco", "huawei", "honor", "oppo", "realme", "oneplus",
            "vivo", "iqoo", "samsung", "asus", "infinix", "tecno", "itel", "motorola")
            .firstOrNull { m.contains(it) }
    }

    private fun candidatosAutostart(): List<ComponentName> {
        val m = ((Build.MANUFACTURER ?: "") + " " + (Build.BRAND ?: "")).lowercase()
        val c = mutableListOf<ComponentName>()
        fun add(p: String, a: String) = c.add(ComponentName(p, a))
        when {
            listOf("xiaomi", "redmi", "poco").any { m.contains(it) } -> {
                add("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")
                add("com.miui.securitycenter", "com.miui.powercenter.PowerSettings")
            }
            m.contains("honor") -> {
                add("com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity")
                add("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")
            }
            m.contains("huawei") -> {
                add("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")
                add("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity")
            }
            listOf("oppo", "realme", "oneplus").any { m.contains(it) } -> {
                add("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")
                add("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity")
                add("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity")
                add("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity")
            }
            listOf("vivo", "iqoo").any { m.contains(it) } -> {
                add("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")
                add("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity")
                add("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager")
            }
            m.contains("samsung") -> {
                add("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity")
                add("com.samsung.android.sm", "com.samsung.android.sm.battery.ui.BatteryActivity")
            }
            m.contains("asus") -> add("com.asus.mobilemanager", "com.asus.mobilemanager.entry.FunctionActivity")
            listOf("infinix", "tecno", "itel").any { m.contains(it) } ->
                add("com.transsion.phonemaster", "com.cyin.himgr.autostart.AutoStartActivity")
        }
        return c
    }

    /**
     * Atajo de un solo toque a la pantalla de notificaciones de Movi dentro de Ajustes del
     * sistema -- pedido explicito del usuario 2026-08-19: cuando el permiso ya quedo bloqueado de
     * verdad (2 negaciones reales, Android ya no vuelve a mostrar el cuadro pedido en codigo, ver
     * requestCombined arriba), la unica salida es que el usuario lo active a mano en Ajustes. Sin
     * esto tenia que navegar el mismo Ajustes -> Apps -> Movi -> Notificaciones; con
     * ACTION_APP_NOTIFICATION_SETTINGS Android lo lleva DIRECTO a esa pantalla exacta.
     */
    @PluginMethod
    fun openNotificationSettings(call: PluginCall) {
        // ACTION_APP_NOTIFICATION_SETTINGS existe desde API 26; minSdk de la app es 24. En la
        // practica este boton solo se muestra cuando POST_NOTIFICATIONS ya fue evaluado como
        // permiso en tiempo de ejecucion, algo que solo pasa en API 33+ (muy por encima de 26),
        // asi que no deberia ser alcanzable en un dispositivo tan viejo -- pero por si algun ROM
        // de fabricante no resuelve el intent, se envuelve en try/catch para que jamas tumbe la
        // app nativa (peor caso: el boton no hace nada, en vez de crashear).
        try {
            val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            }
            // activity.startActivity(), no context.startActivity(): el context del plugin puede
            // ser el de la Application (no una Activity), y lanzar un intent normal desde ahi
            // exige el flag FLAG_ACTIVITY_NEW_TASK o revienta con "calling startActivity()
            // requires...". La Activity de Capacitor (esta misma MainActivity) no necesita ese
            // flag.
            activity.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("No se pudo abrir Ajustes de notificaciones: " + e.message)
        }
    }
}
