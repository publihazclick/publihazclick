import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';
import { awaitAuthLoaded } from './auth-wait.util';

/**
 * Guard de red social - guest, advertiser, admin y dev pueden acceder.
 * Espera a que la sesión termine de cargar antes de decidir (ver auth-wait.util).
 */
export const socialGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const profileService = inject(ProfileService);
  const platformId = inject(PLATFORM_ID);

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

    const allowed = ['guest', 'advertiser', 'admin', 'dev'];
    if (!allowed.includes(profile.role)) {
      return router.createUrlTree(['/dashboard']);
    }

    return true;
  } catch {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
};
