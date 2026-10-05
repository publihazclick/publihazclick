// Guardián de la velocidad de la ubicación por WhatsApp (2026-10-05).
//
// La respuesta a una ubicación compartida se volvió lenta CUATRO veces (2026-08-11, 08-18,
// 08-31 y 10-03), siempre igual: algo nuevo que llama a un servicio externo sin garantía
// de velocidad quedó esperándose ANTES de contestarle al pasajero. Esta prueba falla si
// vuelve a pasar en los dos puntos donde ha pasado: reverseGeocode() y el tramo del
// webhook entre que llega el mensaje (t0) y que se calculó la dirección (geoMs).
//
// Correr ANTES de desplegar ag-whatsapp:
//   deno test --no-lock supabase/functions/ag-whatsapp/velocidad_ubicacion_test.ts
//
// Si de verdad hace falta algo nuevo ahí, debe ir en paralelo y con tope de tiempo corto,
// o después de responder (como completarBarrioEnSegundoPlano). Medir con
// ag_wa_location_latency.respuesta_ms antes y después.

const codigo = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

// Servicios lentos o sin garantía que no pueden esperarse antes de responder.
const PROHIBIDOS = [
  /nominatim/i,
  /fetchNeighborhood\(/,
  /barrioDeNominatim\(/,
  /openai/i,
  /transcribeAudio\(/,
];

function tramo(desde: string, hasta: string): string {
  const i = codigo.indexOf(desde);
  if (i < 0) throw new Error(`No encontré "${desde}" en index.ts (¿se renombró? actualiza esta prueba)`);
  const j = codigo.indexOf(hasta, i + desde.length);
  if (j < 0) throw new Error(`No encontré "${hasta}" después de "${desde}"`);
  return codigo.slice(i, j);
}

function sinComentarios(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function revisar(nombre: string, texto: string) {
  const limpio = sinComentarios(texto);
  for (const re of PROHIBIDOS) {
    if (re.test(limpio)) {
      throw new Error(
        `${nombre} llama a ${re} antes de responder la ubicación: eso vuelve lenta la respuesta ` +
        `al pasajero (ver comentario al inicio de esta prueba).`,
      );
    }
  }
}

Deno.test('reverseGeocode solo usa Mapbox + nuestra tabla de barrios', () => {
  const cuerpo = tramo('async function reverseGeocode(', '\nasync function ');
  revisar('reverseGeocode()', cuerpo);
  if (!/barrioDeTabla\(/.test(sinComentarios(cuerpo))) {
    throw new Error('reverseGeocode() ya no usa barrioDeTabla(): revisa de dónde sale el barrio ahora');
  }
});

Deno.test('el webhook no espera nada lento antes de tener la dirección', () => {
  revisar('El webhook (entre t0 y geoMs)', tramo('const t0', 'const geoMs'));
});

Deno.test('la búsqueda del barrio en Nominatim va después de responder', () => {
  const despues = tramo('const respuestaMs', 'return new Response');
  if (!/completarBarrioEnSegundoPlano\(/.test(despues)) {
    throw new Error('completarBarrioEnSegundoPlano ya no se llama después de responder');
  }
});
