// Guardián del soporte a conductores (2026-10-05). Frases REALES de la auditoría de ese día: el bot
// contestaba "¡Mucho gusto!" a cosas que no eran un nombre, "¿En qué te ayudo?" a quien se despedía,
// tomaba "Listo voy a hacerlo" como "ya la descargué" y le respondía dos veces a un contestador.
//   deno test --no-lock --allow-read supabase/functions/ag-whatsapp/soporte_frases_test.ts
const src = (await Deno.readTextFile(new URL('./index.ts', import.meta.url))).split('\r\n').join('\n');
function grab(name: string): string {
  const i = src.indexOf(`\nfunction ${name}(`) + 1;
  if (i <= 0) throw new Error(`no encontré ${name}`);
  const j = src.indexOf('\n}\n', i);
  return src.slice(i, j + 2).replace(/\): (boolean|string \| null|string) \{/, ') {').replace(/\((\w+): string(, (\w+): string \| null)?\)/, (_m, a, _b, c) => c ? `(${a}, ${c})` : `(${a})`);
}
const nombres = ['normalizarTexto', 'pideAlgoTexto', 'esCierreOAcuse', 'diceQueLuego', 'esRespuestaAutomatica', 'introPasoNombre', 'leeNombreDado'];
const f = new Function(nombres.map(grab).join('\n') + `\nreturn { ${nombres.join(', ')} };`)();

const casos: Array<[string, (t: string) => unknown, unknown]> = [
  // pideAlgo: no es un nombre
  ['Cuénteme de q se trata', f.pideAlgoTexto, true],
  ['Es como indriver?', f.pideAlgoTexto, true],
  ['Fernando casanova', f.pideAlgoTexto, false],
  // cierres y acuses
  ['Por ahora nada , gracias', f.esCierreOAcuse, true],
  ['Ok señora', f.esCierreOAcuse, true],
  ['Estaré atento a comunicarme con uds.', f.esCierreOAcuse, true],
  ['Gracias', f.esCierreOAcuse, true],
  ['Bien gracias', f.esCierreOAcuse, true],
  ['Claro', f.esCierreOAcuse, true],
  ['👍', f.esCierreOAcuse, true],
  ['Cuánto le toca uno por el viajé q aga', f.esCierreOAcuse, false],
  ['Ya la descargué', f.esCierreOAcuse, false],
  ['Hola, no me llegan viajes en Movi', f.esCierreOAcuse, false],
  // lo hará después
  ['Ahora te vuelvo a escribir', f.diceQueLuego, true],
  ['Ocupado', f.diceQueLuego, true],
  ['Listo voy a hacerlo', f.diceQueLuego, true],
  ['Estaba trabajando', f.diceQueLuego, true],
  ['Ya la descargué', f.diceQueLuego, false],
  // contestador automático
  ["Gracias por comunicarte con EHBRA 'S. Agente on line de productos y servicios . Estamos atentos a sus requerimientos", f.esRespuestaAutomatica, true],
  ['Gracias por tu mensaje. Si no te respondo inmediatamente , si lo haré lo antes posible.', f.esRespuestaAutomatica, true],
  ['Gracias', f.esRespuestaAutomatica, false],
  // nombre
  ['Johan Hernández', f.leeNombreDado, 'Johan'],
  ['Cuénteme de q se trata', (t: string) => f.pideAlgoTexto(t) ? null : f.leeNombreDado(t), null],
  ['Ocupado', f.leeNombreDado, null],
  ['Estaba trabajando', f.leeNombreDado, null],
];
Deno.test('frases reales del soporte a conductores', () => {
  const mal = casos.filter(([t, fn, esperado]) => fn(t) !== esperado).map(([t, fn, e]) => `${JSON.stringify(t)} -> ${JSON.stringify(fn(t))} (esperaba ${JSON.stringify(e)})`);
  if (mal.length) throw new Error('\n' + mal.join('\n'));
});
Deno.test('el saludo del paso nombre no dice "Mucho gusto" si no dio un nombre', () => {
  const a = f.introPasoNombre('Cuénteme de q se trata', null);
  const b = f.introPasoNombre('Muy buenas noches', null);
  const c = f.introPasoNombre('Johan Hernández', 'Johan');
  if (/Mucho gusto/.test(a) || /Mucho gusto/.test(b) || !/Mucho gusto/.test(c)) throw new Error([a, b, c].join(' | '));
});
