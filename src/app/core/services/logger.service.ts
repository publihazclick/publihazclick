import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Niveles de log disponibles
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Servicio centralizado de logging.
 *
 * En produccion solo registra errores criticos SIN datos sensibles.
 * En desarrollo permite todos los niveles de log.
 *
 * USO:
 *   private readonly logger = inject(LoggerService);
 *   this.logger.debug('Cargando datos...');
 *   this.logger.error('Fallo al cargar', contexto_no_sensible);
 *
 * REGLAS DE SEGURIDAD:
 * - NUNCA pasar tokens, passwords, sessions, emails, balances o datos PII
 * - Los mensajes de error deben ser genericos y orientados a la operacion
 * - En produccion solo se muestran errores (LogLevel.ERROR)
 */
@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  private readonly level: LogLevel;

  constructor() {
    this.level = environment.production ? LogLevel.ERROR : LogLevel.DEBUG;
  }

  /**
   * Log de depuracion - solo visible en desarrollo
   */
  debug(message: string, ...data: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`[DEBUG] ${message}`, ...data);
    }
  }

  /**
   * Log informativo - solo visible en desarrollo
   */
  info(message: string, ...data: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(`[INFO] ${message}`, ...data);
    }
  }

  /**
   * Log de advertencia - solo visible en desarrollo
   */
  warn(message: string, ...data: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...data);
    }
  }

  /**
   * Log de error - visible en produccion (sin datos sensibles)
   * En produccion solo muestra el mensaje, no los datos adicionales.
   */
  error(message: string, ...data: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      if (environment.production) {
        // En produccion: solo mensaje generico, sin datos internos
        console.error(`[ERROR] ${message}`);
      } else {
        console.error(`[ERROR] ${message}`, ...data);
      }
    }
  }
}
