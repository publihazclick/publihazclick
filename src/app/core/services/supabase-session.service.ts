import { Injectable, inject } from '@angular/core';
import { getSupabaseClient } from '../supabase.client';
import { AuthService } from './auth.service';
import { LoggerService } from './logger.service';
import type { SupabaseClient, PostgrestSingleResponse } from '@supabase/supabase-js';

/**
 * Wrapper para llamadas RPC y queries de Supabase con manejo resiliente de sesión.
 *
 * Las llamadas `supabase.rpc()` NO pasan por el interceptor HTTP de Angular,
 * así que este servicio:
 *  1. Verifica que haya sesión vigente antes de ejecutar
 *  2. Si la sesión expiró, intenta refresh automático
 *  3. Si la llamada falla con error de auth, reintenta una vez tras refresh
 *  4. Si todo falla, lanza un error descriptivo
 */
@Injectable({ providedIn: 'root' })
export class SupabaseSessionService {
  private readonly auth = inject(AuthService);
  private readonly logger = inject(LoggerService);
  private readonly supabase: SupabaseClient = getSupabaseClient();

  /**
   * Ejecuta un RPC de Supabase con manejo automático de sesión expirada.
   * @param fnName Nombre de la función RPC
   * @param params Parámetros del RPC
   * @returns Resultado del RPC
   * @throws Error con mensaje descriptivo si falla
   */
  async callRpc<T = any>(
    fnName: string,
    params: Record<string, any> = {}
  ): Promise<T> {
    // 1. Si la sesión está expirada o a punto de expirar, refrescar primero
    if (this.auth.isSessionExpired(60)) {
      this.logger.info(`Session expired/expiring, refreshing before RPC: ${fnName}`);
      const refreshResult = await this.auth.refreshSessionAsync();
      if (!refreshResult.success) {
        throw new Error(
          'Tu sesión ha expirado y no se pudo renovar. Por favor, inicia sesión de nuevo.'
        );
      }
    }

    // 2. Ejecutar el RPC
    const { data, error } = (await this.supabase.rpc(
      fnName,
      params
    )) as PostgrestSingleResponse<T>;

    // 3. Si fue exitoso, retornar
    if (!error) {
      return data as T;
    }

    // 4. Si el error es de autenticación, intentar refresh + retry
    if (this.isAuthError(error)) {
      this.logger.warn(`Auth error on RPC ${fnName}, attempting refresh + retry`);
      const refreshResult = await this.auth.refreshSessionAsync();
      if (!refreshResult.success) {
        throw new Error(
          'Tu sesión ha expirado y no se pudo renovar. Por favor, inicia sesión de nuevo.'
        );
      }

      // Retry una sola vez
      const retry = (await this.supabase.rpc(
        fnName,
        params
      )) as PostgrestSingleResponse<T>;

      if (retry.error) {
        this.logger.error(`RPC ${fnName} failed after retry: ${retry.error.message}`);
        throw new Error(retry.error.message);
      }
      return retry.data as T;
    }

    // 5. Error no relacionado con auth
    throw new Error(error.message);
  }

  /**
   * Determina si un error de Supabase es un error de autenticación/sesión expirada.
   */
  private isAuthError(error: { message: string; code?: string; details?: string }): boolean {
    const msg = (error.message || '').toLowerCase();
    const code = error.code || '';
    return (
      code === 'PGRST301' || // JWT expired
      code === '401' ||
      msg.includes('jwt expired') ||
      msg.includes('jwt') ||
      msg.includes('invalid claim') ||
      msg.includes('token is expired') ||
      msg.includes('not authenticated') ||
      msg.includes('no session')
    );
  }
}
