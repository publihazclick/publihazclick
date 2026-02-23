import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Cliente singleton de Supabase compartido por toda la aplicación.
 * Esto evita múltiples instancias de GoTrueClient que causan problemas de sesión.
 */
let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'publihazclick-auth'
        }
      }
    );
  }
  return supabaseClient;
}

export { SupabaseClient };
