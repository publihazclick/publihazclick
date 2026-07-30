import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

let moviClient: SupabaseClient | null = null;

/** Supabase client dedicado para Movi/AndaGana — storageKey separado del PTC principal */
export function getMoviClient(): SupabaseClient {
  if (!moviClient) {
    const isBrowser = typeof window !== 'undefined';
    moviClient = createClient(
      environment.moviSupabase.url,
      environment.moviSupabase.anonKey,
      {
        auth: {
          persistSession: isBrowser,
          autoRefreshToken: isBrowser,
          detectSessionInUrl: false,
          storageKey: 'movi-ag-auth',
        },
      }
    );
  }
  return moviClient;
}
