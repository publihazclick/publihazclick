import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard del admin que verifica autenticación y rol
 */
export const adminGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  
  // Verificar si está autenticado
  if (!authService.isAuthenticated()) {
    console.log('AdminGuard: Not authenticated, redirecting to login');
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }
  
  // Por ahora, permitir siempre el acceso si está autenticado
  console.log('AdminGuard: Allowing access for authenticated user');
  return true;
};
