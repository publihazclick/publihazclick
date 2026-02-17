import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Importar iconos de Lucide
  readonly Mail = LucideAngularModule;
  readonly Lock = LucideAngularModule;
  readonly Eye = LucideAngularModule;
  readonly EyeOff = LucideAngularModule;
  readonly LogIn = LucideAngularModule;
  readonly Github = LucideAngularModule;
  readonly Loader = LucideAngularModule;

  // Signals para estado reactivo
  readonly isLoading = this.authService.isLoading;
  readonly error = this.authService.error;

  // Formulario reactivo
  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    rememberMe: [false]
  });

  // Estado de la contraseña
  readonly showPassword = signal(false);

  // Mensaje de éxito
  successMessage = signal<string | null>(null);

  // Return URL
  returnUrl: string = '/dashboard';

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';

    if (this.authService.isAuthenticated()) {
      this.router.navigate([this.returnUrl]);
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

    this.successMessage.set(null);
    const { email, password } = this.loginForm.value;

    this.authService.login({ email, password }).subscribe({
      next: (result) => {
        if (result.success) {
          this.successMessage.set(result.message || 'Inicio de sesión exitoso');
          setTimeout(() => {
            this.router.navigate([this.returnUrl]);
          }, 500);
        }
      },
      error: (err) => {
        console.error('Error inesperado:', err);
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

    if (control.errors['required']) {
      return 'Este campo es requerido';
    }
    if (control.errors['email']) {
      return 'Ingrese un correo electrónico válido';
    }
    if (control.errors['minlength']) {
      const minLength = control.errors['minlength'].requiredLength;
      return `La contraseña debe tener al menos ${minLength} caracteres`;
    }

    return '';
  }
}
