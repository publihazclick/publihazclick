/**
 * Utilidades de sanitizacion para prevenir inyeccion en filtros PostgREST.
 *
 * Supabase JS usa PostgREST bajo el capot. Cuando construimos expresiones
 * .or() o .ilike() con interpolacion de strings, caracteres especiales
 * como . , ( ) pueden manipular la estructura del filtro.
 *
 * Estas funciones eliminan esos caracteres peligrosos del input del usuario.
 */

/**
 * Sanitiza un string para uso seguro en filtros PostgREST (.or, .ilike, etc.)
 * Elimina caracteres que pueden alterar la estructura del filtro:
 * - . (separador de campo/operador)
 * - , (separador de condiciones)
 * - ( ) (agrupacion)
 * - % cuando esta al inicio/fin (ya se agrega en el patron ilike)
 *
 * @param input - string del usuario a sanitizar
 * @returns string seguro para filtros PostgREST
 */
export function sanitizePostgrestFilter(input: string): string {
  if (!input) return '';
  // Eliminar caracteres que tienen significado especial en filtros PostgREST
  return input
    .replace(/[.,()\\]/g, '')
    .trim();
}

/**
 * Sanitiza input HTML para prevenir XSS basico.
 * Angular ya protege contra XSS por defecto en templates,
 * pero esto es util para datos que se procesan manualmente.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
