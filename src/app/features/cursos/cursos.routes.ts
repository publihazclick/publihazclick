import { Routes } from '@angular/router';

export const cursosRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./cursos.component').then(m => m.CursosComponent),
    children: [
      { path: '', redirectTo: 'explorar', pathMatch: 'full' },
      {
        path: 'explorar',
        loadComponent: () => import('./components/marketplace/cursos-marketplace.component').then(m => m.CursosMarketplaceComponent),
      },
      {
        path: 'mis-cursos',
        loadComponent: () => import('./components/my-courses/cursos-mis-compras.component').then(m => m.CursosMisComprasComponent),
      },
      {
        path: 'vender',
        loadComponent: () => import('./components/sell/cursos-sell.component').then(m => m.CursosSellComponent),
      },
      {
        path: 'afiliados',
        loadComponent: () => import('./components/affiliate/cursos-afiliados.component').then(m => m.CursosAfiliadosComponent),
      },
      {
        path: 'ganancias',
        loadComponent: () => import('./components/earnings/cursos-ganancias.component').then(m => m.CursosGananciasComponent),
      },
      {
        path: 'admin',
        loadComponent: () => import('./components/admin/cursos-admin.component').then(m => m.CursosAdminComponent),
      },
      {
        path: 'ver/:slug',
        loadComponent: () => import('./components/viewer/cursos-viewer.component').then(m => m.CursosViewerComponent),
      },
      {
        path: 'player/:courseId',
        loadComponent: () => import('./components/player/cursos-player.component').then(m => m.CursosPlayerComponent),
      },
    ],
  },
];
