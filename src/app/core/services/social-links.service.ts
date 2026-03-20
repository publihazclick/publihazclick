import { Injectable, signal, computed } from '@angular/core';
import { getSupabaseClient } from '../supabase.client';

export interface SocialLinks {
  facebook:  string;
  instagram: string;
  tiktok:    string;
  whatsapp:  string;
  youtube:   string;
  telegram:  string;
}

const EMPTY: SocialLinks = {
  facebook:  '',
  instagram: '',
  tiktok:    '',
  whatsapp:  '',
  youtube:   '',
  telegram:  '',
};

@Injectable({ providedIn: 'root' })
export class SocialLinksService {
  private readonly client = getSupabaseClient();

  private readonly _links = signal<SocialLinks>({ ...EMPTY });
  readonly links = this._links.asReadonly();

  // Computed helpers usados en templates
  readonly facebook  = computed(() => this._links().facebook);
  readonly instagram = computed(() => this._links().instagram);
  readonly tiktok    = computed(() => this._links().tiktok);
  readonly whatsapp  = computed(() => this._links().whatsapp);
  readonly youtube   = computed(() => this._links().youtube);
  readonly telegram  = computed(() => this._links().telegram);

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const { data } = await this.client
        .from('platform_settings')
        .select('key, value')
        .in('key', ['social_facebook', 'social_instagram', 'social_tiktok',
                    'social_whatsapp', 'social_youtube', 'social_telegram']);

      if (!data) return;
      const map: Record<string, string> = {};
      for (const row of data) map[row.key] = row.value ?? '';

      this._links.set({
        facebook:  map['social_facebook']  ?? '',
        instagram: map['social_instagram'] ?? '',
        tiktok:    map['social_tiktok']    ?? '',
        whatsapp:  map['social_whatsapp']  ?? '',
        youtube:   map['social_youtube']   ?? '',
        telegram:  map['social_telegram']  ?? '',
      });
    } catch {
      // Si falla, deja los links vacíos; los botones quedan ocultos
    }
  }

  async save(links: SocialLinks): Promise<void> {
    const rows = [
      { key: 'social_facebook',  value: links.facebook  },
      { key: 'social_instagram', value: links.instagram },
      { key: 'social_tiktok',    value: links.tiktok    },
      { key: 'social_whatsapp',  value: links.whatsapp  },
      { key: 'social_youtube',   value: links.youtube   },
      { key: 'social_telegram',  value: links.telegram  },
    ].map(r => ({ ...r, updated_at: new Date().toISOString() }));

    const { error } = await this.client
      .from('platform_settings')
      .upsert(rows, { onConflict: 'key' });

    if (error) throw new Error(error.message);
    this._links.set({ ...links });
  }
}
