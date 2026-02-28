import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { socialGuard } from './core/guards/social.guard';
import { authGuard, guestGuard, roleRedirectGuard } from './core/guards/auth.guard';

/**
 * Rutas de la aplicación
 */
export const routes: Routes = [
  // Ruta de login - solo para usuarios NO autenticados
  {
    path: 'login',
    loadComponent: () => import('./features/auth/components/login/login.component').then(m => m.LoginComponent),
    canActivate: [guestGuard]
  },
  // Ruta de registro - solo para usuarios NO autenticados
  {
    path: 'register',
    loadComponent: () => import('./features/auth/components/register/register.component').then(m => m.RegisterComponent),
    canActivate: [guestGuard]
  },
  // Ruta corta de referido /ref/:code - solo para usuarios NO autenticados
  {
    path: 'ref/:code',
    loadComponent: () => import('./features/auth/components/register/register.component').then(m => m.RegisterComponent),
    canActivate: [guestGuard]
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
        redirectTo: '/admin/ads',
        pathMatch: 'full'
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
      },
      {
        path: 'auth-banners',
        loadComponent: () =>
          import('./features/admin/components/auth-banners/auth-banners.component').then(
            m => m.AdminAuthBannersComponent
          )
      },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./features/admin/components/reportes/reportes.component').then(
            m => m.AdminReportesComponent
          )
      },
      {
        path: 'fraud',
        loadComponent: () =>
          import('./features/admin/components/fraud/fraud.component').then(
            m => m.AdminFraudComponent
          )
      }
    ]
  },
  // Red Social (advertiser, admin, dev)
  {
    path: 'social',
    loadComponent: () => import('./features/social/components/social-layout/social-layout.component').then(m => m.SocialLayoutComponent),
    canActivate: [socialGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/social/components/profile-redirect/profile-redirect.component').then(m => m.SocialProfileRedirectComponent),
        pathMatch: 'full'
      },
      {
        path: 'messages',
        redirectTo: '/social',
        pathMatch: 'full',
      },
      {
        path: 'messages/:convId',
        redirectTo: '/social',
      },
      {
        path: 'directory',
        loadComponent: () => import('./features/social/components/directory/directory.component').then(m => m.SocialDirectoryComponent)
      },
      {
        path: 'connections',
        loadComponent: () => import('./features/social/components/connections/connections.component').then(m => m.SocialConnectionsComponent)
      },
      {
        path: 'marketplace',
        loadComponent: () => import('./features/social/components/marketplace/marketplace.component').then(m => m.MarketplaceComponent)
      },
      {
        path: ':username',
        loadComponent: () => import('./features/social/components/profile/profile.component').then(m => m.SocialProfileComponent)
      }
    ]
  },
  // Rutas de anunciante
  {
    path: 'advertiser',
    loadComponent: () => import('./features/advertiser/components/advertiser-layout/advertiser-layout.component').then(m => m.AdvertiserLayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/user/components/dashboard/dashboard.component').then(m => m.UserDashboardComponent)
      },
      {
        path: 'wallet',
        loadComponent: () => import('./features/user/components/wallet/wallet.component').then(m => m.UserWalletComponent)
      },
      {
        path: 'recommend',
        loadComponent: () => import('./features/advertiser/components/recommend/recommend.component').then(m => m.AdvertiserRecommendComponent)
      },
      {
        path: 'referrals',
        loadComponent: () => import('./features/user/components/referrals/referrals.component').then(m => m.UserReferralsComponent)
      },
      {
        path: 'leader',
        loadComponent: () => import('./features/user/components/leader/leader.component').then(m => m.LeaderComponent)
      },
      {
        path: 'history',
        loadComponent: () => import('./features/user/components/history/history.component').then(m => m.UserHistoryComponent)
      },
      {
        path: 'packages',
        loadComponent: () => import('./features/user/components/packages/packages.component').then(m => m.UserPackagesComponent)
      },
      {
        path: 'ads',
        loadComponent: () => import('./features/advertiser/components/ads/advertiser-ads.component').then(m => m.AdvertiserAdsComponent)
      },
      {
        path: 'banner',
        loadComponent: () => import('./features/advertiser/components/banner/advertiser-banner.component').then(m => m.AdvertiserBannerComponent)
      },
      {
        path: 'tasks',
        loadComponent: () => import('./features/advertiser/components/tasks/advertiser-tasks.component').then(m => m.AdvertiserTasksComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/user/components/settings/settings.component').then(m => m.UserSettingsComponent)
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
        path: 'leader',
        loadComponent: () => import('./features/user/components/leader/leader.component').then(m => m.LeaderComponent)
      },
      {
        path: 'history',
        loadComponent: () => import('./features/user/components/history/history.component').then(m => m.UserHistoryComponent)
      },
      {
        path: 'packages',
        loadComponent: () => import('./features/user/components/packages/packages.component').then(m => m.UserPackagesComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/user/components/settings/settings.component').then(m => m.UserSettingsComponent)
      }
    ]
  },
  // Ruta raíz - Landing page con redirección según rol
  {
    path: '',
    loadComponent: () => import('./app').then(m => m.App),
    canActivate: [roleRedirectGuard]
  },
  // Páginas públicas
  {
    path: 'quienes-somos',
    loadComponent: () => import('./pages/about/about.component').then(m => m.AboutComponent)
  },
  {
    path: 'terminos',
    loadComponent: () => import('./pages/terms/terms.component').then(m => m.TermsComponent)
  },
  // 404
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found.component').then(m => m.NotFoundComponent)
  }
];
