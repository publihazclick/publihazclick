import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { environment } from '../../../../../environments/environment';

/**
 * Componente para manejar el callback de autenticación OAuth
 * Este componente se carga después de que el usuario se autentica con Google/GitHub
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
        <h2 class="mt-4 text-xl font-semibold text-gray-900">Completando autenticación...</h2>
        <p class="mt-2 text-gray-600">Por favor, espera un momento</p>
      </div>
    </div>
  `
})
export class AuthCallbackComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    // El servicio de autenticación ya maneja el evento de OAuth automáticamente
    // Este componente solo muestra un indicador de carga
    
    // Verificar si la sesión se estableció correctamente
    setTimeout(() => {
      if (this.authService.isAuthenticated()) {
        const redirectUrl = environment.redirect?.loginSuccess ?? '/dashboard';
        this.router.navigate([redirectUrl]);
      } else {
        // Si no hay sesión, redirigir a login
        this.router.navigate(['/login']);
      }
    }, 2000);
  }
}
