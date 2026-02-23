import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { CountriesService } from '../../../../core/services/countries.service';
import { AuthAdsComponent } from '../auth-ads/auth-ads.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, AuthAdsComponent],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly countriesService = inject(CountriesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Signals para estado reactivo
  readonly isLoading = this.authService.isLoading;
  readonly error = this.authService.error;

  // Countries and locations
  readonly countries = this.countriesService.getCountriesWithPhoneCodes();
  readonly selectedCountryCode = signal<string>('+57');
  readonly departmentsList = computed(() => this.countriesService.getDepartments(this.selectedCountryCode()));
  readonly availableCities = computed(() => this.countriesService.getCities(this.registerForm.get('department')?.value || ''));

  // Código de referido de la URL
  referralCode = '';
  referralValid = signal<boolean | null>(null);
  referrerName = signal<string>('');
  referralError = signal<string>('');

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
    acceptTerms: [false, [Validators.requiredTrue]],
    countryCode: ['+57'],
    department: [''],
    city: ['']
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
    // Obtener código de referido de la URL (puede venir como parámetro de ruta o query param)
    this.referralCode = this.route.snapshot.params['code'] ||
                       this.route.snapshot.queryParams['ref'] || '';

    // El código de referido es OBLIGATORIO - sin él no se puede registrar
    if (!this.referralCode) {
      this.referralValid.set(false);
      this.referralError.set('Se requiere un código de referido válido para registrarse. Solicita un enlace de referido a un usuario existente.');
    } else {
      // Validar el código de referido
      this.validateReferralCode();
    }

    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';

    if (this.authService.isAuthenticated()) {
      this.router.navigate([this.returnUrl]);
    }

    // Cargar departamentos de Colombia por defecto
    this.loadDepartments();
  }

  // Cargar departamentos del país seleccionado
  private loadDepartments(): void {
    this.countriesService.getStatesAndCitiesByCountry('Colombia').subscribe();
  }

  async validateReferralCode(): Promise<void> {
    if (!this.referralCode) {
      this.referralValid.set(false);
      this.referralError.set('Se requiere código de referido');
      return;
    }

    const result = await this.profileService.validateReferralCode(this.referralCode);
    
    if (result.valid) {
      this.referralValid.set(true);
      this.referrerName.set(result.referrer_username || '');
      this.referralError.set('');
    } else {
      this.referralValid.set(false);
      this.referralError.set(result.error || 'Código de referido inválido');
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

  // Handle country code change
  onCountryCodeChange(code: string): void {
    this.selectedCountryCode.set(code);
    this.registerForm.patchValue({ department: '', city: '' });
  }

  // Handle department change - clear city
  onDepartmentChange(): void {
    this.registerForm.patchValue({ city: '' });
  }

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    // El código de referido es OBLIGATORIO
    if (!this.referralCode) {
      this.referralValid.set(false);
      this.referralError.set('Se requiere un código de referido válido para registrarse');
      return;
    }

    // Verificar que el código de referido sea válido
    if (!this.referralValid()) {
      this.validateReferralCode();
      return;
    }

    this.successMessage.set(null);
    const { fullName, email, password, countryCode, department, city } = this.registerForm.value;

    // Get country name from code
    const countryObj = this.countries.find(c => c.code === countryCode);
    const countryName = countryObj ? countryObj.name : '';

    // Usar el método de registro con referido obligatorio y datos de ubicación
    this.authService.registerWithReferral(
      { 
        email, 
        password, 
        fullName,
        country: countryName,
        country_code: countryCode,
        department: department || null,
        city: city || null
      },
      this.referralCode
    ).subscribe({
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
