import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProfileService } from '../services/profile.service';

/**
 * Guard que verifica si el usuario tiene rol de admin o dev
 * antes de permitir acceso a rutas administrativas
 */
export const adminGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const profileService = inject(ProfileService);

  // Verificar si hay una sesión activa
  const session = authService.getCurrentSession();
  if (!session) {
    console.log('AdminGuard: No session found, redirecting to login');
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  // Obtener el perfil del usuario para verificar el rol
  const profile = await profileService.getCurrentProfile();

  if (!profile) {
    console.log('AdminGuard: No profile found, redirecting to login');
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  // Verificar si el usuario tiene rol de admin o dev
  const allowedRoles = ['admin', 'dev'];
  if (allowedRoles.includes(profile.role)) {
    console.log('AdminGuard: Access granted for user with role:', profile.role);
    return true;
  }

  // Usuario autenticado pero sin permisos de admin
  console.log('AdminGuard: Access denied - insufficient permissions');
  router.navigate(['/dashboard']);
  return false;
};
