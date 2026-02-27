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
  readonly allCountries = this.countriesService.getAllCountries();
  readonly selectedCountryCode = signal<string>('+57');
  readonly residenceCountryCode = signal<string>('+57');
  readonly residenceCountryName = signal<string>('Colombia');
  readonly countrySearch = signal<string>('Colombia');
  readonly showCountryDropdown = signal<boolean>(false);
  readonly filteredCountries = computed(() => {
    const q = this.countrySearch().toLowerCase().trim();
    if (!q) return this.allCountries;
    return this.allCountries.filter(c => c.name.toLowerCase().includes(q));
  });
  readonly departmentsList = computed(() => this.countriesService.getDepartments(this.residenceCountryCode()));
  readonly availableCities = computed(() => this.countriesService.getCities(this.registerForm.get('department')?.value || ''));

  // Código de referido de la URL o manual
  referralCode = '';
  referralValid = signal<boolean | null>(null);
  referrerName = signal<string>('');
  referralError = signal<string>('');
  manualReferralCode = signal<string>('');
  isValidatingReferral = signal(false);

  // Formulario reactivo
  registerForm: FormGroup = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^[a-zA-Z0-9_]+$/)]],
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    password: ['', [
      Validators.required, 
      Validators.minLength(8),
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    ]],
    confirmPassword: ['', [Validators.required]],
    acceptTerms: [false, [Validators.requiredTrue]],
    countryCode: ['+57'],
    residenceCountry: ['+57'],
    department: [''],
    city: ['']
  }, {
    validators: this.passwordMatchValidator
  });

  // Estado de la contraseña
  readonly showPassword = signal(false);

  // Mensaje de éxito / error local
  successMessage = signal<string | null>(null);
  localError = signal<string | null>(null);

  // Return URL
  returnUrl: string = '/dashboard';

  ngOnInit(): void {
    // Obtener código de referido de la URL (puede venir como parámetro de ruta o query param)
    this.referralCode = this.route.snapshot.params['code'] ||
                       this.route.snapshot.queryParams['ref'] || '';

    if (this.referralCode) {
      // Validar el código de referido que viene de la URL
      this.validateReferralCode();
    }
    // Si no hay código, el usuario puede ingresarlo manualmente

    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';

    if (this.authService.isAuthenticated()) {
      this.router.navigate([this.returnUrl]);
    }
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

  onManualReferralInput(value: string): void {
    this.manualReferralCode.set(value.trim());
    // Reset validation state when user types
    if (this.referralValid() === false) {
      this.referralValid.set(null);
      this.referralError.set('');
    }
  }

  async applyManualReferralCode(): Promise<void> {
    const code = this.manualReferralCode();
    if (!code) return;

    this.isValidatingReferral.set(true);
    this.referralCode = code;
    await this.validateReferralCode();
    this.isValidatingReferral.set(false);
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

  // Handle phone country code change
  onCountryCodeChange(code: string): void {
    this.selectedCountryCode.set(code);
  }

  // Handle residence country change — resets department and city
  onResidenceCountryChange(code: string): void {
    this.residenceCountryCode.set(code);
    this.registerForm.patchValue({ department: '', city: '' });
  }

  onCountrySearchInput(value: string): void {
    this.countrySearch.set(value);
    this.showCountryDropdown.set(true);
  }

  selectResidenceCountry(country: { code: string; name: string }): void {
    this.residenceCountryCode.set(country.code);
    this.residenceCountryName.set(country.name);
    this.countrySearch.set(country.name);
    this.registerForm.patchValue({ residenceCountry: country.code, department: '', city: '' });
    this.showCountryDropdown.set(false);
  }

  closeCountryDropdown(): void {
    // Restaura el texto al país seleccionado si se cerró sin elegir
    this.countrySearch.set(this.residenceCountryName());
    this.showCountryDropdown.set(false);
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
    this.localError.set(null);
    const { username, fullName, email, phone, password, countryCode, department, city } = this.registerForm.value;

    const countryName = this.residenceCountryName();
    const residenceCode = this.residenceCountryCode();

    // Combinar código de país con número de teléfono
    const fullPhone = phone ? `${countryCode}${phone}` : null;

    // Usar el método de registro con referido obligatorio y datos de ubicación
    this.authService.registerWithReferral(
      {
        email,
        password,
        fullName,
        username: username,
        phone: fullPhone,
        country: countryName,
        country_code: residenceCode,
        department: department || null,
        city: city || null
      },
      this.referralCode
    ).subscribe({
      next: (result) => {
        if (result.success) {
          this.successMessage.set(result.message || 'Registro exitoso');
          this.localError.set(null);
          // Navegar solo si hay sesión activa (sin confirmación de email)
          if (this.authService.isAuthenticated()) {
            setTimeout(() => {
              this.router.navigate([this.returnUrl]);
            }, 1500);
          }
          // Si requiere confirmación: el mensaje de "revisa tu correo" queda visible
        } else {
          this.localError.set(result.message || 'Error al crear la cuenta. Intenta de nuevo.');
        }
      },
      error: () => {
        this.localError.set('Error de conexion. Verifica tu internet e intenta de nuevo.');
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
    if (field === 'username' && control.errors['pattern']) {
      return 'Solo letras, números y guiones bajos';
    }
    if (control.errors['email']) {
      return 'Ingrese un correo electrónico válido';
    }
    if (control.errors['minlength']) {
      const minLength = control.errors['minlength'].requiredLength;
      return `Este campo debe tener al menos ${minLength} caracteres`;
    }
    if (field === 'password' && control.errors['pattern']) {
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
