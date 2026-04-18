package com.publihazclick.movi

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.widget.RemoteViews

/**
 * Widget Android para Movi Conductor.
 * Muestra ganancias del día + estado online + botón abrir app.
 * Los datos se actualizan desde la WebView mediante SharedPreferences ("movi_widget").
 */
class MoviDriverWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        val prefs: SharedPreferences = context.getSharedPreferences("movi_widget", Context.MODE_PRIVATE)
        val earnings = prefs.getString("earnings_today", "$0") ?: "$0"
        val trips = prefs.getInt("trips_today", 0)
        val online = prefs.getBoolean("online", false)
        val hours = prefs.getString("hours_online", "0h 0m") ?: "0h 0m"

        for (id in ids) {
            val views = RemoteViews(context.packageName, R.layout.widget_movi_driver)
            views.setTextViewText(R.id.widget_earnings, earnings)
            views.setTextViewText(R.id.widget_trips, "$trips viajes hoy")
            views.setTextViewText(R.id.widget_hours, hours)
            views.setTextViewText(R.id.widget_status, if (online) "🟢 EN LÍNEA" else "⚪ FUERA DE LÍNEA")

            val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launch != null) {
                launch.setPackage(null)
                launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                val pi = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                views.setOnClickPendingIntent(R.id.widget_root, pi)
            }
            mgr.updateAppWidget(id, views)
        }
    }
}
