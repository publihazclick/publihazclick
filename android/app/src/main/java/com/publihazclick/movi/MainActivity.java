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
     * CAUSA REAL de la pantalla blanca/negra "de mas" (confirmado leyendo el codigo fuente de
     * Capacitor, BridgeActivity.java): BridgeActivity.onCreate() -- que se ejecuta dentro de
     * nuestro super.onCreate() -- hace getApplication().setTheme(...)/setTheme(...) con SU PROPIO
     * tema interno (com.getcapacitor.android.R.style.AppTheme_NoActionBar, un
     * Theme.AppCompat.NoActionBar liso SIN windowBackground) antes de inflar el layout del
     * WebView. Esto pisa por completo el tema AppTheme.NoActionBarLaunch (windowBackground=
     * splash_bg morado) declarado en AndroidManifest.xml para esta activity -- por eso el fondo
     * de la ventana se queda en el default de AppCompat (blanco) durante todo el tiempo que el
     * WebView tarda en cargar la pagina remota (server.url apunta a Vercel, no a archivos
     * locales). El intento anterior (fijar solo el color del WebView) no alcanzaba porque el
     * blanco viene de la VENTANA/layout contenedor, no solo del WebView.
     *
     * Fix: restaurar el fondo de la ventana explicitamente DESPUES de super.onCreate() (que es
     * cuando Capacitor ya hizo su swap de tema) en vez de confiar en el tema declarado en el
     * manifest. Se mantiene tambien el fix del WebView (color + force-dark off) como respaldo.
     */
    private void fixWebViewBlankBackground() {
        getWindow().setBackgroundDrawableResource(R.drawable.splash_bg);
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
