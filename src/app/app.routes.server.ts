import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Ruta de referido - SSR dinámico para que el servidor la maneje correctamente
  {
    path: 'ref/:code',
    renderMode: RenderMode.Server
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
