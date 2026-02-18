import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';
import { map, take } from 'rxjs/operators';

/**
 * Opciones para el guard de autenticación
 */
export interface AuthGuardOptions {
  /** Si true, permite el acceso solo a usuarios NO autenticados (para páginas como login, register) */
  guestOnly?: boolean;
  /** URL a la que redirigir si el acceso es denegado */
  redirectTo?: string;
  /** Si true, muestra un indicador de carga mientras verifica */
  showLoading?: boolean;
}

/**
 * Opciones por defecto del guard
 */
const defaultOptions: AuthGuardOptions = {
  guestOnly: false,
  redirectTo: environment.redirect?.unauthorized ?? '/login',
  showLoading: true
};

/**
 * Factory para crear un guard de autenticación
 * @param options - Opciones de configuración
 * @returns CanActivateFn
 */
export function createAuthGuard(options: AuthGuardOptions = {}): CanActivateFn {
  const mergedOptions = { ...defaultOptions, ...options };

  return (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // Verificar si ya tenemos la sesión cargada
    const isLoading = authService.isLoading();

    // Si ya tenemos la sesión cargada (isLoading = false)
    if (!isLoading) {
      return handleAuthCheck(authService, router, mergedOptions, state.url);
    }

    // Esperar a que getSession() termine antes de verificar
    return authService.authStateObservable$.pipe(
      take(1),
      map((authState) => {
        return handleAuthCheck(authService, router, mergedOptions, state.url);
      })
    );
  };
}

/**
 * Maneja la verificación de autenticación.
 * Retorna UrlTree para redirecciones (evita router.navigate y conflictos con PendingTasks).
 */
function handleAuthCheck(
  authService: AuthService,
  router: Router,
  options: AuthGuardOptions,
  url: string
): boolean | UrlTree {
  const isAuthenticated = authService.isAuthenticated();

  if (options.guestOnly) {
    // Página para usuarios NO autenticados (login, register, forgot-password)
    if (isAuthenticated) {
      const redirectUrl = environment.redirect?.loginSuccess ?? '/admin';
      return router.createUrlTree([redirectUrl]);
    }
    return true;
  }

  // Página para usuarios autenticados
  if (!isAuthenticated) {
    const redirectUrl = options.redirectTo ?? environment.redirect?.unauthorized ?? '/login';
    return router.createUrlTree([redirectUrl], { queryParams: { returnUrl: url } });
  }

  return true;
}

/**
 * Guard para proteger rutas que requieren autenticación
 * Uso en rutas:
 *
 * {
 *   path: 'dashboard',
 *   canActivate: [authGuard]
 * }
 */
export const authGuard: CanActivateFn = createAuthGuard();

export const guestGuard: CanActivateFn = createAuthGuard({
  guestOnly: true,
  redirectTo: environment.redirect?.loginSuccess ?? '/admin'
});

/**
 * Guard para verificar si el usuario tiene un email confirmado
 * Uso en rutas:
 *
 * {
 *   path: 'verified-dashboard',
 *   canActivate: [verifiedGuard]
 * }
 */
export const verifiedGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();

  if (!user || !user.email_confirmed_at) {
    return router.createUrlTree(['/auth/pending-verification'], {
      queryParams: { returnUrl: state.url }
    });
  }

  return true;
};

/**
 * Guard para verificar el rol del usuario
 * Uso en rutas:
 *
 * {
 *   path: 'admin',
 *   canActivate: [roleGuard(['admin'])]
 * }
 *
 * @param roles - Array de roles permitidos
 */
export function roleGuard(roles: string[]): CanActivateFn {
  return (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const user = authService.getCurrentUser();

    if (!user) {
      return router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url }
      });
    }

    const userRole = user.user_metadata?.['role'];

    if (!roles.includes(userRole)) {
      return router.createUrlTree(['/unauthorized']);
    }

    return true;
  };
}
