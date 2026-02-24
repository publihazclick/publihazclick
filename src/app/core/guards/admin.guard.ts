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

  // Verificar si el usuario está autenticado
  if (!authService.isAuthenticated()) {
    console.log('[AdminGuard] Usuario no autenticado, redirigiendo a login');
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  try {
    // Obtener el perfil del usuario
    const profile = await profileService.getCurrentProfile();
    
    if (!profile) {
      console.log('[AdminGuard] Perfil no encontrado, redirigiendo a dashboard');
      return router.createUrlTree(['/dashboard']);
    }

    // Verificar si el usuario tiene rol de admin
    if (profile.role !== 'admin' && profile.role !== 'dev') {
      console.log('[AdminGuard] Usuario no es admin, rol:', profile.role);
      return router.createUrlTree(['/unauthorized']);
    }

    console.log('[AdminGuard] Acceso permitido para admin:', profile.username);
    return true;
  } catch (error) {
    console.error('[AdminGuard] Error al verificar perfil:', error);
    return router.createUrlTree(['/dashboard']);
  }
};
