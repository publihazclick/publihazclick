import { ApplicationConfig, ErrorHandler, LOCALE_ID, provideBrowserGlobalErrorListeners, APP_INITIALIZER, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser, registerLocaleData } from '@angular/common';
import localeEsCO from '@angular/common/locales/es-CO';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import * as Sentry from '@sentry/angular';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { SeoService } from './core/services/seo.service';
import { environment } from '../environments/environment';

// Bug real 2026-08-03: sin esto, el pipe `| date` de Angular usaba el locale por defecto
// (en-US) en TODA la app -- fechas como "Aug 3, 2026, 2:30 PM" en vez de "3 ago 2026, 2:30 p. m."
// (ej. recibo de viaje). Se registra en app.config.ts (no en el componente) para que aplique
// tanto en SSR como en el cliente por igual y evitar un mismatch de hidratacion.
registerLocaleData(localeEsCO, 'es-CO');

function initSeo(): () => void {
  const seo = inject(SeoService);
  return () => seo.init();
}

/**
 * Fase 0 "unicornio" (2026-08-01): monitoreo de errores real en vez de meterse a mano a los
 * logs de Supabase cada vez que algo falla. Se deja preparado pero INACTIVO -- environment.
 * sentryDsn queda vacio hasta que se cree una cuenta gratis en sentry.io y se pegue el DSN
 * real ahi. Sin DSN, Sentry.init() nunca se llama (cero overhead, cero warnings en consola) y
 * la app sigue exactamente igual que hoy.
 */
function initSentry(): () => void {
  const platformId = inject(PLATFORM_ID);
  return () => {
    if (!environment.sentryDsn || !isPlatformBrowser(platformId)) return;
    Sentry.init({
      dsn: environment.sentryDsn,
      environment: environment.production ? 'production' : 'development',
      tracesSampleRate: 0.1,
    });
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-CO' },
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration(withEventReplay()),
    provideHttpClient(
      withFetch(),
      withInterceptors([
        authInterceptor
      ])
    ),
    {
      provide: APP_INITIALIZER,
      useFactory: initSeo,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initSentry,
      multi: true,
    },
    // Solo reemplaza el ErrorHandler por defecto de Angular cuando Sentry SI esta activo.
    ...(environment.sentryDsn ? [{ provide: ErrorHandler, useValue: Sentry.createErrorHandler() }] : []),
  ]
};
