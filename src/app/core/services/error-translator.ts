/**
 * Traductor centralizado de errores para mostrar mensajes en español al usuario.
 * Convierte errores técnicos de Supabase, Postgres y red en mensajes amigables.
 *
 * Uso:
 *   import { traducirError } from '@/core/services/error-translator';
 *   try { ... } catch (e) { this.error.set(traducirError(e)); }
 */

interface ErrorLike {
  message?: string;
  error?: { message?: string };
  details?: string;
  hint?: string;
  code?: string;
}

const TRADUCCIONES: ReadonlyArray<readonly [RegExp | string, string]> = [
  // ── Auth (Supabase) ─────────────────────────────────────
  ['Invalid login credentials', 'Correo o contraseña incorrectos.'],
  ['Email not confirmed', 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada.'],
  ['User already registered', 'Este correo ya está registrado. Inicia sesión en lugar de registrarte.'],
  ['User not found', 'Usuario no encontrado.'],
  ['Password should be at least', 'La contraseña debe tener al menos 6 caracteres.'],
  ['Email rate limit exceeded', 'Demasiados correos enviados. Espera unos minutos antes de volver a intentarlo.'],
  ['over_email_send_rate_limit', 'Demasiados intentos. Espera unos minutos.'],
  ['Too many requests', 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.'],
  ['rate limit', 'Demasiados intentos. Espera unos minutos.'],
  ['Invalid email', 'El formato del correo no es válido.'],
  ['Unable to validate email address', 'El correo no es válido.'],
  ['Signup requires a valid password', 'Debes ingresar una contraseña válida.'],
  ['Token has expired', 'La sesión expiró. Vuelve a iniciar sesión.'],
  ['JWT expired', 'La sesión expiró. Vuelve a iniciar sesión.'],
  ['No user found', 'No se encontró el usuario.'],
  ['Anonymous sign-ins are disabled', 'El inicio de sesión anónimo está deshabilitado.'],

  // ── Postgres / DB ───────────────────────────────────────
  [/column "[^"]+" of relation "[^"]+" does not exist/i, 'Hubo un error técnico procesando tu solicitud. El equipo ya fue notificado.'],
  [/relation "[^"]+" does not exist/i, 'Recurso no encontrado en el sistema.'],
  [/duplicate key value violates unique constraint/i, 'Ya existe un registro con esa información.'],
  [/violates foreign key constraint/i, 'No se puede completar la operación por una referencia inválida.'],
  [/violates not-null constraint/i, 'Falta información obligatoria.'],
  [/violates check constraint/i, 'Los datos no cumplen con las reglas del sistema.'],
  [/permission denied/i, 'No tienes permiso para realizar esta acción.'],
  [/new row violates row-level security policy/i, 'No tienes permiso para realizar esta acción.'],
  [/row-level security/i, 'No tienes permiso para realizar esta acción.'],
  [/syntax error/i, 'Hubo un error técnico. El equipo ya fue notificado.'],
  [/database error/i, 'Hubo un error en la base de datos. Intenta de nuevo en unos segundos.'],
  [/connection refused/i, 'No se pudo conectar al servidor. Intenta de nuevo en unos segundos.'],
  [/timeout/i, 'La operación tardó demasiado. Intenta de nuevo.'],

  // ── Red / fetch ─────────────────────────────────────────
  ['Failed to fetch', 'Sin conexión a internet. Verifica tu red e intenta de nuevo.'],
  ['NetworkError', 'Sin conexión a internet. Verifica tu red e intenta de nuevo.'],
  ['Network request failed', 'Sin conexión a internet. Verifica tu red e intenta de nuevo.'],
  ['fetch failed', 'No se pudo conectar. Verifica tu conexión.'],

  // ── Permisos / sesión ───────────────────────────────────
  ['Not authorized', 'No tienes permiso para realizar esta acción.'],
  ['Unauthorized', 'No tienes permiso para realizar esta acción.'],
  ['Forbidden', 'Acceso denegado.'],

  // ── Storage ─────────────────────────────────────────────
  ['Bucket not found', 'No se encontró el espacio de almacenamiento.'],
  ['The resource already exists', 'El archivo ya existe.'],
  ['Payload too large', 'El archivo es demasiado grande.'],

  // ── Pagos / negocio (Reloadly, Wompi, etc.) ─────────────
  ['Insufficient funds', 'Saldo insuficiente.'],
  ['insufficient_balance', 'Saldo insuficiente.'],
  [/saldo insuficiente/i, 'Saldo insuficiente para realizar esta operación.'],
];

/**
 * Convierte un error en un mensaje legible en español.
 * Si el mensaje original ya está en español o no coincide con ninguna regla,
 * se devuelve tal cual (limitado a 200 caracteres por seguridad).
 */
export function traducirError(err: unknown): string {
  const msg = extraerMensaje(err);
  if (!msg) return 'Ocurrió un error inesperado. Intenta de nuevo.';

  // Si parece estar en español, devolver tal cual (heurística simple).
  if (esProbablementeEspanol(msg)) {
    return truncar(msg);
  }

  // Buscar coincidencia en las traducciones.
  for (const [patron, traduccion] of TRADUCCIONES) {
    if (typeof patron === 'string') {
      if (msg.toLowerCase().includes(patron.toLowerCase())) return traduccion;
    } else if (patron.test(msg)) {
      return traduccion;
    }
  }

  // Sin coincidencia → mensaje genérico (el técnico va a logs, no al usuario).
  return 'Ocurrió un error inesperado. Intenta de nuevo en unos segundos.';
}

function extraerMensaje(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  const e = err as ErrorLike;
  return e?.message || e?.error?.message || e?.details || e?.hint || '';
}

function esProbablementeEspanol(msg: string): boolean {
  // Palabras comunes en español que no están en inglés.
  return /\b(no|sí|tu|tus|su|sus|para|por|con|sin|este|esta|estos|estas|está|están|cuenta|usuario|contraseña|saldo|paquete|recarga|solicitud|aprobad[oa]|ñ|á|é|í|ó|ú)\b/i.test(msg);
}

function truncar(msg: string, max = 200): string {
  return msg.length > max ? msg.slice(0, max - 1) + '…' : msg;
}
