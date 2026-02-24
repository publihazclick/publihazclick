import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
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

export const guestGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const profileService = inject(ProfileService);
  const router = inject(Router);

  console.log('[GuestGuard] ===== INICIO =====');
  console.log('[GuestGuard] URL:', state.url);
  console.log('[GuestGuard] Ruta:', route.url.map(s => s.path));
  console.log('[GuestGuard] ¿Cargando sesión?:', authService.isLoading());
  
  // Si está cargando la sesión, esperar
  if (authService.isLoading()) {
    console.log('[GuestGuard] Sesión todavía cargando, esperando...');
    // Primero verificar si ya terminó de cargar mientras preparamos la suscripción
    if (!authService.isLoading()) {
      console.log('[GuestGuard] La sesión ya terminó de cargar!');
    } else {
      // Esperar a que la sesión esté lista
      await new Promise<void>(resolve => {
        const subscription = authService.authStateObservable$.subscribe(state => {
          console.log('[GuestGuard] Estado recibido:', state.isLoading);
          if (!state.isLoading) {
            subscription.unsubscribe();
            resolve();
          }
        });
        
        // Timeout de seguridad: si no responde en 5 segundos, continuar
        setTimeout(() => {
          subscription.unsubscribe();
          console.log('[GuestGuard] Timeout, continuando...');
          resolve();
        }, 5000);
      });
    }
  }

  // Ahora verificar si está autenticado
  const isAuth = authService.isAuthenticated();
  const url = state.url;
  
  console.log('[GuestGuard] ¿Usuario autenticado?:', isAuth);
  
  // Si no está autenticado, permitir acceso (mostrar login/register/landing)
  if (!isAuth) {
    console.log('[GuestGuard] Usuario no autenticado, permitido');
    return true;
  }
  
  // Si está autenticado pero la URL es /ref/:code, permitir acceso para ver el código
  if (url.includes('/ref/')) {
    console.log('[GuestGuard] Usuario autenticado pero URL es /ref/, permitido');
    return true;
  }

  // Usuario autenticado, redirigir según su rol
  try {
    console.log('[GuestGuard] Obteniendo perfil...');
    const profile = await profileService.getCurrentProfile();
    
    if (!profile) {
      // No hay perfil, cerrar sesión y permitir acceso
      console.log('[GuestGuard] Sin perfil, cerrando sesión');
      await authService.logout();
      return true;
    }

    console.log('[GuestGuard] Redirigiendo usuario autenticado con rol:', profile.role);
    
    // Redirigir según el rol
    switch (profile.role) {
      case 'admin':
      case 'dev':
        return router.createUrlTree(['/admin']);
      case 'advertiser':
      case 'guest':
      default:
        return router.createUrlTree(['/dashboard']);
    }
  } catch (error) {
    console.log('[GuestGuard] Error:', error);
    return true; // En caso de error, permitir acceso
  }
  console.log('[GuestGuard] ===== FIN - PERMITIDO =====');
};

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

/**
 * Guard que redirige al usuario según su rol después del login
 * Útil para la ruta raíz o después del login
 * 
 * Uso:
 * {
 *   path: '',
 *   canActivate: [roleRedirectGuard]
 * }
 */
export const roleRedirectGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const profileService = inject(ProfileService);
  const router = inject(Router);

  console.log('[RoleRedirectGuard] ===== INICIO =====');
  console.log('[RoleRedirectGuard] URL:', state.url);

  // Si está cargando la sesión, esperar
  if (authService.isLoading()) {
    console.log('[RoleRedirectGuard] Esperando carga de sesión...');
    await new Promise<void>(resolve => {
      const subscription = authService.authStateObservable$.subscribe(state => {
        if (!state.isLoading) {
          subscription.unsubscribe();
          resolve();
        }
      });
    });
  }

  console.log('[RoleRedirectGuard] ¿Usuario autenticado?:', authService.isAuthenticated());

  // Verificar si el usuario está autenticado
  if (!authService.isAuthenticated()) {
    // Usuario no autenticado, permitir acceso (mostrar landing/login)
    return true;
  }

  try {
    // Obtener el perfil del usuario
    const profile = await profileService.getCurrentProfile();
    
    if (!profile) {
      // No hay perfil, cerrar sesión y mostrar landing
      await authService.logout();
      return true;
    }

    // Redirigir según el rol
    console.log('[RoleRedirectGuard] Redirigiendo usuario con rol:', profile.role);
    
    switch (profile.role) {
      case 'admin':
      case 'dev':
        return router.createUrlTree(['/admin']);
      case 'advertiser':
        return router.createUrlTree(['/dashboard']);
      case 'guest':
      default:
        return router.createUrlTree(['/dashboard']);
    }
  } catch (error) {
    console.error('[RoleRedirectGuard] Error:', error);
    return true; // En caso de error, permitir acceso
  }
};
