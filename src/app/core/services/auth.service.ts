import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import {
  SupabaseClient,
  User,
  Session,
  AuthChangeEvent,
  AuthError
} from '@supabase/supabase-js';
import { BehaviorSubject, Observable, Subject, from, of } from 'rxjs';
import { map, catchError, takeUntil, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { getSupabaseClient } from '../supabase.client';
import { LoggerService } from './logger.service';

/**
 * Interfaz para las opciones de login
 */
export interface LoginOptions {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Interfaz para las opciones de registro
 */
export interface RegisterOptions {
  email: string;
  password: string;
  fullName?: string;
  username?: string;
  phone?: string | null;
  country?: string;
  country_code?: string;
  department?: string | null;
  city?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Interfaz para las opciones de recuperación de contraseña
 */
export interface ResetPasswordOptions {
  email: string;
}

/**
 * Interfaz para las opciones de actualización de contraseña
 */
export interface UpdatePasswordOptions {
  password: string;
}

/**
 * Interfaz para el resultado de autenticación
 */
export interface AuthResult {
  success: boolean;
  data?: User | Session | null;
  error?: AuthError | null;
  message?: string;
}

/**
 * Interfaz para el estado de autenticación
 */
export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  session: Session | null;
  error: string | null;
}

/**
 * Servicio de autenticación robusto para Supabase
 * Proporciona métodos seguros para login, registro, logout y manejo de sesiones
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {
  private readonly supabase: SupabaseClient;
  private readonly router = inject(Router);
  private readonly logger = inject(LoggerService);
  private readonly destroy$ = new Subject<void>();

  // Signals de Angular para estado reactivo
  private readonly _user = signal<User | null>(null);
  private readonly _session = signal<Session | null>(null);
  private readonly _isLoading = signal<boolean>(true);
  private readonly _error = signal<string | null>(null);

  // Computed signals para acceso público
  readonly user = computed(() => this._user());
  readonly session = computed(() => this._session());
  readonly isLoading = computed(() => this._isLoading());
  readonly isAuthenticated = computed(() => !!this._session());
  readonly error = computed(() => this._error());

  // BehaviorSubject para estado reactivo tradicional
  private readonly authState$ = new BehaviorSubject<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    session: null,
    error: null
  });

  /**
   * Observable público del estado de autenticación
   */
  readonly authStateObservable$: Observable<AuthState> = this.authState$.asObservable();

  constructor() {
    // Usar cliente compartido de Supabase para evitar múltiples instancias
    this.supabase = getSupabaseClient();

    // Inicializar侦听 de autenticación
    this.initializeAuthListener();
  }

  /**
   * Inicializa el侦听 de cambios de autenticación
   */
  private initializeAuthListener(): void {
    // Verificar sesión actual al iniciar
    this.supabase.auth.getSession().then(({ data: { session }, error }) => {
      // Primero marcar como no cargado
      this._isLoading.set(false);
      
      if (error) {
        this.logger.error('Error al obtener sesion');
        this.handleAuthError(error);
      } else {
        this.handleSessionChange(session);
      }
    });

    // Escuchar cambios de autenticación
    this.supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        this.handleAuthEvent(event, session);
      }
    );
  }

  /**
   * Maneja los eventos de autenticación
   */
  private handleAuthEvent(event: AuthChangeEvent, session: Session | null): void {
    switch (event) {
      case 'SIGNED_IN':
        this.handleSessionChange(session);
        break;
      case 'SIGNED_OUT':
        this.handleSignOut();
        break;
      case 'TOKEN_REFRESHED':
        if (session) {
          this.handleSessionChange(session);
        }
        break;
      case 'USER_UPDATED':
        if (session?.user) {
          this._user.set(session.user);
          this.updateAuthState();
        }
        break;
    }
  }

  /**
   * Maneja el cambio de sesión
   */
  private handleSessionChange(session: Session | null): void {
    this._session.set(session);
    this._user.set(session?.user ?? null);
    this._error.set(null);
    this.updateAuthState();
  }

  /**
   * Maneja el cierre de sesión
   */
  private handleSignOut(): void {
    this._session.set(null);
    this._user.set(null);
    this._error.set(null);
    this.updateAuthState();
  }

  /**
   * Maneja errores de autenticación
   */
  private handleAuthError(error: AuthError): void {
    const errorMessage = this.parseErrorMessage(error);
    this._error.set(errorMessage);
    this.updateAuthState();
  }

  /**
   * Actualiza el estado de autenticación
   */
  private updateAuthState(): void {
    const state: AuthState = {
      isAuthenticated: this.isAuthenticated(),
      isLoading: this._isLoading(),
      user: this._user(),
      session: this._session(),
      error: this._error()
    };
    this.authState$.next(state);
  }

  /**
   * Parsea mensajes de error de Supabase
   */
  private parseErrorMessage(error: AuthError): string {
    // Mapeo de errores comunes a mensajes más amigables
    const errorMessages: Record<string, string> = {
      'Invalid login credentials': 'Credenciales de inicio de sesión inválidas',
      'Email not confirmed': 'Correo electrónico no confirmado',
      'User already registered': 'Ya existe una cuenta con este correo electrónico',
      'already registered': 'Ya existe una cuenta con este correo electrónico',
      'already exists': 'Ya existe una cuenta con este correo electrónico',
      'Password does not meet requirements': 'La contraseña no cumple los requisitos mínimos',
      'Invalid email': 'Correo electrónico inválido',
      'Network error': 'Error de conexión. Verifica tu conexión a internet',
      'Too many requests': 'Demasiados intentos. Por favor, espera unos minutos',
      'email rate limit exceeded': 'Límite de registros excedido. Intenta de nuevo en unos minutos',
      'Invalid password': 'Contraseña incorrecta',
      'User not found': 'Usuario no encontrado',
      'Código de referido inválido': 'Código de referido inválido o no encontrado',
    };

    return errorMessages[error.message] || error.message;
  }

  /**
   * Inicia sesión con email y contraseña
   * @param options - Opciones de login
   * @returns Observable con el resultado
   */
  login(options: LoginOptions): Observable<AuthResult> {
    this._isLoading.set(true);
    this._error.set(null);

    // Usar un Observable que siempre completa
    return new Observable<AuthResult>(observer => {
      this.supabase.auth.signInWithPassword({
        email: options.email,
        password: options.password
      }).then(({ data, error }) => {
        if (error) {
          this.handleAuthError(error);
          this._isLoading.set(false);
          observer.next({
            success: false,
            data: null,
            error,
            message: this.parseErrorMessage(error)
          });
        } else {
          // Guardar sesión y usuario
          if (data.session) {
            this.handleSessionChange(data.session);
          } else if (data.user) {
            // Si no hay sesión pero hay usuario, guardar el usuario directamente
            this._user.set(data.user);
            this._session.set(null);
            this._error.set(null);
            this.updateAuthState();
          }
          this._isLoading.set(false);
          observer.next({
            success: true,
            data: data.user,
            message: 'Inicio de sesión exitoso'
          });
        }
        observer.complete();
      }).catch((error: AuthError) => {
        this.logger.error('Error en login');
        this.handleAuthError(error);
        this._isLoading.set(false);
        observer.next({
          success: false,
          data: null,
          error,
          message: this.parseErrorMessage(error)
        });
        observer.complete();
      });
    });
  }

  /**
   * Registra un nuevo usuario
   * @param options - Opciones de registro
   * @returns Observable con el resultado
   */
  register(options: RegisterOptions): Observable<AuthResult> {
    this._isLoading.set(true);
    this._error.set(null);

    return from(
      this.supabase.auth.signUp({
        email: options.email,
        password: options.password,
        options: {
          data: {
            full_name: options.fullName,
            ...options.metadata
          },
          emailRedirectTo: window.location.origin + '/auth/callback'
        }
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          this.handleAuthError(error);
          return {
            success: false,
            data: null,
            error,
            message: this.parseErrorMessage(error)
          };
        }

        // Si el usuario se creó inmediatamente (sin confirmación de email)
        if (data.user && data.session) {
          this.handleSessionChange(data.session);
          return {
            success: true,
            data: data.user,
            message: 'Registro exitoso'
          };
        }

        // Si requiere confirmación de email
        return {
          success: true,
          data: data.user,
          message: 'Te hemos enviado un correo de confirmación. Por favor, verifica tu bandeja de entrada.'
        };
      }),
      catchError((error: AuthError) => {
        this.handleAuthError(error);
        return of({
          success: false,
          data: null,
          error,
          message: this.parseErrorMessage(error)
        });
      }),
      tap(() => this._isLoading.set(false)),
      takeUntil(this.destroy$)
    );
  }

  /**
   * Registra un nuevo usuario con código de referido.
   * Usa una Edge Function con Admin API para evitar rate limits del endpoint /signup.
   * El trigger handle_new_user crea el perfil automáticamente.
   * Tras la creación, hace signInWithPassword para obtener la sesión.
   */
  registerWithReferral(options: RegisterOptions, referralCode: string): Observable<AuthResult> {
    this._isLoading.set(true);
    this._error.set(null);

    return from(
      this.supabase.functions
        .invoke('register-with-referral', {
          body: {
            email: options.email,
            password: options.password,
            username: options.username,
            full_name: options.fullName,
            referral_code: referralCode,
            phone: options.phone || null,
            country: options.country || null,
            country_code: options.country_code || null,
            department: options.department || null,
            city: options.city || null,
          },
        })
        .then(async ({ data, error }) => {
          // Error de red / función
          if (error) throw error;
          // Error devuelto por la función
          if (data?.error) throw new Error(data.error);

          // Usuario creado → iniciar sesión para obtener sesión activa
          const { data: signInData, error: signInError } = await this.supabase.auth.signInWithPassword({
            email: options.email,
            password: options.password,
          });

          if (signInError) throw signInError;

          if (signInData.session) {
            this.handleSessionChange(signInData.session);
          }

          return { data: signInData, error: null };
        })
    ).pipe(
      map(({ data }) => ({
        success: true,
        data: data?.user ?? null,
        message: '¡Registro exitoso! Bienvenido a Publihazclick',
      } as AuthResult)),
      catchError((err: unknown) => {
        const authErr = err as AuthError;
        this.handleAuthError(authErr);
        return of({
          success: false,
          data: null,
          error: authErr,
          message: this.parseErrorMessage(authErr),
        } as AuthResult);
      }),
      tap(() => this._isLoading.set(false)),
      takeUntil(this.destroy$)
    );
  }

  /**
   * Cierra la sesión del usuario
   * @returns Observable con el resultado
   */
  logout(): Observable<AuthResult> {
    this._isLoading.set(true);

    return from(this.supabase.auth.signOut()).pipe(
      map(({ error }) => {
        if (error) {
          return {
            success: false,
            data: null,
            error: error,
            message: 'Error al cerrar sesión'
          };
        }

        this.handleSignOut();

        // Redirigir después del logout
        if (environment.redirect?.logoutSuccess) {
          this.router.navigate([environment.redirect.logoutSuccess]);
        }

        return {
          success: true,
          data: null,
          message: 'Sesión cerrada correctamente'
        };
      }),
      catchError((error: any) => {
        return of({
          success: false,
          data: null,
          error,
          message: 'Error al cerrar sesión'
        });
      }),
      tap(() => this._isLoading.set(false)),
      takeUntil(this.destroy$)
    );
  }

  /**
   * Envía un correo para restablecer la contraseña
   * @param options - Opciones de recuperación
   * @returns Observable con el resultado
   */
  resetPassword(options: ResetPasswordOptions): Observable<AuthResult> {
    this._isLoading.set(true);
    this._error.set(null);

    return from(
      this.supabase.auth.resetPasswordForEmail(options.email, {
        redirectTo: window.location.origin + '/auth/update-password'
      })
    ).pipe(
      map(({ error }) => {
        if (error) {
          this.handleAuthError(error);
          return {
            success: false,
            data: null,
            error,
            message: this.parseErrorMessage(error)
          };
        }

        return {
          success: true,
          data: null,
          message: 'Se ha enviado un correo para restablecer tu contraseña'
        };
      }),
      catchError((error: AuthError) => {
        this.handleAuthError(error);
        return of({
          success: false,
          data: null,
          error,
          message: this.parseErrorMessage(error)
        });
      }),
      tap(() => this._isLoading.set(false)),
      takeUntil(this.destroy$)
    );
  }

  /**
   * Actualiza la contraseña del usuario
   * @param options - Opciones de actualización
   * @returns Observable con el resultado
   */
  updatePassword(options: UpdatePasswordOptions): Observable<AuthResult> {
    this._isLoading.set(true);
    this._error.set(null);

    return from(
      this.supabase.auth.updateUser({
        password: options.password
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          this.handleAuthError(error);
          return {
            success: false,
            data: null,
            error,
            message: this.parseErrorMessage(error)
          };
        }

        return {
          success: true,
          data: data.user,
          message: 'Contraseña actualizada correctamente'
        };
      }),
      catchError((error: AuthError) => {
        this.handleAuthError(error);
        return of({
          success: false,
          data: null,
          error,
          message: this.parseErrorMessage(error)
        });
      }),
      tap(() => this._isLoading.set(false)),
      takeUntil(this.destroy$)
    );
  }

  /**
   * Actualiza los datos del perfil del usuario
   * @param metadata - Metadatos a actualizar
   * @returns Observable con el resultado
   */
  updateProfile(metadata: Record<string, any>): Observable<AuthResult> {
    this._isLoading.set(true);
    this._error.set(null);

    return from(
      this.supabase.auth.updateUser({
        data: metadata
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          this.handleAuthError(error);
          return {
            success: false,
            data: null,
            error,
            message: this.parseErrorMessage(error)
          };
        }

        this._user.set(data.user);
        this.updateAuthState();

        return {
          success: true,
          data: data.user,
          message: 'Perfil actualizado correctamente'
        };
      }),
      catchError((error: AuthError) => {
        this.handleAuthError(error);
        return of({
          success: false,
          data: null,
          error,
          message: this.parseErrorMessage(error)
        });
      }),
      tap(() => this._isLoading.set(false)),
      takeUntil(this.destroy$)
    );
  }

  /**
   * Obtiene el token de acceso actual
   * @returns Token de acceso o null
   */
  getAccessToken(): string | null {
    return this._session()?.access_token ?? null;
  }

  /**
   * Obtiene el token de actualización actual
   * @returns Token de actualización o null
   */
  getRefreshToken(): string | null {
    return this._session()?.refresh_token ?? null;
  }

  /**
   * Verifica si el usuario está autenticado
   * @returns true si está autenticado
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated();
  }

  /**
   * Obtiene el usuario actual
   * @returns Usuario actual o null
   */
  getCurrentUser(): User | null {
    return this._user();
  }

  /**
   * Obtiene la sesión actual
   * @returns Sesión actual o null
   */
  getCurrentSession(): Session | null {
    return this._session();
  }

  /**
   * Refresca la sesión actual
   * @returns Observable con el resultado
   */
  refreshSession(): Observable<AuthResult> {
    return from(this.supabase.auth.refreshSession()).pipe(
      map(({ data, error }) => {
        if (error) {
          return {
            success: false,
            data: null,
            error,
            message: this.parseErrorMessage(error)
          };
        }

        this.handleSessionChange(data.session);
        return {
          success: true,
          data: data.session,
          message: 'Sesión refrescada'
        };
      }),
      catchError((error: AuthError) => {
        return of({
          success: false,
          data: null,
          error,
          message: 'Error al refrescar sesión'
        });
      }),
      takeUntil(this.destroy$)
    );
  }

  /**
   * Obtiene el cliente de Supabase
   * @returns Instancia del cliente
   */
  getSupabaseClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Limpia el error actual
   */
  clearError(): void {
    this._error.set(null);
    this.updateAuthState();
  }

  /**
   * ngOnDestroy - Limpieza de recursos
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.authState$.complete();
  }
}
