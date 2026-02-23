import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Rutas estáticas que se pueden prerenderizar
  {
    path: '',
    renderMode: RenderMode.Prerender
  },
  {
    path: 'login',
    renderMode: RenderMode.Prerender
  },
  {
    path: 'register',
    renderMode: RenderMode.Prerender
  },
  // Ruta dinámica - no se puede prerenderizar porque el parámetro :code es dinámico
  {
    path: 'ref/:code',
    renderMode: RenderMode.Server
  },
  // Resto de rutas - prerenderizar
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
