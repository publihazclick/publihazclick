import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';

/**
 * Rutas de la aplicación
 */
export const routes: Routes = [
  // Ruta de login
  {
    path: 'login',
    loadComponent: () => import('./features/auth/components/login/login.component').then(m => m.LoginComponent)
  },
  // Ruta de registro
  {
    path: 'register',
    loadComponent: () => import('./features/auth/components/register/register.component').then(m => m.RegisterComponent)
  },
  // Ruta corta de referido /ref/:code
  {
    path: 'ref/:code',
    loadComponent: () => import('./features/auth/components/register/register.component').then(m => m.RegisterComponent)
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
      },
      {
        path: 'packages',
        loadComponent: () => import('./features/admin/components/packages/packages.component').then(m => m.AdminPackagesComponent)
      },
      {
        path: 'ads',
        loadComponent: () => import('./features/admin/components/ads/ads.component').then(m => m.AdminAdsComponent)
      }
    ]
  },
  // Rutas de usuario (dashboard)
  {
    path: 'dashboard',
    loadComponent: () => import('./features/user/components/user-layout/user-layout.component').then(m => m.UserLayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/user/components/dashboard/dashboard.component').then(m => m.UserDashboardComponent)
      },
      {
        path: 'ads',
        loadComponent: () => import('./features/user/components/ads/ads.component').then(m => m.UserAdsComponent)
      },
      {
        path: 'wallet',
        loadComponent: () => import('./features/user/components/wallet/wallet.component').then(m => m.UserWalletComponent)
      },
      {
        path: 'referrals',
        loadComponent: () => import('./features/user/components/referrals/referrals.component').then(m => m.UserReferralsComponent)
      },
      {
        path: 'history',
        loadComponent: () => import('./features/user/components/history/history.component').then(m => m.UserHistoryComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/user/components/settings/settings.component').then(m => m.UserSettingsComponent)
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
