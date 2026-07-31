package com.publihazclick.movi;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Debe registrarse ANTES de super.onCreate() -- Capacitor arma el listado de plugins
        // al inicializar el Bridge, que ocurre dentro de super.onCreate().
        registerPlugin(MoviPermissionsPlugin.class);
        super.onCreate(savedInstanceState);
        fixWebViewBlankBackground();
        createNotificationChannels();
        handleTripRequestIntent(getIntent(), true);
    }

    /**
     * La pantalla negra "de mas" entre las splashes y la interfaz NO es ninguna de las
     * splashes -- es el WebView de Capacitor mostrando su propio fondo antes de que la pagina
     * remota (server.url apunta a Vercel) llegue a pintar algo. Por defecto el WebView usa
     * blanco, pero Android 10+ puede oscurecerlo automaticamente (force-dark / dark theme del
     * sistema) mostrando negro en vez de blanco mientras no hay contenido. Se fija el color de
     * fondo del WebView directo al morado de marca y se apaga el force-dark explicitamente,
     * asi no depende de que ningun script JS de la pagina llegue a tiempo (esa carrera contra
     * la red era la causa real, no la config de SplashScreen -- launchAutoHide ya estaba bien).
     */
    private void fixWebViewBlankBackground() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        android.webkit.WebView webView = getBridge().getWebView();
        webView.setBackgroundColor(Color.parseColor("#7C3AED"));
        if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
            WebSettingsCompat.setForceDark(webView.getSettings(), WebSettingsCompat.FORCE_DARK_OFF);
        }
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

        String url = "https://www.publihazclick.com/anda-gana?trip_request_id=" + tripRequestId;
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
