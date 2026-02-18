import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard temporal que permite acceso al admin para pruebas
 */
export const adminGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  
  // Por ahora, permitir siempre el acceso al admin para pruebas
  console.log('AdminGuard: Allowing access for testing');
  return true;
};
