// ════════════════════════════════════════════════════════════════════════════
// informe-conductores — revisión horaria de las conversaciones del número de
// conductores (2026-10-01, pedido del usuario: "monitorea lo que sucede en cada
// conversación para ir mejorando", con el informe por WhatsApp).
//
// La revisión la hace una tarea programada en la nube (claude.ai/code/routines),
// que NO tiene acceso a la base ni a las llaves de Meta. Esta función es su
// único punto de contacto, y por eso hace solo dos cosas:
//
//   POST { accion: 'datos', desde?: ISO }   -> conversaciones, embudo, fallos...
//                                              desde `desde` (por defecto 1 hora atrás).
//   POST { accion: 'enviar', texto }        -> manda `texto` por WhatsApp al admin
//                                              desde el número principal de Movi.
//
// SOLO LECTURA sobre la base: nunca escribe ni modifica nada de los leads.
// Protegida con el header `x-informe-key` (secret INFORME_KEY). Si esa clave se
// filtra, lo máximo que se puede hacer es leer este resumen y mandarle mensajes
// al admin -- nunca a un lead ni a un conductor.
//
// Límite de WhatsApp que manda sobre todo: solo se entrega texto libre si el
// admin le escribió al número principal en las últimas 24 h. El usuario eligió
// NO usar plantilla (2026-10-01), así que fuera de esa ventana Meta responde
// 200 y descarta en silencio. `ventana_abierta` en la respuesta lo dice antes
// de enviar, para que el informe no se dé por entregado cuando no lo fue.
// ════════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WA_TOKEN        = Deno.env.get('META_WA_TOKEN')!;
const PHONE_NUMBER_ID = Deno.env.get('META_WA_PHONE_NUMBER_ID')!;
const INFORME_KEY     = Deno.env.get('INFORME_KEY') ?? '';
// El celular del usuario ES el número de admin (mismo SUPPORT_PHONE de ag-whatsapp).
const ADMIN_PHONE     = '573134453649';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Lo mismo que el script local de revisión (monitor.ts), en una sola respuesta. */
async function datos(desde: string) {
  const hasta = new Date().toISOString();

  const { data: embudo } = await db.from('ag_driver_leads_embudo_v')
    .select('dia, leads, dieron_nombre, motos, carros, sin_vehiculo, modelo_no_sirve, llegaron_al_link, registrados, con_primer_viaje, pidieron_humano')
    .order('dia', { ascending: false }).limit(2);

  // Teléfonos con actividad en el período, en el número de conductores.
  const { data: activos } = await db.from('ag_wa_message_log')
    .select('wa_phone').eq('role', 'conductor').gt('created_at', desde).lte('created_at', hasta);
  const telefonos = [...new Set((activos ?? []).map(r => r.wa_phone as string))];

  // 2 horas de contexto antes del período, para entender lo que pasa ahora.
  const contexto = new Date(new Date(desde).getTime() - 2 * 3600e3).toISOString();
  const conversaciones = [];
  for (const tel of telefonos) {
    const [{ data: lead }, { data: msgs }] = await Promise.all([
      db.from('ag_driver_leads')
        .select('paso, vehiculo, modelo_ok, nombre_dado, wa_name, origen, nudges_enviados, no_insistir, registrado_at, created_at')
        .eq('wa_phone', tel).maybeSingle(),
      db.from('ag_wa_message_log')
        .select('created_at, direction, msg_type, body, sent_by, estado_entrega, error_meta')
        .eq('role', 'conductor').eq('wa_phone', tel).gt('created_at', contexto)
        .order('created_at').limit(80),
    ]);
    conversaciones.push({
      // Solo los últimos 3 dígitos: el informe no necesita el número completo.
      tel: `…${tel.slice(-3)}`,
      lead,
      mensajes: (msgs ?? []).map(m => ({
        hora: m.created_at,
        nuevo: (m.created_at as string) > desde,
        de: m.direction === 'in' ? 'persona' : (m.sent_by ?? 'bot'),
        tipo: m.msg_type,
        texto: String(m.body ?? '').slice(0, 600),
        entrega: m.direction === 'out' ? (m.estado_entrega ?? 'sin acuse') : undefined,
        error: m.error_meta ? JSON.stringify(m.error_meta).slice(0, 200) : undefined,
      })),
    });
  }

  const [{ data: faq_no_respondidas }, { data: videos }, { data: faq_pendientes_admin }] = await Promise.all([
    db.from('ag_wa_support_log').select('created_at, wa_phone, action, question, answer_text')
      .gt('created_at', desde).neq('action', 'answer').order('created_at'),
    db.from('ag_wa_video_envios').select('enviado_at, wa_phone, clave, motivo, ok, detalle')
      .gt('enviado_at', desde).order('enviado_at'),
    db.from('ag_wa_faq_aprendido').select('created_at, pregunta').eq('estado', 'pendiente').order('created_at'),
  ]);

  return {
    desde, hasta, embudo, conversaciones,
    faq_no_respondidas: (faq_no_respondidas ?? []).map(r => ({ ...r, wa_phone: `…${String(r.wa_phone).slice(-3)}` })),
    videos: (videos ?? []).map(r => ({ ...r, wa_phone: `…${String(r.wa_phone).slice(-3)}` })),
    faq_pendientes_admin,
    ventana_abierta: await ventanaAbierta(),
  };
}

