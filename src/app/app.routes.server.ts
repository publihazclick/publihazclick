import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Rutas dinámicas - renderizado del lado del cliente
  {
    path: 'ref/:code',
    renderMode: RenderMode.Client
  },
  {
    path: 'social/messages/:convId',
    renderMode: RenderMode.Client
  },
  // Landing page - SSR dinámico para que los banners se carguen en tiempo real
  {
    path: '',
    renderMode: RenderMode.Server
  },
  // Resto de rutas usan prerendering
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
