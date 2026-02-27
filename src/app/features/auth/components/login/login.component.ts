import { Component, inject, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { AuthAdsComponent } from '../auth-ads/auth-ads.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, AuthAdsComponent],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.profileService.getCurrentProfile().then(profile => {
        const role = profile?.role;
        if (role === 'admin' || role === 'dev') {
          this.router.navigate(['/admin']);
        } else if (role === 'advertiser') {
          this.router.navigate(['/advertiser']);
        } else {
          this.router.navigate(['/dashboard']);
        }
      }).catch(() => {
        this.router.navigate(['/dashboard']);
      });
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    const email = this.loginForm.get('email')?.value;
    const password = this.loginForm.get('password')?.value;

    this.authService.login({ email, password }).subscribe({
      next: (result) => {
        this.isLoading.set(false);
        if (result.success) {
          this.successMessage.set('Inicio de sesión exitoso. Redirigiendo...');
          this.profileService.getCurrentProfile().then(profile => {
            const role = profile?.role;
            if (role === 'admin' || role === 'dev') {
              this.router.navigate(['/admin']);
            } else if (role === 'advertiser') {
              this.router.navigate(['/advertiser']);
            } else {
              this.router.navigate(['/dashboard']);
            }
          }).catch(() => {
            this.router.navigate(['/dashboard']);
          });
        } else {
          this.errorMessage.set(result.message || 'Correo o contraseña incorrectos');
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Error de conexión. Verifica tu internet e intenta de nuevo.');
      }
    });
  }

  isFieldInvalid(field: string): boolean {
    const control = this.loginForm.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  getErrorMessage(field: string): string {
    const control = this.loginForm.get(field);
    if (!control || !control.errors) return '';
    if (control.errors['required']) return 'Este campo es requerido';
    if (control.errors['email']) return 'Ingresa un correo electrónico válido';
    if (control.errors['minlength']) {
      const min = control.errors['minlength'].requiredLength;
      return `La contraseña debe tener al menos ${min} caracteres`;
    }
    return '';
  }
}
