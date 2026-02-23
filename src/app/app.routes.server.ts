import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Ruta dinámica - usar renderizado del lado del cliente
  {
    path: 'ref/:code',
    renderMode: RenderMode.Client
  },
  // Resto de rutas usan prerendering
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
