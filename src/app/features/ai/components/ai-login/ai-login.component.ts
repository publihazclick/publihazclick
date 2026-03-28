import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-ai-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './ai-login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiLoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  async onSubmit(): Promise<void> {
    this.error.set(null);

    if (!this.email.trim()) {
      this.error.set('Ingresa tu correo electrónico');
      return;
    }

    if (!this.password) {
      this.error.set('Ingresa tu contraseña');
      return;
    }

    this.loading.set(true);

    try {
      const result = await firstValueFrom(
        this.authService.login({
          email: this.email.trim(),
          password: this.password,
        })
      );

      if (result.success) {
        this.router.navigate(['/advertiser/ai/creator']);
      } else {
        this.error.set(result.error?.message ?? 'Credenciales incorrectas');
      }
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'Error al iniciar sesión');
    } finally {
      this.loading.set(false);
    }
  }
}
