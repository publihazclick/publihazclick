import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  ConfirmationResult,
  Auth,
} from 'firebase/auth';

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyAQALDEZly-vfv4uojDVIzp1WONLHyxBA0',
  authDomain:        'movi-5ae91.firebaseapp.com',
  projectId:         'movi-5ae91',
  storageBucket:     'movi-5ae91.firebasestorage.app',
  messagingSenderId: '492581194770',
  appId:             '1:492581194770:android:ae910ae351fbb893e9dccb',
};

export type PhoneAuthError =
  | 'too-many-requests'
  | 'invalid-code'
  | 'invalid-phone'
  | 'unknown';

export interface PhoneAuthResult {
  ok: boolean;
  error?: PhoneAuthError;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class AgPhoneAuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private auth!: Auth;
  private recaptchaVerifier!: RecaptchaVerifier;
  private confirmationResult: ConfirmationResult | null = null;

  private initFirebase(): Auth {
    if (!isPlatformBrowser(this.platformId)) throw new Error('SSR');
    const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
    return getAuth(app);
  }

  /** Inicializa reCAPTCHA invisible en el contenedor dado (id del elemento DOM) */
  setupRecaptcha(containerId: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.auth = this.initFirebase();
    if (this.recaptchaVerifier) {
      this.recaptchaVerifier.clear();
    }
    this.recaptchaVerifier = new RecaptchaVerifier(this.auth, containerId, {
      size: 'invisible',
      callback: () => {},
    });
  }

  /** Envía OTP al número dado. Formato: +57XXXXXXXXXX */
  async sendOTP(phone: string): Promise<PhoneAuthResult> {
    if (!isPlatformBrowser(this.platformId)) return { ok: false, error: 'unknown' };
    try {
      if (!this.auth) this.auth = this.initFirebase();
      if (!this.recaptchaVerifier) {
        return { ok: false, error: 'unknown', message: 'Llama setupRecaptcha() primero' };
      }
      this.confirmationResult = await signInWithPhoneNumber(
        this.auth,
        phone,
        this.recaptchaVerifier,
      );
      return { ok: true };
    } catch (e: any) {
      return { ok: false, ...this._mapError(e) };
    }
  }

  /** Verifica el código de 6 dígitos recibido por SMS */
  async verifyOTP(code: string): Promise<PhoneAuthResult & { uid?: string }> {
    if (!this.confirmationResult) {
      return { ok: false, error: 'unknown', message: 'Primero envía el OTP' };
    }
    try {
      const result = await this.confirmationResult.confirm(code);
      return { ok: true, uid: result.user.uid };
    } catch (e: any) {
      return { ok: false, ...this._mapError(e) };
    }
  }

  /** Limpia el estado para reenviar OTP */
  reset(): void {
    this.confirmationResult = null;
    if (this.recaptchaVerifier) {
      this.recaptchaVerifier.clear();
      this.recaptchaVerifier = null!;
    }
  }

  private _mapError(e: any): { error: PhoneAuthError; message: string } {
    const code: string = e?.code ?? '';
    if (code.includes('too-many-requests')) {
      return { error: 'too-many-requests', message: 'Demasiados intentos. Intenta más tarde.' };
    }
    if (code.includes('invalid-verification-code') || code.includes('invalid-code')) {
      return { error: 'invalid-code', message: 'Código incorrecto. Verifica e intenta de nuevo.' };
    }
    if (code.includes('invalid-phone-number')) {
      return { error: 'invalid-phone', message: 'Número de teléfono inválido. Usa formato +57XXXXXXXXXX.' };
    }
    return { error: 'unknown', message: e?.message ?? 'Error desconocido' };
  }
}
