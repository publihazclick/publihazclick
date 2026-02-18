import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';

/**
 * Rutas de la aplicación
 */
export const routes: Routes = [
  // Ruta de login
  {
    path: 'login',
    loadComponent: () => import('./features/auth/components/login/login.component').then(m => m.LoginComponent)
  },
  // Rutas de admin
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/components/admin-layout/admin-layout.component').then(m => m.AdminLayoutComponent),
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/admin/components/dashboard/dashboard.component').then(m => m.AdminDashboardComponent)
      },
      {
        path: 'users',
        loadComponent: () => import('./features/admin/components/users/users.component').then(m => m.AdminUsersComponent)
      },
      {
        path: 'moderation',
        loadComponent: () => import('./features/admin/components/moderation/moderation.component').then(m => m.AdminModerationComponent)
      },
      {
        path: 'reports',
        loadComponent: () => import('./features/admin/components/reports/reports.component').then(m => m.AdminReportsComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/admin/components/settings/settings.component').then(m => m.AdminSettingsComponent)
      },
      {
        path: 'logs',
        loadComponent: () => import('./features/admin/components/logs/logs.component').then(m => m.AdminLogsComponent)
      }
    ]
  },
  // Ruta principal - cargar el componente App (Landing page)
  {
    path: '',
    loadComponent: () => import('./app').then(m => m.App)
  },
  // 404 - redirigir a home
  {
    path: '**',
    redirectTo: ''
  }
];
