import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LucideAngularModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Signals para estado reactivo
  readonly isLoading = this.authService.isLoading;
  readonly error = this.authService.error;

  // Formulario reactivo
  registerForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [
      Validators.required, 
      Validators.minLength(8),
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    ]],
    confirmPassword: ['', [Validators.required]],
    acceptTerms: [false, [Validators.requiredTrue]]
  }, {
    validators: this.passwordMatchValidator
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

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    
    return null;
  }

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.successMessage.set(null);
    const { fullName, email, password } = this.registerForm.value;

    this.authService.register({ 
      email, 
      password, 
      fullName 
    }).subscribe({
      next: (result) => {
        if (result.success) {
          this.successMessage.set(result.message || 'Registro exitoso');
          
          if (result.data) {
            setTimeout(() => {
              this.router.navigate([this.returnUrl]);
            }, 1000);
          } else {
            this.registerForm.reset();
          }
        }
      },
      error: (err) => {
        console.error('Error inesperado:', err);
      }
    });
  }

  isFieldInvalid(field: string): boolean {
    const control = this.registerForm.get(field);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }

  getErrorMessage(field: string): string {
    const control = this.registerForm.get(field);
    
    if (!control || !control.errors) return '';

    if (control.errors['required']) {
      return 'Este campo es requerido';
    }
    if (control.errors['email']) {
      return 'Ingrese un correo electrónico válido';
    }
    if (control.errors['minlength']) {
      const minLength = control.errors['minlength'].requiredLength;
      return `Este campo debe tener al menos ${minLength} caracteres`;
    }
    if (control.errors['pattern']) {
      return 'La contraseña debe contener al menos una mayúscula, una minúscula y un número';
    }
    if (control.errors['passwordMismatch']) {
      return 'Las contraseñas no coinciden';
    }

    return '';
  }

  getPasswordRequirements(): { met: boolean; text: string }[] {
    const password = this.registerForm.get('password')?.value || '';
    
    return [
      { met: password.length >= 8, text: 'Al menos 8 caracteres' },
      { met: /[A-Z]/.test(password), text: 'Al menos una mayúscula' },
      { met: /[a-z]/.test(password), text: 'Al menos una minúscula' },
      { met: /\d/.test(password), text: 'Al menos un número' }
    ];
  }
}
