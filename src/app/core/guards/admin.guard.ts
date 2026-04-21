import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import { awaitAuthLoaded } from './auth-wait.util';

/**
 * Guard del admin - protege rutas de administración
 * Verifica que el usuario esté autenticado y tenga rol de admin.
 *
 * IMPORTANTE: espera a que la sesión termine de cargar antes de decidir.
 * Si no espera, al recargar la página el guard ve isAuthenticated()=false
 * (porque Supabase aún no rehidrató la sesión) y redirige a /login,
 * perdiendo la sub-ruta donde estaba el usuario.
 */
export const adminGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const profileService = inject(ProfileService);
  const platformId = inject(PLATFORM_ID);

  // En SSR: dejar pasar, el cliente re-evaluará con sesión real.
  if (!isPlatformBrowser(platformId)) return true;

  await awaitAuthLoaded(authService);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  try {
    const profile = await profileService.getCurrentProfile();

    if (!profile) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }

    if (profile.role !== 'admin' && profile.role !== 'dev') {
      return router.createUrlTree(['/unauthorized']);
    }

    return true;
  } catch {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
};
