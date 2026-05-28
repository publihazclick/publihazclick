import { Injectable } from '@angular/core';
import { getSupabaseClient } from '../../core/supabase.client';

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
      const sb = getSupabaseClient();
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
      const sb = getSupabaseClient();
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
      }

      return { ok: true, profile: data.profile ?? null };
    } catch (e: any) {
      return { ok: false, error: 'unknown', message: e?.message ?? 'Error desconocido' };
    }
  }

  /** Limpia el estado para reenviar OTP */
  reset(): void {
    this.pendingPhone = null;
  }

  private _mapMessage(msg: string): PhoneAuthError {
    if (msg.includes('Demasiados') || msg.includes('many')) return 'too-many-requests';
    if (msg.includes('incorrecto') || msg.includes('invalid-code')) return 'invalid-code';
    if (msg.includes('inválido') || msg.includes('invalid-phone')) return 'invalid-phone';
    return 'unknown';
  }
}
