/**
 * Configuración de Supabase para PublihazClick
 * 
 * Reemplaza los valores de placeholder con tus credenciales reales de Supabase:
 * - Tu URL de Supabase (ej: https://tu-proyecto.supabase.co)
 * - Tu clave pública (anon key)
 * 
 * Para obtener estas credenciales:
 * 1. Ve a https://supabase.com/dashboard
 * 2. Selecciona tu proyecto
 * 3. Ve a Settings > API
 */

export const environment = {
  production: false,
  freeCurrencyApiKey: 'fca_live_9TcBlO4cZge82CUYl7cta0M7dkkcX7aiexyXwSPJ',
  supabase: {
    url: 'https://btkdmdhzouzvzgyuzgbh.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0a2RtZGh6b3V6dnpneXV6Z2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTM3NjcsImV4cCI6MjA4Njg2OTc2N30._vXkGfjlK_lql_KcE9nfBGP8VvkCJXQctNpuZDnYFz8',
    options: {
      accessTokenExpTime: 3600,
      persistSession: true,
      storageKey: 'publihazclick-auth',
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  },
  redirect: {
    loginSuccess: '/dashboard',
    logoutSuccess: '/login',
    unauthorized: '/login'
  },
  // Número de WhatsApp para contacto directo (sin el +)
  whatsappNumber: '573181800264',
  whatsappDefaultMessage: 'Hola! Me interesa conocer más sobre los servicios de publicidad digital de Publihazclick'
};

/**
 * Tipo para la configuración de Supabase
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
  options?: {
    accessTokenExpTime?: number;
    persistSession?: boolean;
    storageKey?: string;
    autoRefreshToken?: boolean;
    detectSessionInUrl?: boolean;
  };
}

/**
 * Tipo para la configuración de redirects
 */
export interface RedirectConfig {
  loginSuccess: string;
  logoutSuccess: string;
  unauthorized: string;
}
