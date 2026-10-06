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
const nombres = ['normalizarTexto', 'pideHumano', 'pideAlgoTexto', 'esCierreOAcuse', 'diceQueLuego', 'esRespuestaAutomatica', 'introPasoNombre', 'leeNombreDado'];
const f = new Function(nombres.map(grab).join('\n') + `\nreturn { ${nombres.join(', ')} };`)();

const casos: Array<[string, (t: string) => unknown, unknown]> = [
  // pideAlgo: no es un nombre
  ['Cuénteme de q se trata', f.pideAlgoTexto, true],
  ['Es como indriver?', f.pideAlgoTexto, true],
  ['Fernando casanova', f.pideAlgoTexto, false],
  ['Una pregunta la aplicación sale así', f.pideAlgoTexto, true],
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
  // pide una persona (aunque no diga 'asesor')
  ['Necesito hablar c9n  victor landazuri', (t: string) => f.pideHumano(t), true],
  ['Quiero hablar con el dueño', (t: string) => f.pideHumano(t), true],
  ['el asesor me dijo que sí', (t: string) => f.pideHumano(t), false],
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

// Bienvenida automática al registrarse (2026-10-05, migración 318). Caso real …2330: se registró
// con moto y el chat no le dijo nada. Debe decir su nombre de la app, moto/carro, los datos del
// vehículo y que lo siguiente es recargar -- sin la nota del 12% ("textos innecesarios").
Deno.test('bienvenida al registrarse: nombre, vehículo y recarga', async () => {
  const trozo = (ini: string, fin: string) => { const i = src.indexOf(ini); const j = src.indexOf(fin, i); if (i < 0 || j < 0) throw new Error('no encontré ' + ini); return src.slice(i, j); };
  const codigo = [
    trozo('const LEAD_PONTE_EN_LINEA', ';\n') + ';',
    trozo('type ConductorBienvenida', '};\n') + '};',
    trozo('function primerNombre(', '\n}\n') + '\n}',
    trozo('function textoBienvenidaRegistro(', '\n}\n') + '\n}',
    'export { primerNombre, textoBienvenidaRegistro };',
  ].join('\n');
  const m = await import('data:application/typescript;base64,' + btoa(unescape(encodeURIComponent(codigo))));
  const base = { id: 'x', created_at: '', vehicle_model: null, vehicle_plate: null };
  const moto = m.textoBienvenidaRegistro(m.primerNombre('JHON jairo Martinez'),
    { ...base, wallet_balance: 0, vehicle_type: 'moto', vehicle_brand: 'Hero', vehicle_year: 2023, vehicle_color: 'Azul ', plate: 'gqw61g' });
  const t = moto.texto as string;
  for (const debe of ['¡Jhon, ya quedaste registrado', '*moto 🏍️*', 'Marca: Hero', 'Modelo: 2023', 'Color: Azul\n', 'Placa: GQW61G', 'recargar tu saldo', '$10.000']) {
    if (!t.includes(debe)) throw new Error(`falta "${debe}" en:\n${t}`);
  }
  if (/12%|primer viaje/i.test(t) || moto.conSaldo) throw new Error(t);
  const carro = m.textoBienvenidaRegistro(null, { ...base, wallet_balance: 20000, vehicle_type: 'carro', vehicle_brand: 'Spark ', vehicle_year: 2009, vehicle_color: null, plate: 'CWK748' });
  if (!carro.conSaldo || !carro.texto.includes('*carro 🚗*') || carro.texto.includes('recargar tu saldo') || carro.texto.includes('Color:')) throw new Error(carro.texto);
});

// Casos reales 2026-10-05 del revisor en tiempo real.
// …2330: "Sin recargar puedo observar las solicitudes q van saliendo" -> "Tu solicitud sigue en revisión".
// …8217: foto + "ando en el colsag y la ubicación de en Antonia santos" -> "no puedo ver imágenes".
Deno.test('preguntas de cómo funciona no se toman como consulta de su cuenta', () => {
  const linea = (ini: string) => { const i = src.indexOf(ini); return src.slice(i, src.indexOf('\n', i)); };
  const status = new Function('lower', 'return ' + linea('const asksStatus').split('= ')[1]);
  const wallet = new Function('lower', 'return ' + linea('const asksWallet').split('= ').slice(1).join('= '));
  const fotoTexto = new Function('msgText', 'const dicePago = false; return ' + src.slice(src.indexOf('const textoSeEntiendeSolo = ') + 28, src.indexOf(';', src.indexOf('const textoSeEntiendeSolo'))));
  const t = 'sin recargar puedo observar las solicitudes q van saliendo';
  if (status(t) || wallet(t)) throw new Error('la pregunta de las solicitudes se tomó como consulta de cuenta');
  if (!status('cómo va mi solicitud') || !status('en qué estado está mi solicitud de registro') || !wallet('cuánto saldo tengo')) throw new Error('se rompió la consulta de cuenta');
  if (!fotoTexto('Hola buenas tardes disculpe la molestia pero ando en el colsag y la ubicación de en Antonia santos')) throw new Error('foto con texto claro');
  if (fotoTexto('Una pregunta la aplicación sale así') || fotoTexto('mira lo que me sale en la pantalla')) throw new Error('foto que hay que describir');
});

// Embudo simplificado (pedido del usuario 2026-10-05): saludo -> link sin botón -> silencio hasta que
// pide el código -> bienvenida al registrarse -> "gana invitando" corto una sola vez. Nada más.
Deno.test('el embudo de conductores no vuelve a meter botón, video ni preguntas', () => {
  const cuerpo = (nombre: string) => {
    const i = src.indexOf(`\nasync function ${nombre}(`);
    if (i < 0) throw new Error(`no encontré ${nombre}`);
    // Sin comentarios: solo cuenta lo que de verdad se le manda a la persona.
    return src.slice(i, src.indexOf('\n}\n', i)).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  };
  if (/title: 'Ya la descarg/.test(src)) throw new Error('volvió el botón "Ya la descargué"');
  if (/sendSupportButtons/.test(cuerpo('leadPrimerPaso'))) throw new Error('el link volvió a llevar botones');
  if (/avisas|av[ií]same/i.test(cuerpo('leadPrimerPaso'))) throw new Error('el link volvió a pedir "avísame"');
  for (const fn of ['leadYaDescargo', 'leadInvitaYGana', 'leadFollowup', 'leadElegirVehiculo']) {
    if (/sendSupportVideo|sendSupportButtons/.test(cuerpo(fn))) throw new Error(`${fn} volvió a mandar video o botones`);
  }
  if (/modelo|¿con qué vas a trabajar/i.test(cuerpo('leadYaDescargo'))) throw new Error('volvió la pregunta del vehículo/año');
  const i = src.indexOf('const TEXTO_INVITA_Y_GANA');
  const invita = src.slice(i, src.indexOf(';', i));
  if (invita.length > 400) throw new Error('el "gana invitando" volvió a ser largo');
  if (!/invita_gana_at/.test(cuerpo('leadInvitaYGana'))) throw new Error('el "gana invitando" perdió el "una vez en la vida"');
});

Deno.test('migraciones 319-320: esperas de 15 min y 3 h, un solo recordatorio, invita antes de 24 h', async () => {
  const sql = await Deno.readTextFile(new URL('../../migrations/320_ag_invita_gana_antes_de_24h.sql', import.meta.url));
  for (const s of ["l.paso = 'nombre'", "interval '15 minutes'", "l.paso = 'pitch'", 'l.pidio_codigo_at IS NULL',
                   'l.recordatorio_descarga_at IS NULL', "interval '3 hours'", "'lead_invita_gana'", 'l.invita_gana_at IS NULL',
                   "interval '20 hours'", 'COALESCE(d.wallet_balance, 0) < 10000']) {
    if (!sql.includes(s)) throw new Error(`falta en la migración: ${s}`);
  }
  if (/'20 minutes','3 hours','20 hours'/.test(sql)) throw new Error('volvieron los 3 "¿sigues ahí?"');
  if (/\+ interval '2[1-9] hours'/.test(sql)) throw new Error('el "gana invitando" volvió a salir a las 24 h o más');
});

// Pedido del usuario 2026-10-05: cada link de descarga va precedido, en el mismo mensaje, de "Estamos
// disponibles en Play Store como MOVI TRANSPORTE URBANO, aquí está el link". Corrección del mismo día:
// a la persona NO se le dice nada de "si te da miedo tocar el enlace" (ese era el motivo, no el texto).
Deno.test('cada link de descarga va con "Estamos disponibles en Play Store como MOVI TRANSPORTE URBANO"', () => {
  const lineas = src.split('\n');
  const sinAviso = lineas.map((l, i) => [l, i] as const)
    .filter(([l]) => l.includes('${APP_DOWNLOAD_LINK}') && !l.trim().startsWith('- El link oficial'))
    .filter(([, i]) => !lineas.slice(Math.max(0, i - 2), i + 1).join('\n').includes('ESTAMOS_EN_PLAY_STORE'))
    .map(([l, i]) => `línea ${i + 1}: ${l.trim()}`);
  if (sinAviso.length) throw new Error('\n' + sinAviso.join('\n'));
  const i = src.indexOf('const ESTAMOS_EN_PLAY_STORE');
  const texto = src.slice(i, src.indexOf(';', i));
  if (!/Estamos disponibles en Play Store como \*MOVI TRANSPORTE URBANO\*/.test(texto)) throw new Error('cambió el texto pedido');
  const enviado = lineas.filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
  if (/tocar el enlace|miedo/i.test(enviado.replace(/No digas nada de "si te da miedo tocar el enlace"/, '')))
    throw new Error('volvió el "si te da miedo tocar el enlace" en un mensaje');
});

// Caso real 2026-10-05 (…8217): con un asesor a cargo, el bot calló los textos pero contestó la foto con
// "si son documentos, súbelos en Quiero ser conductor" a un conductor que ya trabaja.
Deno.test('foto sin texto: calla si hay asesor, y a un conductor registrado no le habla de "Quiero ser conductor"', () => {
  const i = src.indexOf("if (!btnId && !msgText.trim()) {");
  const bloque = src.slice(i, src.indexOf('Recibí tu archivo', i));
  if (!/ses\?\.escalated && Date\.now\(\) - escAt < ESCALATION_TTL_MS\) return;/.test(bloque)) throw new Error('la foto ya no respeta al asesor');
  if (!/lookupAgUserBasic\(phone\)/.test(bloque) || !/Vi tu foto/.test(bloque)) throw new Error('el conductor registrado volvió a recibir el texto de documentos');
});

// Caso real 2026-10-05 (…8217): "Mire como llega el servicio y uno sin saber para donde van y cuanto
// colocan" recibió el tutorial de cómo usar la app. La IA tiene la regla para contestar la queja.
Deno.test('la queja de "llega sin saber destino ni precio" tiene su regla en el prompt', () => {
  if (!/se QUEJA o comenta cómo le llega una solicitud/.test(src) || !/origen → destino/.test(src)) throw new Error('falta la regla');
});

// Caso real 2026-10-05 (…5016): "jorge" y luego "caseres" -> al apellido se le respondió "¿En qué te ayudo?".
Deno.test('el apellido en un segundo mensaje se lee como nombre (y el embudo lo deja pasar en silencio)', () => {
  if (f.leeNombreDado('caseres') !== 'Caseres') throw new Error('"caseres" no se reconoce como nombre');
  if (!/lead\.paso === 'pitch' && lead\.nombre_dado && recienLink/.test(src)) throw new Error('falta la regla del apellido');
});
