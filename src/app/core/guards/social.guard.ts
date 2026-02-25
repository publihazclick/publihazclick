import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';

/**
 * Guard de red social - solo advertiser, admin y dev pueden acceder
 */
export const socialGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const profileService = inject(ProfileService);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  try {
    const profile = await profileService.getCurrentProfile();

    if (!profile) {
      return router.createUrlTree(['/login']);
    }

    const allowed = ['advertiser', 'admin', 'dev'];
    if (!allowed.includes(profile.role)) {
      return router.createUrlTree(['/dashboard']);
    }

    return true;
  } catch {
    return router.createUrlTree(['/login']);
  }
};
