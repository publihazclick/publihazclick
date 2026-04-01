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
    logoutSuccess: '/',
    unauthorized: '/login'
  },
  // Número de WhatsApp para contacto directo (sin el +)
  whatsappNumber: '573181800264',
  whatsappDefaultMessage: 'Hola! Me interesa conocer más sobre los servicios de publicidad digital de Publihazclick',
  epayco: {
    pCustIdCliente: '1575769',
    pKey: 'a43a672655a9c6576bf5fcd52c0d03b95e5912d6',
    publicKey: '62977a30b1a19dcd0728f6b639b33fb0',
    privateKey: 'feb3b00cd4fe4a203cbfe00eba8c9695',
    test: true,
  },
  andaGana: {
    mapboxToken:      'pk.eyJ1IjoiYW5kYWdhbmEiLCJhIjoiY21uMGl2Z2p0MGl5MjJxcHpxbWJqbHk3ZCJ9.nkiJPIKUx4thRAXw_bum3w',
    functionsBaseUrl: 'https://btkdmdhzouzvzgyuzgbh.supabase.co/functions/v1',
  },
  // YouTube Data API v3 key — get from console.cloud.google.com
  youtubeApiKey: 'AIzaSyCLn_rNDe8iOHzdDFeHw4pWHrV3RvWgoV8',
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
