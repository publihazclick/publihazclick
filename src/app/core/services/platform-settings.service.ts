import { Injectable } from '@angular/core';
import { getSupabaseClient } from '../supabase.client';

@Injectable({ providedIn: 'root' })
export class PlatformSettingsService {
  private client = getSupabaseClient();

  async getSetting(key: string): Promise<string> {
    const { data, error } = await this.client
      .from('platform_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return '';
    return data.value ?? '';
  }

  async setSetting(key: string, value: string): Promise<void> {
    // Solo RPC SECURITY DEFINER: evita que RLS filtre el upsert silenciosamente
    // y propaga errores reales para que la UI no marque "éxito" falso.
    const { data, error } = await this.client.rpc('admin_set_platform_setting', {
      p_key:   key,
      p_value: value,
    });

    if (error) {
      console.error('[setSetting] RPC transport error:', error);
      throw new Error(error.message || 'Error de transporte al llamar al RPC.');
    }

    const r = data as {
      ok: boolean;
      reason?: string;
      message?: string;
      role?: string;
      value?: string;
    } | null;

    if (!r || !r.ok) {
      console.error('[setSetting] RPC rejected:', r);
      const reasons: Record<string, string> = {
        not_authenticated: 'Sesión no válida. Vuelve a iniciar sesión.',
        forbidden:         `Tu usuario no tiene permisos de administrador (rol detectado: ${r?.role || 'desconocido'}).`,
        invalid_key:       'Clave de configuración inválida.',
        db_error:          r?.message || 'Error en base de datos al guardar.',
      };
      throw new Error(reasons[r?.reason || ''] || r?.message || 'No se pudo guardar el setting.');
    }

    // Verificación adicional: re-leer para confirmar que sí se persistió
    const persisted = await this.getSetting(key);
    if (persisted !== value) {
      console.error('[setSetting] Persistence check failed:', { expected: value, got: persisted });
      throw new Error(`El guardado aparentó ser exitoso pero el valor leído (${persisted}) no coincide con el enviado (${value}).`);
    }
  }
}
