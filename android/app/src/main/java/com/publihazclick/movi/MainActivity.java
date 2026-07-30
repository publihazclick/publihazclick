package com.publihazclick.movi;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();
        handleTripRequestIntent(getIntent(), true);
    }

    // launchMode="singleTask": si la app ya esta corriendo (primer o segundo plano), Android NO
    // vuelve a llamar onCreate al tocar la notificacion de pantalla completa -- solo onNewIntent.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleTripRequestIntent(intent, false);
    }

    /**
     * Navega el WebView a la solicitud de viaje cuando la app se abre/reactiva desde la
     * notificacion de pantalla completa de MoviFirebaseMessagingService.kt. En frio (coldStart)
     * se espera a que Capacitor termine de cargar la app antes de navegar; ya corriendo, se
     * navega de inmediato. Pedido explicito del usuario 2026-07-30.
     */
    private void handleTripRequestIntent(Intent intent, boolean coldStart) {
        if (intent == null) return;
        String tripRequestId = intent.getStringExtra("trip_request_id");
        if (tripRequestId == null || tripRequestId.isEmpty()) return;
        boolean autoAccept = intent.getBooleanExtra("auto_accept", false);

        String url = "https://www.publihazclick.com/anda-gana?trip_request_id=" + tripRequestId
            + (autoAccept ? "&auto_accept=1" : "");
        long delayMs = coldStart ? 1500 : 0;
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().loadUrl(url);
            }
        }, delayMs);
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
