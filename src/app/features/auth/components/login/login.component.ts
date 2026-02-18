import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Estado del login
  isLoading = false;
  
  // Formulario reactivo con credenciales de prueba
  loginForm: FormGroup = this.fb.group({
    email: ['publihazclick.com@gmail.com', [Validators.required, Validators.email]],
    password: ['publihazclick', [Validators.required, Validators.minLength(6)]]
  });

  // Estado de la contraseña
  showPassword = false;
  
  // Mensajes
  errorMessage: string | null = null;
  successMessage: string | null = null;

  // Credenciales de prueba predefinidas
  testAccounts = [
    { email: 'publihazclick.com@gmail.com', password: 'publihazclick', label: 'Admin Principal' }
  ];

  ngOnInit(): void {
    // Verificar si ya está autenticado
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/admin']);
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  // Seleccionar credenciales de prueba
  selectTestAccount(account: { email: string; password: string }): void {
    this.loginForm.patchValue({
      email: account.email,
      password: account.password
    });
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    // Limpiar estados
    this.isLoading = true;
    this.successMessage = null;
    this.errorMessage = null;

    const email = this.loginForm.get('email')?.value;
    const password = this.loginForm.get('password')?.value;

    // Llamar al servicio de autenticación
    this.authService.login({ email, password }).subscribe({
      next: (result) => {
        console.log('Login result:', result);
        this.isLoading = false;
        
        if (result.success) {
          this.successMessage = 'Inicio de sesión exitoso';
          // Redirigir al admin dashboard
          console.log('Redirecting to /admin/...');
          this.router.navigate(['/admin/']).then(success => {
            console.log('Navigation success:', success);
          }).catch(err => {
            console.error('Navigation error:', err);
          });
        } else {
          this.errorMessage = result.message || 'Error al iniciar sesión';
        }
      },
      error: (err) => {
        console.error('Login error:', err);
        this.isLoading = false;
        this.errorMessage = 'Error de conexión. Intenta de nuevo.';
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
