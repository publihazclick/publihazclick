import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-ai-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './ai-register.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiRegisterComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  confirmPassword = '';

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword.update(v => !v);
  }

  async onSubmit(): Promise<void> {
    this.error.set(null);

    if (!this.email.trim()) {
      this.error.set('Ingresa tu correo electrónico');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email.trim())) {
      this.error.set('Ingresa un correo electrónico válido');
      return;
    }

    if (!this.password) {
      this.error.set('Ingresa una contraseña');
      return;
    }

    if (this.password.length < 6) {
      this.error.set('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.error.set('Las contraseñas no coinciden');
      return;
    }

    this.loading.set(true);

    try {
      const result = await firstValueFrom(
        this.authService.register({
          email: this.email.trim(),
          password: this.password,
        })
      );

      if (result.success) {
        this.router.navigate(['/advertiser/ai/creator']);
      } else {
        this.error.set(result.error?.message ?? 'Error al registrarse');
      }
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'Error al registrarse');
    } finally {
      this.loading.set(false);
    }
  }
}
