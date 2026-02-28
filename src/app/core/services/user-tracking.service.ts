import { Injectable, signal } from '@angular/core';

/**
 * Interfaz para almacenar datos de cacheo de anuncio
 */
export interface AdCacheData {
  adId: string;
  timestamp: number;
  ip: string;
}

/**
 * Interfaz para datos del usuario
 */
export interface UserSessionData {
  ip: string;
  firstVisit: number;
  adsViewed: AdCacheData[];
}

@Injectable({
  providedIn: 'root'
})
export class UserTrackingService {
  private readonly STORAGE_KEY = 'user_session_data';
  private readonly IP_API_URL = 'https://api.ipify.org?format=json';

  // Signal para la IP actual
  readonly currentIp = signal<string>('');

  // Signal para datos de sesión
  readonly sessionData = signal<UserSessionData | null>(null);

  // Cache del fingerprint de sesión (no cambia durante la sesión)
  private cachedFingerprint: string | null = null;

  constructor() {
    this.initializeSession();
  }

  /**
   * Retorna la fecha de hoy en zona horaria Colombia (America/Bogota, UTC-5)
   * Formato: 'YYYY-MM-DD'
   */
  private getTodayColombia(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  /**
   * Verifica si un timestamp corresponde al día de hoy en Colombia.
   */
  private isFromTodayColombia(timestamp: number): boolean {
    const adDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(timestamp));
    return adDate === this.getTodayColombia();
  }

  /**
   * Elimina del historial de anuncios vistos todos los registros que NO
   * correspondan al día de hoy en Colombia (se purgan al iniciar la app).
   */
  private purgeStaleDailyViews(session: UserSessionData): UserSessionData {
    const todayAds = session.adsViewed.filter(ad => this.isFromTodayColombia(ad.timestamp));
    if (todayAds.length === session.adsViewed.length) return session;
    return { ...session, adsViewed: todayAds };
  }

  /**
   * Inicializa la sesión del usuario
   */
  private async initializeSession(): Promise<void> {
    // Obtener IP del usuario
    await this.fetchUserIp();

    // Cargar datos de sesión del localStorage
    const storedData = this.getStoredSession();

    if (storedData && storedData.ip === this.currentIp()) {
      // Purgar anuncios de días anteriores antes de usar la sesión guardada
      const cleanSession = this.purgeStaleDailyViews(storedData);
      this.sessionData.set(cleanSession);
      // Si hubo purga, persistir la sesión limpia
      if (cleanSession.adsViewed.length !== storedData.adsViewed.length) {
        this.saveSession(cleanSession);
      }
    } else {
      // Nueva sesión o IP diferente - crear nuevos datos
      const newSession: UserSessionData = {
        ip: this.currentIp(),
        firstVisit: Date.now(),
        adsViewed: []
      };
      this.saveSession(newSession);
      this.sessionData.set(newSession);
    }
  }

  /**
   * Obtiene la IP del usuario desde una API externa
   */
  private async fetchUserIp(): Promise<void> {
    try {
      const response = await fetch(this.IP_API_URL);
      const data = await response.json();
      this.currentIp.set(data.ip);
    } catch {
      this.currentIp.set('127.0.0.1');
    }
  }

  /**
   * Obtiene datos de sesión del localStorage
   */
  private getStoredSession(): UserSessionData | null {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  /**
   * Guarda datos de sesión en localStorage
   */
  private saveSession(data: UserSessionData): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Silent fail - non-critical localStorage operation
    }
  }

  /**
   * Registra que el usuario vio un anuncio
   */
  recordAdView(adId: string): void {
    const currentData = this.sessionData();
    if (!currentData) return;

    const newAdData: AdCacheData = {
      adId,
      timestamp: Date.now(),
      ip: this.currentIp()
    };

    // Agregar el anuncio a la lista
    const updatedAds = [...currentData.adsViewed, newAdData];

    const updatedSession: UserSessionData = {
      ...currentData,
      adsViewed: updatedAds
    };

    this.sessionData.set(updatedSession);
    this.saveSession(updatedSession);
  }

  /**
   * Verifica si el usuario ya vio un anuncio HOY (hora Colombia).
   * Anuncios vistos en días anteriores no se consideran vistos.
   */
  hasViewedAd(adId: string): boolean {
    const currentData = this.sessionData();
    if (!currentData) return false;
    return currentData.adsViewed.some(
      ad => ad.adId === adId && this.isFromTodayColombia(ad.timestamp)
    );
  }

  /**
   * Verifica si el usuario puede reclamar una recompensa
   * Retorna true si puede reclamar, false si ya lo vio hoy
   */
  canClaimReward(adId: string): boolean {
    return !this.hasViewedAd(adId);
  }

  /**
   * Limpia el historial de anuncios vistos (para resetear)
   */
  clearAdHistory(): void {
    const currentData = this.sessionData();
    if (!currentData) return;

    const updatedSession: UserSessionData = {
      ...currentData,
      adsViewed: []
    };

    this.sessionData.set(updatedSession);
    this.saveSession(updatedSession);
  }

  /**
   * Resetea completamente la sesión (para cuando hay nuevos cambios)
   */
  resetSession(): void {
    const newSession: UserSessionData = {
      ip: this.currentIp(),
      firstVisit: Date.now(),
      adsViewed: []
    };
    this.sessionData.set(newSession);
    this.saveSession(newSession);
  }

  /**
   * Genera un fingerprint de sesión basado en propiedades del navegador.
   * Hash SHA-256 de userAgent + screen + timezone + language.
   * Se cachea en memoria (no cambia durante la sesión).
   */
  async getSessionFingerprint(): Promise<string> {
    if (this.cachedFingerprint) return this.cachedFingerprint;
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return '';

    const raw = [
      navigator.userAgent || '',
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      navigator.language || '',
    ].join('|');

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(raw);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      this.cachedFingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback: simple hash si crypto.subtle no está disponible
      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        const char = raw.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
      }
      this.cachedFingerprint = Math.abs(hash).toString(16).padStart(16, '0');
    }

    return this.cachedFingerprint;
  }

  /**
   * Obtiene la IP actual
   */
  getIp(): string {
    return this.currentIp();
  }

  /**
   * Fuerza la actualización de la IP
   */
  async refreshIp(): Promise<void> {
    await this.fetchUserIp();

    // Actualizar IP en sesión
    const currentData = this.sessionData();
    if (currentData) {
      const updatedSession: UserSessionData = {
        ...currentData,
        ip: this.currentIp()
      };
      this.sessionData.set(updatedSession);
      this.saveSession(updatedSession);
    }
  }
}
