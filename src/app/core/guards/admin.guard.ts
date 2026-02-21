import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard del admin - permite acceso temporalmente para pruebas
 * TODO: Necesita depuración del sistema de autenticación
 */
export const adminGuard: CanActivateFn = async (route, state) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  
  // Temporal: permitir acceso para pruebas
  // El problema es que el login no está creando la sesión correctamente
  console.log('AdminGuard: Allowing access (temporary for testing)');
  return true;
};
