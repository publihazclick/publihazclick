import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Ruta de referido - Client-side para compatibilidad con Vercel static serving
  {
    path: 'ref/:code',
    renderMode: RenderMode.Client
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
