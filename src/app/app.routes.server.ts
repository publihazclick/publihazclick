import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // ── Rutas públicas: Prerender para SEO ──────────────────────────────────
  // Estas generan HTML estático en build-time para que los crawlers
  // vean contenido real en lugar de un shell vacío.
  {
    path: '',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'login',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'register',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'quienes-somos',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'terminos',
    renderMode: RenderMode.Prerender,
  },

  // ── Rutas dinámicas: Client-side ────────────────────────────────────────
  {
    path: 'ref/:code',
    renderMode: RenderMode.Client,
  },
  {
    path: 'social/messages/:convId',
    renderMode: RenderMode.Client,
  },
  // Todas las demás (dashboard, admin, advertiser, etc.)
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
