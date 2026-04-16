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
    const { error } = await this.client
      .from('platform_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
  }
}
