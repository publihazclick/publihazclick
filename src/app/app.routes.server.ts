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
  // Landing page - Client-side rendering para compatibilidad con Vercel
  {
    path: '**',
    renderMode: RenderMode.Client
  }
];
