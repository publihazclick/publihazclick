import { Injectable } from '@angular/core';
import { getMoviClient } from './movi.client';

export type PhoneAuthError =
  | 'too-many-requests'
  | 'invalid-code'
  | 'invalid-phone'
  | 'unknown';

export interface PhoneAuthResult {
  ok: boolean;
  error?: PhoneAuthError;
  message?: string;
  profile?: any;
}

@Injectable({ providedIn: 'root' })
export class AgPhoneAuthService {
  private pendingPhone: string | null = null;

  /** No-op: mantenido por compatibilidad con el componente */
  setupRecaptcha(_containerId: string): void {}

  /** Envía OTP al número dado. Formato: +57XXXXXXXXXX o 10 dígitos */
  async sendOTP(phone: string): Promise<PhoneAuthResult> {
    try {
      this.pendingPhone = phone;
      const sb = getMoviClient();
      const { data, error } = await sb.functions.invoke('ag-otp-send', {
        body: { phone },
      });

      if (error || data?.error) {
        const msg: string = data?.error ?? error?.message ?? 'Error enviando SMS';
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

  private _mapMessage(msg: string): PhoneAuthError {
    if (msg.includes('Demasiados') || msg.includes('many')) return 'too-many-requests';
    if (msg.includes('incorrecto') || msg.includes('invalid-code')) return 'invalid-code';
    if (msg.includes('inválido') || msg.includes('invalid-phone')) return 'invalid-phone';
    return 'unknown';
  }
}
