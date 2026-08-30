package com.publihazclick.movi;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * Crea el canal de notificaciones "movi_trips" (solicitudes de viaje para conductores +
 * alertas urgentes para pasajeros, ver MoviFirebaseMessagingService.kt) con un tono propio en
 * vez del que trae el celular por defecto -- pedido explícito del usuario 2026-08-30: reusa el
 * mismo sonido que ya suena dentro de la app cuando llega una solicitud con la pantalla abierta
 * (public/notification.wav, copiado a res/raw/notification.wav).
 *
 * Compartido entre MainActivity.java (arranque normal de la app) y
 * MoviFirebaseMessagingService.kt (push recibido con la app cerrada, el canal podría no existir
 * todavía) para que ambos caminos creen el canal exactamente igual, sin duplicar la lógica.
 *
 * Ambos deben llamar SIEMPRE a este método antes de asumir que el canal existe -- ninguno de los
 * dos crea el canal "movi_trips" por su cuenta.
 */
final class NotificationChannelHelper {
    private static final String CHANNEL_ID = "movi_trips";
    // Cambiar este número si en el futuro hace falta otra migración de sonido -- Android no deja
    // editar el sonido de un canal ya creado, solo borrarlo y recrearlo, así que cada migración
    // nueva necesita su propia bandera para no repetir el borrado en cada arranque (eso pisaría
    // cualquier ajuste de volumen/sonido que el conductor ya haya personalizado a mano).
    private static final String MIGRATION_PREF_KEY = "notif_channel_sound_migrated_v1";

    private NotificationChannelHelper() {}

    static void ensureTripChannel(Context context, NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        SharedPreferences prefs = context.getSharedPreferences("movi_prefs", Context.MODE_PRIVATE);
        boolean alreadyMigrated = prefs.getBoolean(MIGRATION_PREF_KEY, false);
        if (!alreadyMigrated) {
            // Borra el canal viejo (si existe, de una versión anterior de la app) para que el
            // sonido nuevo sí tome efecto -- crear un canal con el mismo ID que ya existe NO
            // actualiza sus ajustes, Android los deja fijos desde la primera vez.
            manager.deleteNotificationChannel(CHANNEL_ID);
            prefs.edit().putBoolean(MIGRATION_PREF_KEY, true).apply();
        }

        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Solicitudes de viaje",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Nuevas solicitudes de viaje y alertas urgentes de Movi");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 300, 100, 300, 100, 300, 100, 600});
        channel.enableLights(true);
        channel.setShowBadge(true);

        Uri soundUri = Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.notification);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(soundUri, audioAttributes);

        manager.createNotificationChannel(channel);
    }
}
