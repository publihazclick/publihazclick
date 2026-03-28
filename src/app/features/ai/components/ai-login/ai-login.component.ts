import { Component, ChangeDetectionStrategy, inject, signal, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { getSupabaseClient } from '../../../../core/supabase.client';
import { firstValueFrom } from 'rxjs';

const AI_EMAIL_KEY = 'ai_last_email';

@Component({
  selector: 'app-ai-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './ai-login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiLoginComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  email = '';
  password = '';

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  async ngOnInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    // Si ya hay sesión activa, ir directo al creator
    const { data: { session } } = await getSupabaseClient().auth.getSession();
    if (session) {
      this.router.navigate(['/advertiser/ai/creator']);
      return;
    }

    // Autocompletar email guardado
    const savedEmail = localStorage.getItem(AI_EMAIL_KEY);
    if (savedEmail) this.email = savedEmail;
  }

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
          rememberMe: true,
        })
      );

      if (result.success) {
        // Guardar email para próxima vez
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem(AI_EMAIL_KEY, this.email.trim());
        }
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
