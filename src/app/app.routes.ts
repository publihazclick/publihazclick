import { Routes, Router } from '@angular/router';
import { inject } from '@angular/core';
import { adminGuard } from './core/guards/admin.guard';
import { socialGuard } from './core/guards/social.guard';
import { aiGuard } from './core/guards/ai.guard';
import { authGuard, guestGuard, roleRedirectGuard, dashboardGuard } from './core/guards/auth.guard';

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
  // Ruta corta de referido /ref/:code - guarda el código y redirige a la landing (o al módulo si viene ?to=)
  {
    path: 'ref/:code',
    canActivate: [
      (route: any) => {
        const code = route.params['code'];
        if (code && typeof localStorage !== 'undefined') {
          localStorage.setItem('phc_referral_code', code);
        }
        const allowedLandings = ['/trading-bot', '/herramientas-ia', '/cursos', '/sms-masivos'];
        const to = route.queryParams['to'] ?? '';
        const target = allowedLandings.includes(to) ? to : '/';
        return inject(Router).createUrlTree([target]);
      }
    ],
    children: []
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
      },
      {
        path: 'advertiser-ptc',
        loadComponent: () =>
          import('./features/admin/components/advertiser-ptc/advertiser-ptc.component').then(
            m => m.AdminAdvertiserPtcComponent
          )
      },
      {
        path: 'withdrawals',
        loadComponent: () =>
          import('./features/admin/components/withdrawals/withdrawals.component').then(
            m => m.AdminWithdrawalsComponent
          )
      },
      {
        path: 'calculator',
        loadComponent: () => import('./features/user/components/calculator/calculator.component').then(m => m.CalculatorComponent)
      },
      {
        path: 'trading-bot',
        loadComponent: () => import('./features/user/components/trading-bot/trading-bot.component').then(m => m.TradingBotComponent)
      },
      {
        path: 'trading-config',
        loadComponent: () => import('./features/admin/components/trading-config/trading-config.component').then(m => m.TradingConfigComponent)
      },
      {
        path: 'commissions',
        loadComponent: () => import('./features/admin/components/commissions/commissions.component').then(m => m.AdminCommissionsComponent)
      },
      {
        path: 'broadcasts',
        loadComponent: () => import('./features/admin/components/broadcasts/broadcasts.component').then(m => m.AdminBroadcastsComponent)
      },
      {
        path: 'ai-pricing',
        loadComponent: () => import('./features/admin/components/ai-pricing/ai-pricing.component').then(m => m.AdminAiPricingComponent)
      },
      {
        path: 'anda-gana',
        loadComponent: () => import('./features/admin/components/anda-gana-admin/anda-gana-admin.component').then(m => m.AndaGanaAdminComponent)
      },
      {
        path: 'video-landing',
        loadComponent: () => import('./features/admin/components/video-landing/video-landing.component').then(m => m.AdminVideoLandingComponent)
      },
      {
        path: 'social-links',
        loadComponent: () => import('./features/admin/components/social-links/social-links.component').then(m => m.AdminSocialLinksComponent)
      },
      {
        path: 'subir-test',
        loadComponent: () => import('./features/admin/components/subir-test/subir-test.component').then(m => m.AdminSubirTestComponent)
      },
      {
        path: 'cursos',
        loadChildren: () => import('./features/cursos/cursos.routes').then(m => m.cursosRoutes)
      },
      {
        path: 'sms-masivos',
        loadComponent: () => import('./features/user/components/sms-masivos/sms-masivos.component').then(m => m.SmsMasivosComponent)
      },
      {
        path: 'punto-pago',
        loadComponent: () => import('./features/punto-pago/punto-pago.component').then(m => m.PuntoPagoComponent)
      },
      {
        path: 'xzoom-en-vivo',
        loadComponent: () => import('./features/xzoom-en-vivo/xzoom-en-vivo.component').then(m => m.XzoomEnVivoComponent)
      },
      {
        path: 'xzoom-settings',
        loadComponent: () => import('./features/admin/components/xzoom-settings/admin-xzoom-settings.component').then(m => m.AdminXzoomSettingsComponent)
      },
      {
        path: 'automatic-whatsapp',
        loadComponent: () => import('./features/automatic-whatsapp/components/automatic-whatsapp/automatic-whatsapp.component').then(m => m.AutomaticWhatsappComponent)
      },
      {
        path: 'dinamicas',
        loadComponent: () => import('./features/dinamicas/components/dinamicas/dinamicas.component').then(m => m.DinamicasComponent)
      },
      {
        path: 'trading-operation',
        loadComponent: () => import('./features/user/components/trading-operation/trading-operation.component').then(m => m.TradingOperationComponent)
      },
      {
        path: 'trading-operation/:packageId',
        loadComponent: () => import('./features/user/components/trading-operation/trading-operation.component').then(m => m.TradingOperationComponent)
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
  // Herramientas IA — redirigir /ai al módulo dentro de advertiser
  {
    path: 'ai',
    canActivate: [aiGuard],
    children: [
      { path: '', redirectTo: '/advertiser/ai', pathMatch: 'full' },
      { path: 'create', redirectTo: '/advertiser/ai/create', pathMatch: 'full' }
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
        path: 'marketplace',
        loadComponent: () => import('./features/social/components/marketplace/marketplace.component').then(m => m.MarketplaceComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/user/components/settings/settings.component').then(m => m.UserSettingsComponent)
      },
      {
        path: 'calculator',
        loadComponent: () => import('./features/user/components/calculator/calculator.component').then(m => m.CalculatorComponent)
      },
      {
        path: 'dinamicas',
        loadComponent: () => import('./features/dinamicas/components/dinamicas/dinamicas.component').then(m => m.DinamicasComponent)
      },
      {
        path: 'automatic-whatsapp',
        loadComponent: () => import('./features/automatic-whatsapp/components/automatic-whatsapp/automatic-whatsapp.component').then(m => m.AutomaticWhatsappComponent)
      },
      {
        path: 'trading-bot',
        loadComponent: () => import('./features/user/components/trading-bot/trading-bot.component').then(m => m.TradingBotComponent)
      },
{
        path: 'trading-operation',
        loadComponent: () => import('./features/user/components/trading-operation/trading-operation.component').then(m => m.TradingOperationComponent)
      },
      {
        path: 'trading-operation/:packageId',
        loadComponent: () => import('./features/user/components/trading-operation/trading-operation.component').then(m => m.TradingOperationComponent)
      },
      {
        path: 'anda-gana',
        loadComponent: () => import('./features/anda-gana/anda-gana.component').then(m => m.AndaGanaComponent)
      },
      {
        path: 'cursos',
        loadChildren: () => import('./features/cursos/cursos.routes').then(m => m.cursosRoutes)
      },
      {
        path: 'sms-masivos',
        loadComponent: () => import('./features/user/components/sms-masivos/sms-masivos.component').then(m => m.SmsMasivosComponent)
      },
      {
        path: 'punto-pago',
        loadComponent: () => import('./features/punto-pago/punto-pago.component').then(m => m.PuntoPagoComponent)
      },
      {
        path: 'xzoom-en-vivo',
        loadComponent: () => import('./features/xzoom-en-vivo/xzoom-en-vivo.component').then(m => m.XzoomEnVivoComponent)
      },
    ]
  },
  // Rutas de Herramientas IA — con layout de advertiser pero sin authGuard
  {
    path: 'advertiser/ai',
    loadComponent: () => import('./features/advertiser/components/advertiser-layout/advertiser-layout.component').then(m => m.AdvertiserLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/ai/components/ai-dashboard/ai-dashboard.component').then(m => m.AiDashboardComponent)
      },
      {
        path: 'creator',
        loadComponent: () => import('./features/ai/components/creator-dashboard/creator-dashboard.component').then(m => m.CreatorDashboardComponent)
      },
      {
        path: 'image',
        loadComponent: () => import('./features/ai/components/image-generator/image-generator.component').then(m => m.ImageGeneratorComponent)
      },
      {
        path: 'create',
        loadComponent: () => import('./features/ai/components/video-create/video-create.component').then(m => m.VideoCreateComponent)
      },
      {
        path: 'wallet',
        loadComponent: () => import('./features/ai/components/ai-wallet/ai-wallet.component').then(m => m.AiWalletComponent)
      },
      {
        path: 'video-generator',
        loadComponent: () => import('./features/ai/components/video-generator/video-generator.component').then(m => m.VideoGeneratorComponent)
      },
      {
        path: 'youtube-studio',
        loadComponent: () => import('./features/ai/components/youtube-studio/youtube-studio.component').then(m => m.YoutubeStudioComponent)
      },
      {
        path: 'video-studio',
        loadComponent: () => import('./features/ai/components/video-studio/video-studio.component').then(m => m.VideoStudioComponent)
      },
    ]
  },
  // Registro y login IA — sin layout (pantalla completa)
  {
    path: 'advertiser/ai/register',
    loadComponent: () => import('./features/ai/components/ai-register/ai-register.component').then(m => m.AiRegisterComponent)
  },
  {
    path: 'advertiser/ai/login',
    loadComponent: () => import('./features/ai/components/ai-login/ai-login.component').then(m => m.AiLoginComponent)
  },
  // Rutas de usuario (dashboard) — solo rol 'guest'; advertiser/admin son redirigidos
  {
    path: 'dashboard',
    loadComponent: () => import('./features/user/components/user-layout/user-layout.component').then(m => m.UserLayoutComponent),
    canActivate: [dashboardGuard],
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
      },
      {
        path: 'calculator',
        loadComponent: () => import('./features/user/components/calculator/calculator.component').then(m => m.CalculatorComponent)
      },
      {
        path: 'dinamicas',
        loadComponent: () => import('./features/dinamicas/components/dinamicas/dinamicas.component').then(m => m.DinamicasComponent)
      },
      {
        path: 'automatic-whatsapp',
        loadComponent: () => import('./features/automatic-whatsapp/components/automatic-whatsapp/automatic-whatsapp.component').then(m => m.AutomaticWhatsappComponent)
      },
      {
        path: 'trading-bot',
        loadComponent: () => import('./features/user/components/trading-bot/trading-bot.component').then(m => m.TradingBotComponent)
      },
{
        path: 'trading-operation',
        loadComponent: () => import('./features/user/components/trading-operation/trading-operation.component').then(m => m.TradingOperationComponent)
      },
      {
        path: 'trading-operation/:packageId',
        loadComponent: () => import('./features/user/components/trading-operation/trading-operation.component').then(m => m.TradingOperationComponent)
      },
      {
        path: 'anda-gana',
        loadComponent: () => import('./features/anda-gana/anda-gana.component').then(m => m.AndaGanaComponent)
      },
      {
        path: 'cursos',
        loadChildren: () => import('./features/cursos/cursos.routes').then(m => m.cursosRoutes)
      },
      {
        path: 'sms-masivos',
        loadComponent: () => import('./features/user/components/sms-masivos/sms-masivos.component').then(m => m.SmsMasivosComponent)
      },
      {
        path: 'punto-pago',
        loadComponent: () => import('./features/punto-pago/punto-pago.component').then(m => m.PuntoPagoComponent)
      },
      {
        path: 'xzoom-en-vivo',
        loadComponent: () => import('./features/xzoom-en-vivo/xzoom-en-vivo.component').then(m => m.XzoomEnVivoComponent)
      }
    ]
  },
  // Ruta raíz - Landing page con redirección según rol
  {
    path: '',
    loadComponent: () => import('./app').then(m => m.App),
    canActivate: [roleRedirectGuard]
  },
  // Ruta pública para la app Movi (Capacitor apunta a /anda-gana)
  {
    path: 'anda-gana',
    loadComponent: () => import('./features/anda-gana/anda-gana.component').then(m => m.AndaGanaComponent),
  },
  // Páginas públicas
  {
    path: 'quienes-somos',
    loadComponent: () => import('./pages/about/about.component').then(m => m.AboutComponent)
  },
  // XZOOM EN VIVO — landing pública (accesible sin login)
  {
    path: 'xzoom',
    loadComponent: () => import('./features/xzoom-en-vivo/xzoom-public-landing.component').then(m => m.XzoomPublicLandingComponent)
  },
  // XZOOM EN VIVO — formulario combinado de login + registro
  {
    path: 'xzoom/auth',
    loadComponent: () => import('./features/xzoom-en-vivo/xzoom-auth.component').then(m => m.XzoomAuthComponent)
  },
  // XZOOM EN VIVO — landing privada del anfitrión con pitch video + suscripción
  {
    path: 'xzoom/h/:slug',
    loadComponent: () => import('./features/xzoom-en-vivo/xzoom-host-landing.component').then(m => m.XzoomHostLandingComponent)
  },
  // XZOOM EN VIVO — panel del anfitrión standalone (sin layouts de Publihazclick)
  {
    path: 'xzoom/panel',
    loadComponent: () => import('./features/xzoom-en-vivo/xzoom-en-vivo.component').then(m => m.XzoomEnVivoComponent),
    canActivate: [authGuard]
  },
  // XZOOM EN VIVO — link de invitación de participante: solo redirige a la landing pública
  {
    path: 'xzoom/invite/p/:code',
    canActivate: [
      () => inject(Router).createUrlTree(['/xzoom'])
    ],
    children: []
  },
  {
    path: 'terminos',
    loadComponent: () => import('./pages/terms/terms.component').then(m => m.TermsComponent)
  },
  // Landing pages públicas de módulos
  {
    path: 'trading-bot',
    loadComponent: () => import('./pages/module-landing/trading-bot-landing.component').then(m => m.TradingBotLandingComponent),
  },
  {
    path: 'herramientas-ia',
    loadComponent: () => import('./pages/module-landing/ia-landing.component').then(m => m.IaPublicLandingComponent),
  },
  {
    path: 'cursos',
    loadComponent: () => import('./pages/module-landing/cursos-landing.component').then(m => m.CursosPublicLandingComponent),
  },
  {
    path: 'sms-masivos',
    loadComponent: () => import('./pages/module-landing/sms-landing.component').then(m => m.SmsPublicLandingComponent),
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/privacy/privacy.component').then(m => m.PrivacyComponent),
  },
  {
    path: 'delete-account',
    loadComponent: () => import('./pages/delete-account/delete-account.component').then(m => m.DeleteAccountComponent),
  },
  // 404
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found.component').then(m => m.NotFoundComponent)
  }
];
