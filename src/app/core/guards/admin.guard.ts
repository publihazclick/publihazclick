import { inject } from '@angular/core';
import { Router, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';

/**
 * Guard del admin - protege rutas de administración
 * Verifica que el usuario esté autenticado y tenga rol de admin
 */
export const adminGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const profileService = inject(ProfileService);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  try {
    const profile = await profileService.getCurrentProfile();

    if (!profile) {
      return router.createUrlTree(['/dashboard']);
    }

    if (profile.role !== 'admin' && profile.role !== 'dev') {
      return router.createUrlTree(['/unauthorized']);
    }

    return true;
  } catch {
    return router.createUrlTree(['/dashboard']);
  }
};
