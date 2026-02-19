import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard temporal que permite acceso al admin para pruebas
 * TODO: Implementar verificación de rol cuando la tabla profiles esté lista
 */
export const adminGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  
  // Por ahora, permitir siempre el acceso al admin para pruebas
  // Esto permite que el login funcione correctamente
  console.log('AdminGuard: Allowing access for testing');
  return true;
};
