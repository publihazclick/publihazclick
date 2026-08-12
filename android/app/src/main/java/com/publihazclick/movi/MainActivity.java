package com.publihazclick.movi;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

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
        handleDeepLinkIntent(getIntent(), true);
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
     * manifest. Se mantiene tambien el fix del WebView (force-dark off) como respaldo.
     *
     * ACTUALIZACION 2026-08-11 (confirmado con 3 videos reales del arranque): arreglar SOLO la
     * ventana no bastaba para mostrar el logo -- el WebView se adjunta casi de inmediato y pinta
     * SU PROPIO fondo por encima, tapando la ventana durante todo el tiempo de carga. Ver el
     * comentario junto a webView.setBackground() mas abajo.
     */
    private void fixWebViewBlankBackground() {
        // splash_bg (color solido) -> splash (imagen con logo/marca completa). Antes, mientras
        // el WebView cargaba la pagina remota, se veia el azul liso sin ningun logo -- a veces
        // varios segundos si la red iba lenta. splash ya existia como recurso (generado por
        // Capacitor hace tiempo) pero no lo referenciaba nada, asi que quedaba sin usar.
        getWindow().setBackgroundDrawableResource(R.drawable.splash);
        if (getBridge() == null || getBridge().getWebView() == null) return;
        android.webkit.WebView webView = getBridge().getWebView();
        // CAUSA REAL de que el logo nunca se viera (encontrado revisando un video real del
        // arranque, 2026-08-11): el WebView se adjunta a la ventana casi de inmediato y pinta SU
        // PROPIO fondo por encima de lo que sea que muestre la ventana -- por eso cambiar solo
        // getWindow() de arriba no alcanzaba, seguia tapado por este color plano durante TODO el
        // tiempo que tarda en cargar la pagina remota. setBackgroundColor() solo acepta un color
        // solido; setBackground() con un Drawable si permite poner la imagen con el logo.
        webView.setBackground(androidx.core.content.ContextCompat.getDrawable(this, R.drawable.splash));
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
        handleDeepLinkIntent(intent, false);
    }

    /**
     * Muestra la solicitud de viaje cuando la app se abre/reactiva desde la notificacion de
     * pantalla completa de MoviFirebaseMessagingService.kt.
     *
     * CAMBIO 2026-08-03 (pedido explicito del usuario): con la app YA corriendo (coldStart=false),
     * antes esto hacia loadUrl() -- una recarga COMPLETA del WebView que reiniciaba Angular desde
     * cero (splash, chequeo de sesion, GPS, "Cargando tu perfil...", etc.), aunque la app ya
     * estuviera mostrando todo en vivo. El usuario reporto que tocar la notificacion lo hacia
     * esperar esas pantallas en vez de ver la solicitud/oferta de inmediato. Con la app corriendo
     * NO hace falta recargar nada: Android ya trae la Activity al frente sola por el intent
     * (launchMode singleTask), asi que basta con inyectar el tripId via evaluateJavascript al
     * puente que anda-gana.component.ts registra en ngOnInit (window.__moviHandleTripPush) -- la
     * misma funcion que ya usaba _showIncomingTripById para agregar la solicitud a driverRequests
     * sin pantallas de por medio. Solo en frio (coldStart=true, la app ni siquiera existe todavia)
     * sigue haciendo falta el loadUrl con ?trip_request_id=... porque ese es el primer arranque.
     */
    private void handleTripRequestIntent(Intent intent, boolean coldStart) {
        if (intent == null) return;
        String tripRequestId = intent.getStringExtra("trip_request_id");
        if (tripRequestId == null || tripRequestId.isEmpty()) return;

        if (coldStart) {
            String url = "https://www.publihazclick.com/anda-gana?trip_request_id=" + tripRequestId;
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().loadUrl(url);
                }
            }, 1500);
            return;
        }

        if (getBridge() != null && getBridge().getWebView() != null) {
            String js = "window.__moviHandleTripPush && window.__moviHandleTripPush("
                + JSONObject.quote(tripRequestId) + ");";
            getBridge().getWebView().evaluateJavascript(js, null);
        }
    }

    /**
     * Pedido explicito del usuario 2026-07-31 (llamadas de voz con notificacion nativa): las
     * notificaciones urgentes genericas (showUrgentAlertNotification en
     * MoviFirebaseMessagingService.kt -- ofertas de conductores, oferta aceptada, "tu conductor
     * llego", llamadas entrantes) YA ponian la URL completa en intent.setData(), pero nada la
     * leia -- esta activity solo miraba el extra "trip_request_id" (handleTripRequestIntent). Se
     * agrega este manejo generico para CUALQUIER notificacion con URL.
     *
     * CAMBIO 2026-08-03 (pedido explicito del usuario): con la app YA corriendo (coldStart=false)
     * esto hacia loadUrl() SIEMPRE, incluso cuando la URL de destino era la misma pagina que ya
     * estaba abierta (ej. el push de "te hicieron una oferta" apunta solo a /anda-gana, sin
     * parametros) -- eso reiniciaba Angular desde cero (splash, GPS, "Cargando...") solo para
     * volver a mostrar la MISMA pantalla, y el usuario reporto exactamente este retraso al tocar
     * la notificacion de una oferta/aceptacion. Ya no hace falta: todos estos eventos (ofertas
     * recibidas, oferta aceptada, conductor llego, llamada entrante) ya llegan en vivo por
     * suscripciones realtime mientras la app esta corriendo -- lo unico que hacia falta era traer
     * la Activity al frente, y eso Android ya lo hace solo por el intent (launchMode singleTask),
     * sin tocar el WebView. En frio (coldStart=true, la app aun no existe) se mantiene el loadUrl,
     * es el unico caso donde de verdad hace falta cargar esa URL por primera vez.
     */
    private void handleDeepLinkIntent(Intent intent, boolean coldStart) {
        if (!coldStart) return; // app ya corriendo -- no recargar, ver comentario arriba
        if (intent == null || intent.getData() == null) return;
        if (intent.getStringExtra("trip_request_id") != null) return; // ya lo maneja handleTripRequestIntent
        String url = intent.getData().toString();
        if (!url.startsWith("http")) return;

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().loadUrl(url);
            }
        }, 1500);
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