/** ¿El admin le escribió al número principal en las últimas 24 h? (ver nota arriba) */
async function ventanaAbierta(): Promise<boolean> {
  const { data } = await db.from('ag_wa_message_log').select('created_at')
    .eq('wa_phone', ADMIN_PHONE).eq('role', 'pasajero').eq('direction', 'in')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return false;
  // 23 h y no 24: margen para que el informe no salga justo cuando la ventana se cierra.
  return Date.now() - new Date(data.created_at as string).getTime() < 23 * 3600e3;
}

/** WhatsApp corta el texto a 4096 caracteres: se parte por párrafos. */
function partir(texto: string, max = 3800): string[] {
  const partes: string[] = [];
  let actual = '';
  for (const p of texto.split('\n\n')) {
    if ((actual + '\n\n' + p).length > max && actual) { partes.push(actual); actual = p; }
    else actual = actual ? `${actual}\n\n${p}` : p;
  }
  if (actual) partes.push(actual);
  return partes.flatMap(p => p.length <= max ? [p] : p.match(new RegExp(`[\\s\\S]{1,${max}}`, 'g'))!);
}

async function enviar(texto: string) {
  const abierta = await ventanaAbierta();
  const resultados = [];
  for (const parte of partir(texto)) {
    const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: ADMIN_PHONE, type: 'text', text: { body: parte, preview_url: false } }),
    });
    const j = await r.json().catch(() => ({}));
    resultados.push({ ok: r.ok, wamid: j?.messages?.[0]?.id ?? null, error: r.ok ? null : j });
  }
  // `ok` de Meta NO es "le llegó": fuera de la ventana también responde 200.
  return { ventana_abierta: abierta, partes: resultados.length, resultados };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Solo POST' }, 405);
  if (!INFORME_KEY || req.headers.get('x-informe-key') !== INFORME_KEY) return json({ error: 'No autorizado' }, 401);

  let body: { accion?: string; desde?: string; texto?: string };
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  try {
    if (body.accion === 'datos') {
      const desde = body.desde && !isNaN(Date.parse(body.desde))
        ? new Date(body.desde).toISOString()
        : new Date(Date.now() - 3600e3).toISOString();
      return json(await datos(desde));
    }
    if (body.accion === 'enviar') {
      const texto = (body.texto ?? '').trim();
      if (!texto) return json({ error: 'Falta el texto' }, 400);
      return json(await enviar(texto));
    }
    return json({ error: "accion debe ser 'datos' o 'enviar'" }, 400);
  } catch (e) {
    console.error('[informe-conductores]', e);
    return json({ error: 'Error interno', detalle: String(e).slice(0, 300) }, 500);
  }
});
