import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { awaitAuthLoaded } from '../../core/guards/auth-wait.util';

const MOVI_ROLES = ['super_admin', 'movi_admin', 'contable'];

export const moviAdminGuard: CanActivateFn = async (route, state) => {
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
    if (!profile) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    if (!MOVI_ROLES.includes(profile.role)) return router.createUrlTree(['/unauthorized']);
    return true;
  } catch {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
};
