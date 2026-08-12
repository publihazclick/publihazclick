import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.publihazclick.movi',
  appName: 'Movi',
  webDir: 'dist/publihazclick/browser',
  server: {
    url: 'https://www.publihazclick.com/anda-gana',
    cleartext: true,
    allowNavigation: ['*.epayco.co', 'secure.epayco.co'],
  },
  plugins: {
    SplashScreen: {
      // OJO: la clave real que lee el plugin nativo para el splash de arranque es
      // "launchShowDuration" -- "showDuration" (usado en intentos anteriores) NO existe para
      // este caso, es una clave distinta que solo aplica a llamadas manuales SplashScreen.show()/
      // hide() desde JS. Sin la clave correcta, el plugin siempre uso su default interno de
      // 500ms (ver SplashScreenConfig.java), insuficiente porque la app carga desde una URL
      // remota (Vercel) y la red a veces tarda mas que eso -- el splash se ocultaba por
      // timeout ANTES de que la pagina real estuviera lista, dejando ver el hueco de abajo.
      // Se sube a un techo generoso; el script de index.html ya llama SplashScreen.hide()
      // apenas la pagina pinta algo real, asi que en la practica casi nunca se llega al techo.
      launchShowDuration: 5000,
      launchAutoHide: true,
      backgroundColor: '#245BDB',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
    // NUNCA agregar "captureInput: true" aqui. Reemplaza el InputConnection real
    // de Chromium por uno generico de Android View: rompe backspace (quedaba trabado,
    // a veces corrompia el texto) y mata por completo el Autofill nativo, sin importar
    // los atributos "autocomplete" del HTML. Confirmado leyendo CapacitorWebView.java
    // (@capacitor/android) y verificado en produccion 2026-08-12 -- el registro de
    // conductor era casi imposible de editar hasta que se quito este flag.
  },
};

export default config;
