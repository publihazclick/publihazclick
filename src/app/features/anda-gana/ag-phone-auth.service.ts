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
  'Escribe tu celular de Colombia 🇨🇴 o Venezuela 🇻🇪 (ej: 300 123 4567 o 0414 123 4567).';

@Injectable({ providedIn: 'root' })
export class AgPhoneAuthService {
  private pendingPhone: string | null = null;

  /** No-op: mantenido por compatibilidad con el componente */
  setupRecaptcha(_containerId: string): void {}

  /** Envía OTP al número dado. Formato: +57XXXXXXXXXX o 10 dígitos */
  /**
   * canal 'whatsapp' (2026-10-01): el servidor deja listo el código pero NO manda SMS; la persona
   * lo pide por WhatsApp y el bot se lo entrega. 'sms' es el envío de siempre.
   */
  async sendOTP(phone: string, canal: 'whatsapp' | 'sms' = 'sms'): Promise<PhoneAuthResult> {
    // Cobertura (2026-09-10): la app arma el telefono como '+57' + lo que la persona escriba,
    // sin selector de pais, asi que un numero extranjero se convierte en un colombiano que no
    // existe y la persona queda dando vueltas sin entender por que nunca le llega el codigo
    // (13 casos reales entre el 2026-08-04 y el 2026-09-10, ninguno completo el registro).
    // Se corta aca para que el aviso sea instantaneo; ag-otp-send lo vuelve a validar del lado
    // del servidor y ESA es la fuente de verdad. La regla vive en los dos sitios a proposito:
    // si se cambia una, hay que cambiar la otra.
    // Desde 2026-10-03 también Venezuela, sin selector: el número se reconoce solo (ver
    // normalizarCelular). Lo que viaja al servidor y se guarda es siempre el E.164 limpio.
    const e164 = AgPhoneAuthService.normalizarCelular(phone);
    if (!e164) {
      return { ok: false, error: 'out-of-country', message: FUERA_DE_COBERTURA };
    }
    phone = e164;
    try {
      this.pendingPhone = phone;
      const sb = getMoviClient();
      const { data, error } = await sb.functions.invoke('ag-otp-send', {
        body: { phone, canal },
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

  /**
   * Celular de Colombia o Venezuela -> E.164 ('+573001234567' / '+584141234567'), o null.
   * Pedido del usuario 2026-10-03: aceptar números venezolanos (Cúcuta es frontera y el bot ya
   * acepta carros con placa venezolana) SIN selector de país -- se reconoce por cómo se escribe:
   *  - Colombia: 10 dígitos que empiezan por 3 (con o sin 57 delante).
   *  - Venezuela: 0414 123 4567, 414 123 4567, 58 414…, 58 0414…, y también el '+57' que la app
   *    le ponía delante a todo (574141234567). Celulares venezolanos: 412, 414, 416, 422, 424, 426.
   * La MISMA regla vive en supabase/functions/ag-otp-send (fuente de verdad del servidor).
   */
  static normalizarCelular(raw: string): string | null {
    const d = String(raw ?? '').replace(/\D/g, '');
    if (d.length === 10 && d.startsWith('3')) return '+57' + d;
    if (d.length === 12 && d.startsWith('573')) return '+' + d;
    let v: string | null = null;
    if (d.length === 11 && d.startsWith('0')) v = d.slice(1);
    else if (d.length === 10) v = d;
    else if (d.length === 12 && (d.startsWith('58') || d.startsWith('57'))) v = d.slice(2);
    else if (d.length === 13 && (d.startsWith('580') || d.startsWith('570'))) v = d.slice(3);
    return v && /^4(1[246]|2[246])\d{7}$/.test(v) ? '+58' + v : null;
  }

  /** '+584141234567' -> '🇻🇪 +58 414 123 4567'; '+573001234567' -> '🇨🇴 +57 300 123 4567'. */
  static celularParaMostrar(raw: string): string {
    const e = AgPhoneAuthService.normalizarCelular(raw);
    if (!e) return raw;
    const n = e.slice(3);
    return `${e.startsWith('+58') ? '🇻🇪' : '🇨🇴'} ${e.slice(0, 3)} ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }

  private _mapMessage(msg: string): PhoneAuthError {
    if (msg.includes('Demasiados') || msg.includes('many')) return 'too-many-requests';
    if (msg.includes('incorrecto') || msg.includes('invalid-code')) return 'invalid-code';
    if (msg.includes('inválido') || msg.includes('invalid-phone')) return 'invalid-phone';
    return 'unknown';
  }
}
