import { Injectable } from '@angular/core';
import { getMoviClient } from './movi.client';

export type PhoneAuthError =
  | 'too-many-requests'
  | 'invalid-code'
  | 'invalid-phone'
  | 'out-of-country'
  | 'unknown';

export interface PhoneAuthResult {
  ok: boolean;
  error?: PhoneAuthError;
  message?: string;
  profile?: any;
}

/** Un solo texto, para que la app y ag-otp-send digan exactamente lo mismo. */
export const FUERA_DE_COBERTURA =
  'Por ahora Movi solo opera en Colombia 🇨🇴 Escribe un celular colombiano de 10 dígitos que empiece por 3.';

@Injectable({ providedIn: 'root' })
export class AgPhoneAuthService {
  private pendingPhone: string | null = null;

  /** No-op: mantenido por compatibilidad con el componente */
  setupRecaptcha(_containerId: string): void {}

  /** Envía OTP al número dado. Formato: +57XXXXXXXXXX o 10 dígitos */
  async sendOTP(phone: string): Promise<PhoneAuthResult> {
    // Cobertura (2026-09-10): la app arma el telefono como '+57' + lo que la persona escriba,
    // sin selector de pais, asi que un numero extranjero se convierte en un colombiano que no
    // existe y la persona queda dando vueltas sin entender por que nunca le llega el codigo
    // (13 casos reales entre el 2026-08-04 y el 2026-09-10, ninguno completo el registro).
    // Se corta aca para que el aviso sea instantaneo; ag-otp-send lo vuelve a validar del lado
    // del servidor y ESA es la fuente de verdad. La regla vive en los dos sitios a proposito:
    // si se cambia una, hay que cambiar la otra.
    if (!AgPhoneAuthService.esCelularColombiano(phone)) {
      return { ok: false, error: 'out-of-country', message: FUERA_DE_COBERTURA };
    }
    try {
      this.pendingPhone = phone;
      const sb = getMoviClient();
      const { data, error } = await sb.functions.invoke('ag-otp-send', {
        body: { phone },
      });

      if (error || data?.error) {
        const msg: string = data?.error ?? error?.message ?? 'Error enviando SMS';
        // El servidor tambien marca el caso, por si una app vieja quedara sin el chequeo local.
        if (data?.fuera_de_cobertura) return { ok: false, error: 'out-of-country', message: msg };
        return { ok: false, error: this._mapMessage(msg), message: msg };
      }

      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: 'unknown', message: e?.message ?? 'Error desconocido' };
    }
  }

  /** Verifica el código de 6 dígitos recibido por SMS */
  async verifyOTP(
    code: string,
    opts?: { name?: string; role?: string; referredBy?: string }
  ): Promise<PhoneAuthResult & { uid?: string }> {
    if (!this.pendingPhone) {
      return { ok: false, error: 'unknown', message: 'Primero envía el OTP' };
    }
    try {
      const sb = getMoviClient();
      const { data, error } = await sb.functions.invoke('ag-otp-verify', {
        body: {
          phone: this.pendingPhone,
          code,
          name: opts?.name,
          role: opts?.role,
          referred_by: opts?.referredBy ?? null,
        },
      });

      if (error || data?.error || !data?.ok) {
        const msg: string = data?.error ?? error?.message ?? 'Código incorrecto';
        return { ok: false, error: this._mapMessage(msg), message: msg };
      }

      // Si la función devolvió tokens, establecer sesión Supabase
      if (data.access_token && data.refresh_token) {
        await sb.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        // Guardar teléfono para re-auth silenciosa si la sesión expira
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('movi-ag-phone', this.pendingPhone!);
        }
      }

      return { ok: true, profile: data.profile ?? null };
    } catch (e: any) {
      return { ok: false, error: 'unknown', message: e?.message ?? 'Error desconocido' };
    }
  }

  /**
   * Intenta restaurar la sesión silenciosamente usando el teléfono guardado en localStorage.
   * No requiere SMS. Solo funciona si el usuario ya se registró antes.
   * Retorna el perfil si tuvo éxito, null si el usuario debe hacer OTP de nuevo.
   */
  async tryReAuth(): Promise<{ profile: any; role: string } | null> {
    if (typeof localStorage === 'undefined') return null;
    const phone = localStorage.getItem('movi-ag-phone');
    if (!phone) return null;

    try {
      const sb = getMoviClient();
      // Timeout defensivo (mismo bug del 2026-08-12 que currentUserId() en anda-gana.service.ts):
      // functions.invoke() no tiene límite de tiempo propio -- si se queda colgado, esta llamada
      // nunca resuelve ni rechaza, y como tryReAuth() se llama desde ngOnInit antes de decidir
      // qué pantalla mostrar, dejaba al usuario congelado en el splash para siempre.
      const { data, error } = await Promise.race([
        sb.functions.invoke('ag-reauth', { body: { phone } }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);

      if (error || !data?.ok) return null;
      if (!data.access_token || !data.refresh_token) return null;

      await sb.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      return { profile: data.profile, role: data.profile?.role ?? 'passenger' };
    } catch {
      return null;
    }
  }

  /** Limpia el estado para reenviar OTP */
  reset(): void {
    this.pendingPhone = null;
  }

  /** Cierra sesión y borra teléfono guardado */
  async signOut(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('movi-ag-phone');
    }
    await getMoviClient().auth.signOut();
  }

  /**
   * Misma regla que esCelularColombiano() en supabase/functions/ag-otp-send/index.ts: '+57'
   * seguido de 10 digitos que empiecen por 3. Acepta '+57XXXXXXXXXX' y tambien los 10 digitos
   * sueltos que manda el formulario de conductor.
   *
   * Es floja a proposito (NO valida el prefijo del operador): las listas publicadas de prefijos
   * colombianos estan desactualizadas -- omiten 319 y 324, que si estan en uso por conductores
   * reales de esta base -- y bloquear a un colombiano legitimo es mucho peor que dejar pasar a
   * un extranjero. Los extranjeros de 10 digitos que empiezan por 3 los atrapa ag-whatsapp.
   */
  static esCelularColombiano(phone: string): boolean {
    const digits = String(phone ?? '').replace(/[^0-9]/g, '');
    const nacional = digits.length === 12 && digits.startsWith('57') ? digits.slice(2) : digits;
    return nacional.length === 10 && nacional.startsWith('3');
  }

  private _mapMessage(msg: string): PhoneAuthError {
    if (msg.includes('Demasiados') || msg.includes('many')) return 'too-many-requests';
    if (msg.includes('incorrecto') || msg.includes('invalid-code')) return 'invalid-code';
    if (msg.includes('inválido') || msg.includes('invalid-phone')) return 'invalid-phone';
    return 'unknown';
  }
}
