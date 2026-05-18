import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.publihazclick.movi',
  appName: 'Movi',
  webDir: 'dist/publihazclick/browser',
  server: {
    url: 'https://www.publihazclick.com/anda-gana',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      showDuration: 0,
      backgroundColor: '#7C3AED',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
