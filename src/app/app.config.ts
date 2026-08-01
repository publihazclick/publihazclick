import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners, APP_INITIALIZER, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import * as Sentry from '@sentry/angular';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { SeoService } from './core/services/seo.service';
import { environment } from '../environments/environment';

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
