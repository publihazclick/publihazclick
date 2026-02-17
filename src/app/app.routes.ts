import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

/**
 * Rutas de la aplicación
 */
export const routes: Routes = [
  // Rutas de autenticación
  {
    path: 'login',
    loadComponent: () => import('./features/auth/components/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/components/register/register.component').then(m => m.RegisterComponent)
  },
  // Callback de OAuth
  {
    path: 'auth/callback',
    loadComponent: () => import('./features/auth/components/auth-callback/auth-callback.component').then(m => m.AuthCallbackComponent)
  },
  // Ruta principal - cargar el componente App
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
