import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

type AuthMode = 'login' | 'register';

const XZOOM_INVITE_STORAGE_KEY = 'xzoom_invite_intent';

interface XzoomInviteIntent {
  type: 'host' | 'participant';
  code: string;
  savedAt: number;
}

@Component({
  selector: 'app-xzoom-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="xzoom-auth">
      <div class="auth-bg"></div>

      <nav class="top-nav">
        <a routerLink="/xzoom" class="brand">
          <span class="material-symbols-outlined">live_tv</span>
          <span class="brand-text">XZOOM <em>EN VIVO</em></span>
        </a>
        <a routerLink="/xzoom" class="back-link">
          <span class="material-symbols-outlined">arrow_back</span>
          Volver
        </a>
      </nav>

      <div class="auth-card">
        @if (inviteBanner()) {
          <div class="invite-banner">
            <span class="material-symbols-outlined">mail</span>
            <p>{{ inviteBanner() }}</p>
          </div>
        }

        <div class="mode-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="mode() === 'login'"
            [class.active]="mode() === 'login'"
            (click)="switchMode('login')">
            Iniciar sesión
          </button>
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="mode() === 'register'"
            [class.active]="mode() === 'register'"
            (click)="switchMode('register')">
            Crear cuenta
          </button>
        </div>

        <div class="auth-head">
          <h1>
            @if (mode() === 'login') {
              Bienvenido de nuevo
            } @else {
              Crea tu cuenta XZOOM
            }
          </h1>
          <p>
            @if (mode() === 'login') {
              Ingresa con tu correo o usuario para continuar.
            } @else {
              En menos de 30 segundos estarás dentro.
            }
          </p>
        </div>

        <!-- LOGIN FORM -->
        @if (mode() === 'login') {
          <form [formGroup]="loginForm" (ngSubmit)="onLogin()" class="auth-form">
            <label class="field">
              <span class="label">Correo electrónico o usuario</span>
              <div class="input-wrap">
                <span class="material-symbols-outlined">mail</span>
                <input
                  type="text"
                  formControlName="email"
                  placeholder="tucorreo@ejemplo.com"
                  autocomplete="username" />
              </div>
            </label>
            <label class="field">
              <span class="label">Contraseña</span>
              <div class="input-wrap">
                <span class="material-symbols-outlined">lock</span>
                <input
                  [type]="showPassword() ? 'text' : 'password'"
                  formControlName="password"
                  placeholder="••••••••"
                  autocomplete="current-password" />
                <button type="button" class="eye" (click)="showPassword.set(!showPassword())">
                  <span class="material-symbols-outlined">
                    {{ showPassword() ? 'visibility_off' : 'visibility' }}
                  </span>
                </button>
              </div>
            </label>

            @if (errorMsg()) {
              <div class="error-box">
                <span class="material-symbols-outlined">error</span>
                {{ errorMsg() }}
              </div>
            }

            <button type="submit" class="btn-primary" [disabled]="isLoading() || loginForm.invalid">
              @if (isLoading()) {
                Ingresando…
              } @else {
                Iniciar sesión
                <span class="material-symbols-outlined">login</span>
              }
            </button>
          </form>
        }

        <!-- REGISTER FORM -->
        @if (mode() === 'register') {
          <form [formGroup]="registerForm" (ngSubmit)="onRegister()" class="auth-form">
            <label class="field">
              <span class="label">Nombre completo</span>
              <div class="input-wrap">
                <span class="material-symbols-outlined">person</span>
                <input
                  type="text"
                  formControlName="fullName"
                  placeholder="María Pérez"
                  autocomplete="name" />
              </div>
            </label>

            <label class="field">
              <span class="label">Usuario</span>
              <div class="input-wrap">
                <span class="material-symbols-outlined">alternate_email</span>
                <input
                  type="text"
                  formControlName="username"
                  placeholder="mariap"
                  autocomplete="username" />
              </div>
              <small class="hint">Solo letras, números y guion bajo.</small>
            </label>

            <label class="field">
              <span class="label">Correo electrónico</span>
              <div class="input-wrap">
                <span class="material-symbols-outlined">mail</span>
                <input
                  type="email"
                  formControlName="email"
                  placeholder="tucorreo@ejemplo.com"
                  autocomplete="email" />
              </div>
            </label>

            <label class="field">
              <span class="label">Teléfono <small>(opcional)</small></span>
              <div class="input-wrap">
                <span class="material-symbols-outlined">call</span>
                <input
                  type="tel"
                  formControlName="phone"
                  placeholder="+57 300 000 0000"
                  autocomplete="tel" />
              </div>
            </label>

            <label class="field">
              <span class="label">Contraseña</span>
              <div class="input-wrap">
                <span class="material-symbols-outlined">lock</span>
                <input
                  [type]="showPassword() ? 'text' : 'password'"
                  formControlName="password"
                  placeholder="Mínimo 8 caracteres"
                  autocomplete="new-password" />
                <button type="button" class="eye" (click)="showPassword.set(!showPassword())">
                  <span class="material-symbols-outlined">
                    {{ showPassword() ? 'visibility_off' : 'visibility' }}
                  </span>
                </button>
              </div>
              <small class="hint">Al menos 8 caracteres, con mayúscula, minúscula y número.</small>
            </label>

            <label class="checkbox">
              <input type="checkbox" formControlName="acceptTerms" />
              <span>
                Acepto los
                <a routerLink="/terminos" target="_blank">términos</a>
                y la
                <a routerLink="/privacy" target="_blank">política de privacidad</a>.
              </span>
            </label>

            @if (errorMsg()) {
              <div class="error-box">
                <span class="material-symbols-outlined">error</span>
                {{ errorMsg() }}
              </div>
            }
            @if (successMsg()) {
              <div class="success-box">
                <span class="material-symbols-outlined">check_circle</span>
                {{ successMsg() }}
              </div>
            }

            <button type="submit" class="btn-primary" [disabled]="isLoading() || registerForm.invalid">
              @if (isLoading()) {
                Creando cuenta…
              } @else {
                Crear cuenta
                <span class="material-symbols-outlined">arrow_forward</span>
              }
            </button>
          </form>
        }

        <p class="switch-mode">
          @if (mode() === 'login') {
            ¿Todavía no tienes cuenta?
            <button type="button" (click)="switchMode('register')">Regístrate</button>
          } @else {
            ¿Ya tienes cuenta?
            <button type="button" (click)="switchMode('login')">Inicia sesión</button>
          }
        </p>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      background: #050505;
      color: #fff;
      min-height: 100vh;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .xzoom-auth {
      position: relative;
      min-height: 100vh;
      padding: 24px 20px 60px;
    }
    .auth-bg {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 20% 0%, rgba(255,59,48,0.28), transparent 55%),
        radial-gradient(circle at 80% 80%, rgba(255,107,107,0.18), transparent 60%),
        #050505;
      z-index: 0;
    }
    .top-nav {
      position: relative;
      z-index: 2;
      max-width: 1080px;
      margin: 0 auto 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 900;
      letter-spacing: 1px;
      text-decoration: none;
      color: #fff;
    }
    .brand .material-symbols-outlined {
      font-size: 28px;
      color: #ff3b30;
      filter: drop-shadow(0 0 12px rgba(255,59,48,0.6));
    }
    .brand-text em {
      font-style: normal;
      background: linear-gradient(90deg, #ff3b30, #ff6b6b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #a1a1aa;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }
    .back-link:hover { color: #ff6b6b; }
    .back-link .material-symbols-outlined { font-size: 18px; }

    .auth-card {
      position: relative;
      z-index: 2;
      max-width: 460px;
      margin: 0 auto;
      padding: 36px 32px 32px;
      background: linear-gradient(180deg, rgba(20,20,20,0.9), rgba(10,10,10,0.95));
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px;
      backdrop-filter: blur(20px);
      box-shadow: 0 40px 100px -20px rgba(0,0,0,0.8),
                  0 0 0 1px rgba(255,59,48,0.08);
    }

    .invite-banner {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      margin-bottom: 24px;
      background: linear-gradient(90deg, rgba(255,59,48,0.18), rgba(255,107,107,0.08));
      border: 1px solid rgba(255,59,48,0.35);
      border-radius: 14px;
    }
    .invite-banner .material-symbols-outlined {
      color: #ff6b6b;
      font-size: 22px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .invite-banner p {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: #fecaca;
    }

    .mode-tabs {
      display: flex;
      gap: 6px;
      padding: 5px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 100px;
      margin-bottom: 28px;
    }
    .mode-tabs button {
      flex: 1;
      padding: 11px 18px;
      background: transparent;
      border: none;
      color: #a1a1aa;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.3px;
      border-radius: 100px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .mode-tabs button.active {
      background: linear-gradient(135deg, #ff3b30, #ff6b6b);
      color: #fff;
      box-shadow: 0 8px 24px -8px rgba(255,59,48,0.6);
    }

    .auth-head { text-align: center; margin-bottom: 26px; }
    .auth-head h1 {
      font-family: 'Montserrat', 'Inter', sans-serif;
      font-size: 24px;
      font-weight: 900;
      margin: 0 0 6px;
      letter-spacing: -0.3px;
    }
    .auth-head p {
      color: #a1a1aa;
      font-size: 13px;
      margin: 0;
    }

    .auth-form { display: flex; flex-direction: column; gap: 16px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field .label {
      font-size: 12px;
      font-weight: 700;
      color: #d4d4d8;
      letter-spacing: 0.3px;
    }
    .field .label small { font-weight: 400; color: #71717a; }
    .field .hint { font-size: 11px; color: #71717a; }

    .input-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      transition: all 0.2s;
    }
    .input-wrap:focus-within {
      border-color: #ff3b30;
      background: rgba(255,59,48,0.05);
      box-shadow: 0 0 0 4px rgba(255,59,48,0.12);
    }
    .input-wrap .material-symbols-outlined {
      font-size: 19px;
      color: #71717a;
    }
    .input-wrap input {
      flex: 1;
      padding: 13px 0;
      background: transparent;
      border: none;
      outline: none;
      color: #fff;
      font-size: 14px;
      font-family: inherit;
    }
    .input-wrap input::placeholder { color: #52525b; }
    .eye {
      background: transparent;
      border: none;
      color: #71717a;
      cursor: pointer;
      display: flex;
      align-items: center;
      padding: 0;
    }
    .eye:hover { color: #ff6b6b; }

    .checkbox {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 12px;
      color: #a1a1aa;
      line-height: 1.5;
      cursor: pointer;
    }
    .checkbox input {
      margin-top: 2px;
      accent-color: #ff3b30;
      width: 14px;
      height: 14px;
    }
    .checkbox a { color: #ff6b6b; text-decoration: underline; }

    .error-box, .success-box {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.5;
    }
    .error-box {
      background: rgba(239,68,68,0.12);
      border: 1px solid rgba(239,68,68,0.35);
      color: #fecaca;
    }
    .error-box .material-symbols-outlined { color: #f87171; font-size: 18px; }
    .success-box {
      background: rgba(34,197,94,0.12);
      border: 1px solid rgba(34,197,94,0.35);
      color: #bbf7d0;
    }
    .success-box .material-symbols-outlined { color: #4ade80; font-size: 18px; }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px 22px;
      background: linear-gradient(135deg, #ff3b30, #ff6b6b);
      color: #fff;
      border: none;
      border-radius: 100px;
      font-weight: 800;
      font-size: 14px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      cursor: pointer;
      margin-top: 6px;
      box-shadow: 0 15px 40px -10px rgba(255,59,48,0.6);
      transition: all 0.2s;
    }
    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 20px 50px -10px rgba(255,59,48,0.8);
    }
    .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn-primary .material-symbols-outlined { font-size: 18px; }

    .switch-mode {
      text-align: center;
      margin: 24px 0 0;
      font-size: 13px;
      color: #71717a;
    }
    .switch-mode button {
      background: transparent;
      border: none;
      color: #ff6b6b;
      font-weight: 700;
      cursor: pointer;
      padding: 0;
      margin-left: 4px;
      font-size: 13px;
    }
    .switch-mode button:hover { text-decoration: underline; }

    /* ───────── Responsive ───────── */
    @media (max-width: 640px) {
      .xzoom-auth { padding: 16px 14px 48px; }
      .top-nav { margin-bottom: 26px; }
      .brand-text { font-size: 15px; }
      .brand .material-symbols-outlined { font-size: 24px; }
      .back-link { font-size: 12px; }
      .auth-card {
        padding: 26px 20px 24px;
        border-radius: 20px;
      }
      .invite-banner { padding: 12px 14px; margin-bottom: 20px; }
      .invite-banner p { font-size: 12px; }
      .mode-tabs { margin-bottom: 22px; }
      .mode-tabs button { padding: 10px 12px; font-size: 12px; }
      .auth-head { margin-bottom: 22px; }
      .auth-head h1 { font-size: 21px; }
      .auth-head p { font-size: 12px; }
      .auth-form { gap: 14px; }
      .input-wrap { padding: 0 12px; border-radius: 11px; }
      /* iOS evita hacer zoom al enfocar cuando font-size >= 16px */
      .input-wrap input { padding: 12px 0; font-size: 16px; }
      .input-wrap .material-symbols-outlined { font-size: 18px; }
      .field .label { font-size: 11px; }
      .checkbox { font-size: 11px; }
      .btn-primary { padding: 15px 20px; font-size: 13px; }
      .switch-mode { margin-top: 20px; font-size: 12px; }
      .switch-mode button { font-size: 12px; }
    }
    @media (max-width: 380px) {
      .auth-card { padding: 22px 16px; }
      .auth-head h1 { font-size: 19px; }
      .mode-tabs button { padding: 9px 8px; font-size: 11px; }
    }
  `],
})
export class XzoomAuthComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly mode = signal<AuthMode>('register');
  readonly isLoading = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly inviteBanner = signal<string | null>(null);

  private inviteIntent: XzoomInviteIntent | null = null;

  readonly loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  readonly registerForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    username: ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^[a-zA-Z0-9_]+$/)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    password: ['', [
      Validators.required,
      Validators.minLength(8),
      Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
    ]],
    acceptTerms: [false, [Validators.requiredTrue]],
  });

  ngOnInit(): void {
    // El flujo de invitación del anfitrión YA NO pasa por aquí: el link privado
    // lleva directo a /xzoom/h/:slug. El invite de participante solo informa al
    // usuario, NO crea relación de referido.
    const qp = this.route.snapshot.queryParams;
    const participantCode = (qp['invite_ref'] ?? '').toString().trim();

    if (participantCode) {
      this.inviteIntent = { type: 'participant', code: participantCode, savedAt: Date.now() };
      this.inviteBanner.set(
        'Fuiste invitado a descubrir XZOOM EN VIVO. Crea tu cuenta o inicia sesión para explorar a todos los anfitriones.',
      );
    }

    // Query param mode=login (enlace directo) cambia el tab
    const modeParam = (qp['mode'] ?? '').toString();
    if (modeParam === 'login') this.mode.set('login');
  }

  switchMode(next: AuthMode): void {
    this.mode.set(next);
    this.errorMsg.set(null);
    this.successMsg.set(null);
  }

  async onLogin(): Promise<void> {
    if (this.loginForm.invalid || this.isLoading()) return;
    this.errorMsg.set(null);
    this.isLoading.set(true);
    try {
      const { email, password } = this.loginForm.value;
      const result = await firstValueFrom(
        this.authService.login({ email, password, rememberMe: true }),
      );
      if (!result.success) {
        this.errorMsg.set(result.message ?? 'No pudimos iniciar sesión.');
        return;
      }
      this.redirectAfterAuth();
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error de conexión.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onRegister(): Promise<void> {
    if (this.registerForm.invalid || this.isLoading()) return;
    this.errorMsg.set(null);
    this.successMsg.set(null);
    this.isLoading.set(true);
    try {
      const { fullName, username, email, phone, password } = this.registerForm.value;
      // Los invites de participante ya NO crean relación de referido.
      // Solo pasamos el username al trigger.
      const metadata: Record<string, any> = { username };

      const result = await firstValueFrom(
        this.authService.register({
          email,
          password,
          fullName,
          username,
          phone: phone || null,
          metadata,
        }),
      );

      if (!result.success) {
        this.errorMsg.set(result.message ?? 'No pudimos crear la cuenta.');
        return;
      }

      // Si el registro requirió confirmación de email, no hay sesión todavía
      if (!this.authService.isAuthenticated()) {
        this.successMsg.set(
          result.message ?? 'Revisa tu correo para confirmar la cuenta.',
        );
        return;
      }

      this.redirectAfterAuth();
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error de conexión.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private redirectAfterAuth(): void {
    this.clearInvite();
    // Redirigir al panel XZOOM del anfitrión después de login/registro
    this.router.navigateByUrl('/dashboard/xzoom-en-vivo');
  }

  private clearInvite(): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.removeItem(XZOOM_INVITE_STORAGE_KEY);
    } catch {
      /* noop */
    }
  }
}
