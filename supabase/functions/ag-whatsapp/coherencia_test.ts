// Guardián de coherencia del bot de pasajeros (2026-10-05).
// Auditoría con 106 casos: "gracias", "no entiendo" o un botón viejo se tomaban como dirección
// ("📍 Te recojo en *gracias*"). noEsDireccion() lo evita; esta prueba falla si deja de aceptar
// direcciones reales o vuelve a aceptar frases que no lo son.
//   deno test --no-lock --allow-read supabase/functions/ag-whatsapp/coherencia_test.ts
const src = (await Deno.readTextFile(new URL('./index.ts', import.meta.url))).split('\r\n').join('\n');
function grab(name: string): string {
  const i = src.indexOf(`\nfunction ${name}(`) + 1;
  const j = src.indexOf('\n}\n', i);
  return src.slice(i, j + 2)
    .replace(/\(t: string\): boolean/, '(t)')
    .replace(/\(t: string, aceptaSi = false\): boolean/, '(t, aceptaSi = false)');
}
const code = `${grab('isGreeting')}\n${grab('noEsDireccion')}\nreturn { isGreeting, noEsDireccion };`;
const { isGreeting, noEsDireccion } = new Function(code)();

const direcciones = ['Calle 5 # 3-20', 'Unicentro Cucuta', 'La Insula', 'barrio san luis', 'Hola estoy en la calle 10',
  'Cra 7 #12-30 Caobos', 'Terminal', 'Aeropuerto', 'gracias calle 8 # 2-10', 'Conjunto Manet torre 3', 'Av 0',
  'Hospital Erasmo Meoz', 'Ventura Plaza', 'mi casa en el barrio Ospina', 'Atalaya', 'no 5 calle 3'];
const noDir = ['gracias', 'Gracias!!', 'ok', 'OK.', '?', '👍', '', 'no entiendo', 'buenas tardes', 'Buenos días',
  'hola!', 'Hola buenas', 'ayuda', '🚗 Carro', 'jajaja', 'listo', 'mil gracias'];

Deno.test('noEsDireccion acepta direcciones reales y rechaza lo que no lo es', () => {
  const mal: string[] = [];
  for (const d of direcciones) if (noEsDireccion(d)) mal.push(`dirección rechazada: ${d}`);
  for (const d of noDir) if (!noEsDireccion(d)) mal.push(`no-dirección aceptada: ${d}`);
  for (const g of ['hola', 'buenas tardes', 'Buen día', 'hola buenas noches', 'Qué tal']) if (!isGreeting(g)) mal.push(`saludo no reconocido: ${g}`);
  for (const g of ['hola estoy en la calle 10', 'buenas, voy al centro']) if (isGreeting(g)) mal.push(`frase tomada como saludo: ${g}`);
  if (mal.length) throw new Error(mal.join('\n'));
});
