import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

declare let FB: any;

/**
 * Carga el SDK de Facebook una sola vez y renderiza el player.
 * El contador del modal se inicia solo cuando el usuario da play
 * (evento startedPlaying del SDK).
 */
@Injectable({ providedIn: 'root' })
export class FacebookVideoService {
  private platformId = inject(PLATFORM_ID);
  private sdkReady = false;
  private pendingCallbacks: (() => void)[] = [];

  /** Carga el SDK (solo una vez) y resuelve cuando está listo. */
  private ensureSdk(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return Promise.resolve();
    if (this.sdkReady) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.pendingCallbacks.push(resolve);

      if (document.getElementById('facebook-jssdk')) return;

      (window as any).fbAsyncInit = () => {
        FB.init({ xfbml: false, version: 'v19.0' });
        this.sdkReady = true;
        this.pendingCallbacks.forEach((cb) => cb());
        this.pendingCallbacks = [];
      };

      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/es_LA/sdk.js';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    });
  }

  /**
   * Renderiza el video de Facebook en el contenedor dado.
   * Llama a onPlay() la primera vez que el usuario da play al video.
   */
  async loadAndWaitForPlay(containerId: string, onPlay: () => void): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    await this.ensureSdk();

    // Suscribir al evento xfbml.ready para capturar la instancia del player
    FB.Event.subscribe('xfbml.ready', (msg: any) => {
      if (msg.type === 'video') {
        let played = false;
        // startedPlaying se dispara cuando el usuario presiona play
        msg.instance.subscribe('startedPlaying', () => {
          if (!played) {
            played = true;
            onPlay();
          }
        });
      }
    });

    const container = document.getElementById(containerId);
    if (container) {
      FB.XFBML.parse(container);
    }
  }
}
