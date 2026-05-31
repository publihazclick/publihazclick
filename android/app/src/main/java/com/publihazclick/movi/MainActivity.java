package com.publihazclick.movi;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Canal de alta prioridad para solicitudes de viaje (heads-up sobre cualquier app)
            NotificationChannel tripChannel = new NotificationChannel(
                "movi_trips",
                "Solicitudes de viaje",
                NotificationManager.IMPORTANCE_HIGH
            );
            tripChannel.setDescription("Nuevas solicitudes de viaje para conductores Movi");
            tripChannel.enableVibration(true);
            tripChannel.setVibrationPattern(new long[]{0, 300, 100, 300, 100, 300, 100, 600});
            tripChannel.enableLights(true);
            tripChannel.setShowBadge(true);

            // Canal general (para otras notificaciones)
            NotificationChannel defaultChannel = new NotificationChannel(
                "default",
                "Notificaciones Movi",
                NotificationManager.IMPORTANCE_DEFAULT
            );

            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(tripChannel);
            manager.createNotificationChannel(defaultChannel);
        }
    }
}
