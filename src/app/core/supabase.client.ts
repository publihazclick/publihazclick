import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Cliente singleton de Supabase compartido por toda la aplicación.
 * Detecta si corre en browser o SSR para evitar errores de window/localStorage.
 */
let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    // En SSR (Node.js) window no existe — deshabilitamos opciones que dependen del browser
    const isBrowser = typeof window !== 'undefined';
    supabaseClient = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          persistSession: isBrowser,
          autoRefreshToken: isBrowser,
          detectSessionInUrl: isBrowser,
          storageKey: 'publihazclick-auth'
        }
      }
    );
  }
  return supabaseClient;
}

export { SupabaseClient };
