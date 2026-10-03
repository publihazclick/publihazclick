import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+57${digits}`;
  if (digits.length === 12 && digits.startsWith('57')) return `+${digits}`;
  return `+${digits}`;
}

// ─── Cobertura: por ahora Movi solo opera en Colombia ─────────────────────────
// BUG REAL encontrado 2026-09-10 (al usuario le llegaban por WhatsApp mensajes "necesito mi
// codigo de verificacion" de gente que nunca iba a poder registrarse): la app arma el telefono
// como '+57' + lo que la persona escriba, sin selector de pais. Alguien en Mexico que escribe su
// numero local 3329201647 termina guardado como +573329201647, un numero colombiano que no
// existe -- el SMS se manda al vacio, y el respaldo por WhatsApp tampoco lo encuentra, porque su
// WhatsApp real es 5213329201647. 13 intentos asi desde el 2026-08-04 (Mexico, Argentina,
// EE.UU.), TODOS con used=false: ninguno completo el registro jamas.
//
// Se rechaza antes de insertar la fila y antes de gastar el SMS, con un mensaje honesto en vez
// de dejarlos dando vueltas.
//
// La regla es DELIBERADAMENTE floja -- solo "+57 seguido de 10 digitos que empiecen por 3" -- y
// NO una lista de prefijos validos. Esa lista se intento armar y se descarto a proposito: las
// listas publicadas de prefijos colombianos estan desactualizadas (omiten 319 y 324, que SI
// estan en uso por conductores reales de esta misma base), asi que cualquier allowlist corre el
// riesgo de bloquear a un colombiano legitimo -- mucho peor que dejar pasar a un extranjero.
// Los pocos numeros extranjeros de 10 digitos que empiezan por 3 (Guadalajara 332..., Rosario
// 341...) se cuelan por aca a sabiendas: los atrapa la segunda capa, en ag-whatsapp, donde SI
// se ve el codigo de pais real de quien escribe.
/**
 * Celular de Colombia o Venezuela -> E.164, o null. Desde 2026-10-03 (pedido del usuario:
 * Cúcuta es frontera y el bot ya acepta carros con placa venezolana) también Venezuela, sin
 * selector de país en la app: 0414 123 4567, 414…, 58 414…, 58 0414… y el '+57' que la app le
 * ponía delante a todo (574141234567). Celulares venezolanos: 412, 414, 416, 422, 424, 426.
 * MISMA regla que AgPhoneAuthService.normalizarCelular() en la app; si se cambia una, la otra.
 * Venezuela recibe el código por WhatsApp (plantilla); el SMS queda solo de respaldo.
 */
function normalizarCelular(raw: string): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('3')) return '+57' + d;
  if (d.length === 12 && d.startsWith('573')) return '+' + d;
  let v: string | null = null;
  if (d.length === 11 && d.startsWith('0')) v = d.slice(1);
  else if (d.length === 10) v = d;
  else if (d.length === 12 && (d.startsWith('58') || d.startsWith('57'))) v = d.slice(2);
  else if (d.length === 13 && (d.startsWith('580') || d.startsWith('570'))) v = d.slice(3);
  return v && /^4(1[246]|2[246])\d{7}$/.test(v) ? '+58' + v : null;
}

/** Evolution API usa número sin '+', ej: 573134453649 */
function toWaNumber(e164: string): string {
  return e164.replace('+', '');
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// CAMBIO 2026-07-30 (pedido explicito del usuario): Evolution API en Railway ya no existe
// (Application not found), asi que este fallback nunca funcionaba de verdad (siempre pasaba
// directo a Telnyx en silencio). Reemplazado por OpenWA (C:/Users/MOINS/openwa), la instancia
// de WhatsApp que si esta viva, corriendo local como servicio de Windows y expuesta a internet
// via un tunel de Cloudflare (OPENWA_URL). El tunel actual es un "quick tunnel" (gratis, sin
// cuenta) -- la URL cambia si el proceso de cloudflared se reinicia, hay que actualizar el
// secret OPENWA_URL si eso pasa (ver [[openwa_shutdown_incident]] para el patron de servicio
// NSSM ya usado para el propio OpenWA; el tunel deberia recibir el mismo tratamiento para
// quedar realmente persistente, pendiente).
async function sendViaWhatsApp(phone: string, code: string): Promise<boolean> {
  const apiUrl = Deno.env.get('OPENWA_URL');
  const apiKey = Deno.env.get('OPENWA_API_KEY');
  const sessionId = Deno.env.get('OPENWA_SESSION_ID');
  if (!apiUrl || !apiKey || !sessionId) return false;

  const resp = await fetch(`${apiUrl}/api/sessions/${sessionId}/messages/send-text`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatId: `${toWaNumber(phone)}@c.us`,
      text: `🔐 *Movi - Código de verificación*\n\nTu código es: *${code}*\n\nVálido por 10 minutos. No lo compartas con nadie.`,
    }),
  });

  if (!resp.ok) {
    console.error('WhatsApp OTP error:', resp.status, await resp.text());
    return false;
  }
  return true;
}

// ─── Código automático al WhatsApp del número (plantilla de autenticación) ───────────────
// 2026-10-03, decisión del usuario ("resolvamos de una vez para siempre"): antes, con canal
// 'whatsapp' no se mandaba nada -- la persona tenía que escribirnos desde ESE MISMO número y el
// bot le respondía el código. Medido en 7 días: así entraron ~17, pero se quedaban por fuera los
// de número oculto (…9199 recibió el mismo aviso 6 veces), los que escriben desde otro WhatsApp
// (…3603, "Necesito el código a este wsp business") y los que lo pedían con otras palabras.
// Ahora el código le llega SOLO al WhatsApp del número registrado, con la plantilla aprobada
// movi_codigo_verificacion (botón "Copiar código"). Ya no importa desde dónde escriba.
// Costo: tarifa de autenticación de Meta para Colombia, ~US$0,0009 por código ENTREGADO.
// Si Meta lo rechaza al enviar, se manda SMS en el acto. Si lo acepta pero después no se puede
// entregar (el número no tiene WhatsApp), el acuse "failed" llega a ag-whatsapp y AHÍ se manda
// el SMS de respaldo (ver otpRespaldoSms en ag-whatsapp). El chat con el bot sigue funcionando
// igual que antes, como camino adicional.
const PLANTILLA_OTP = 'movi_codigo_verificacion';

// ─── Seguimiento en tiempo real de cada código (2026-10-03) ──────────────────────────────
// Decisión del usuario: SOLO WhatsApp, sin perder a nadie si WhatsApp falla. Tres capas:
//  1. Al enviar: si Meta rechaza o no responde -> SMS en el acto (abajo, en el handler).
//  2. Por persona: la app pregunta cada pocos segundos el estado de SU código (accion 'estado',
//     con el wamid como referencia). Entregado -> "ya te llegó"; error 131026 de Meta (ese
//     número no tiene WhatsApp) -> se le pide un número con WhatsApp, SIN SMS; 30 s sin entregar
//     -> la app pide 'sms_respaldo' y sale un SMS.
//  3. General: si los 2 últimos códigos no se entregaron (y no por falta de WhatsApp), "modo
//     SMS": los códigos nuevos salen por SMS de una (y también por WhatsApp, para notar cuándo
//     vuelve), y se le avisa al admin por WhatsApp y por SMS. Se apaga solo cuando un código
//     vuelve a entregarse. Sin bandera guardada: se calcula de los acuses de Meta.
// La marca "[sms enviado]" en la fila del log garantiza UN solo SMS por código, la pida la app
// o el acuse de fallo que procesa ag-whatsapp (otpRespaldoSms).
const PREFIJO_LOG_OTP = `[plantilla ${'movi_codigo_verificacion'}]`;
const ESPERA_SMS_SEG = 30;          // la app pide el SMS a los 30 s sin entrega
const ADMIN_PHONE = '+573134453649';

/** Error 131026 de Meta = "Message undeliverable": ese número no tiene WhatsApp (o no puede recibir). */
function esSinWhatsApp(errorMeta: string | null | undefined): boolean {
  return /^\s*131026\b/.test(errorMeta ?? '') || /131026/.test(errorMeta ?? '');
}

type EstadoCodigo = 'entregado' | 'sin_whatsapp' | 'fallido' | 'pendiente' | 'desconocido';

// deno-lint-ignore no-explicit-any
async function estadoCodigo(sb: any, ref: string): Promise<{ estado: EstadoCodigo; segundos: number; sms: boolean; fila: any }> {
  const { data: fila } = await sb.from('ag_wa_message_log')
    .select('id, wa_phone, body, estado_entrega, error_meta, created_at')
    .eq('wamid', ref).like('body', `${PREFIJO_LOG_OTP}%`).maybeSingle();
  if (!fila) return { estado: 'desconocido', segundos: 0, sms: false, fila: null };
  const segundos = Math.round((Date.now() - new Date(fila.created_at).getTime()) / 1000);
  const sms = String(fila.body).includes('[sms enviado]');
  const e = fila.estado_entrega as string | null;
  const estado: EstadoCodigo =
    e === 'entregado' || e === 'leido' ? 'entregado'
    : e === 'fallido' ? (esSinWhatsApp(fila.error_meta) ? 'sin_whatsapp' : 'fallido')
    : 'pendiente';
  return { estado, segundos, sms, fila };
}

/** "Modo SMS": los 2 códigos más recientes con más de 45 s no se entregaron (sin contar 131026). */
// deno-lint-ignore no-explicit-any
async function modoSmsActivo(sb: any): Promise<boolean> {
  const { data } = await sb.from('ag_wa_message_log')
    .select('estado_entrega, error_meta')
    .like('body', `${PREFIJO_LOG_OTP}%`)
    .gte('created_at', new Date(Date.now() - 15 * 60e3).toISOString())
    .lte('created_at', new Date(Date.now() - 45e3).toISOString())
    .order('created_at', { ascending: false })
    .limit(4);
  const resueltos = (data ?? []).filter((r: { estado_entrega: string | null; error_meta: string | null }) =>
    !(r.estado_entrega === 'fallido' && esSinWhatsApp(r.error_meta)));
  if (resueltos.length < 2) return false;
  const noEntregado = (r: { estado_entrega: string | null }) => r.estado_entrega !== 'entregado' && r.estado_entrega !== 'leido';
  return noEntregado(resueltos[0]) && noEntregado(resueltos[1]);
}

/** Aviso al admin (WhatsApp + SMS, porque el WhatsApp puede ser justo lo caído). Uno cada 30 min. */
// deno-lint-ignore no-explicit-any
async function avisarAdminModoSms(sb: any): Promise<void> {
  try {
    const titulo = 'Códigos por WhatsApp NO se están entregando';
    const { data: previo } = await sb.from('ag_admin_notifications').select('id')
      .like('title', `%${titulo}%`).gte('created_at', new Date(Date.now() - 30 * 60e3).toISOString())
      .limit(1).maybeSingle();
    if (previo) return;
    const detalle = 'Los 2 últimos códigos de verificación por WhatsApp no llegaron. Movi pasó a "modo SMS": ' +
      'los códigos nuevos salen por SMS hasta que WhatsApp vuelva a entregar. Revisa Meta (estado de la plantilla movi_codigo_verificacion, token, calidad del número).';
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // ag-whatsapp registra la notificación en ag_admin_notifications (es lo que evita repetir).
    await fetch(`${url}/functions/v1/ag-whatsapp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'admin', event: 'error_alert', data: { context: titulo, message: detalle, kind: 'error' } }),
    }).catch(e => console.error('aviso admin por WhatsApp falló:', e));
    const apiKey = Deno.env.get('TELNYX_API_KEY');
    const from = Deno.env.get('TELNYX_FALLBACK_PHONE_NUMBER') ?? Deno.env.get('TELNYX_PHONE_NUMBER');
    if (apiKey && from) {
      await telnyxPost(apiKey, { from, to: ADMIN_PHONE, text: `Movi: ${titulo}. Paso a modo SMS automatico. Revisa Meta.`, type: 'SMS' }, 'telnyx-admin');
    }
  } catch (e) { console.error('avisarAdminModoSms:', e); }
}

/** Manda el código por SMS (Telnyx; Twilio solo si tuviera credenciales). Si falla, avisa al admin. */
async function enviarSms(phone: string, code: string): Promise<{ ok: boolean; debug?: string }> {
  let r = await sendViaTelnyx(phone, code);
  const telnyxDebug = r.debug;
  if (!r.ok) r = await sendViaTwilio(phone, code);
  if (r.ok) return { ok: true };
  const debug = `${telnyxDebug} || ${r.debug}`;
  await avisarAdminSmsCaido(debug);
  return { ok: false, debug };
}

/**
 * El SMS es el respaldo de WhatsApp: si se cae, nadie se entera hasta que alguien no puede entrar.
 * Pasó de verdad: el 2026-10-03, al probar el respaldo, Telnyx respondió 20012 "Account inactive"
 * (sin saldo) -- ningún SMS salía y no había ninguna alarma. Ahora se avisa por WhatsApp al admin,
 * una vez cada 2 horas.
 */
async function avisarAdminSmsCaido(debug: string): Promise<void> {
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const titulo = 'El SMS de respaldo NO está funcionando';
    const { data: previo } = await sb.from('ag_admin_notifications').select('id')
      .like('title', `%${titulo}%`).gte('created_at', new Date(Date.now() - 2 * 3600e3).toISOString())
      .limit(1).maybeSingle();
    if (previo) return;
    const sinSaldo = /20012|inactive|out of funds/i.test(debug);
    const detalle = sinSaldo
      ? 'Telnyx dice que la cuenta está INACTIVA (sin saldo). Recarga Telnyx: si WhatsApp falla, nadie podrá recibir el código.'
      : `El SMS de un código de verificación no salió: ${debug.slice(0, 300)}`;
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ag-whatsapp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'admin', event: 'error_alert', data: { context: titulo, message: detalle, kind: 'error' } }),
    });
  } catch (e) { console.error('avisarAdminSmsCaido:', e); }
}

async function sendViaWhatsAppTemplate(
  // deno-lint-ignore no-explicit-any
  sb: any, phoneE164: string, code: string,
): Promise<{ ok: boolean; debug?: string; wamid?: string | null }> {
  const token = Deno.env.get('META_WA_TOKEN');
  const phoneNumberId = Deno.env.get('META_WA_PHONE_NUMBER_ID');
  if (!token || !phoneNumberId) return { ok: false, debug: 'meta: falta secret' };
  const to = toWaNumber(phoneE164);
  let res: Response;
  try {
    // 8 s como máximo: si Meta está caída y no contesta, se pasa al SMS en vez de dejar a la
    // persona mirando "Preparando tu código…" (capa 1 del seguimiento).
    res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      signal: AbortSignal.timeout(8000),
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'template',
        template: {
          name: PLANTILLA_OTP, language: { code: 'es' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }),
    });
  } catch (e) {
    return { ok: false, debug: `meta fetch: ${String(e).slice(0, 200)}` };
  }
  const body = await res.text();
  let wamid: string | null = null;
  try { wamid = JSON.parse(body)?.messages?.[0]?.id ?? null; } catch { /* sin wamid */ }
  // Se registra con el wamid: así el acuse de Meta (entregado / fallido) se casa con esta fila y
  // ag-whatsapp sabe cuándo mandar el SMS de respaldo. El cuerpo NO lleva el código.
  await sb.from('ag_wa_message_log').insert({
    wa_phone: to, role: 'pasajero', direction: 'out', msg_type: 'template', sent_by: 'sistema',
    body: `[plantilla ${PLANTILLA_OTP}] código automático desde la app`,
    wamid, estado_entrega: res.ok ? 'aceptado' : 'fallido',
    error_meta: res.ok ? null : body.slice(0, 500),
  });
  if (!res.ok) {
    console.error('WhatsApp plantilla OTP error:', res.status, body.slice(0, 300));
    return { ok: false, debug: `meta ${res.status}: ${body.slice(0, 300)}`, wamid };
  }
  return { ok: true, wamid };
}

/** Un solo intento contra la API de Telnyx. Devuelve el error crudo para poder diagnosticarlo. */
async function telnyxPost(apiKey: string, payload: Record<string, string>, etiqueta: string): Promise<{ ok: boolean; debug?: string }> {
  const res = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Telnyx error (${etiqueta}):`, err);
    return { ok: false, debug: `${etiqueta} ${res.status}: ${err.slice(0, 300)}` };
  }
  return { ok: true };
}

async function sendViaTelnyx(phone: string, code: string): Promise<{ ok: boolean; debug?: string }> {
  const apiKey    = Deno.env.get('TELNYX_API_KEY');
  const fromSender = Deno.env.get('TELNYX_SENDER_ID') ?? Deno.env.get('TELNYX_PHONE_NUMBER');
  if (!apiKey || !fromSender) return { ok: false, debug: `telnyx: falta secret (apiKey=${!!apiKey}, from=${!!fromSender})` };

  const text = `Tu código de verificación Movi es: ${code}. Válido por 10 minutos.`;

  // INTENTO 1 -- perfil propio de Movi (remitente alfanumérico "MOVI").
  // No incluir messaging_profile_id: el número ya está asignado a su perfil en Telnyx,
  // y enviarlo explícito rompe la sustitución automática de remitente alfanumérico para CO.
  const primario = await telnyxPost(apiKey, {
    from: fromSender,
    to: phone,
    text,
    type: 'SMS',
  }, 'telnyx');
  if (primario.ok) return { ok: true };

  // INTENTO 2 -- perfil de respaldo (BUG REAL encontrado 2026-09-01, conductor Henry Silva
  // +573116510426 bloqueado en el registro). Telnyx rechazaba con 40305 "Alphanumeric sender ID
  // MOVI is not supported for the destination number": en Colombia cada remitente alfanumérico
  // tiene que estar registrado con cada operador, y "MOVI" no lo está para todos -- por eso el
  // SMS llegaba a unos números y a otros no, de forma aparentemente aleatoria. Esto NO era falta
  // de saldo (la cuenta estaba activa y recargada cuando se diagnosticó).
  //
  // El respaldo usa el numero de SMS Masivos (perfil con remitente "Publihaz"), ya registrado y
  // con entrega comprobada en Colombia. Se manda SOLO el numero en from: Telnyx resuelve el
  // perfil a partir de el y aplica la sustitucion de remitente alfanumerico. NO mandar
  // messaging_profile_id junto con from (falla 40306, ver [[telnyx_messaging_profile_bug]]) ni
  // solo el perfil sin from (falla 40321 "Number Pool is not enabled", comprobado en vivo
  // 2026-09-01). El usuario final ve "Publihaz" y no "MOVI" como remitente, cosa preferible a
  // quedarse sin poder registrarse.
  const numeroRespaldo = Deno.env.get('TELNYX_FALLBACK_PHONE_NUMBER');
  if (!numeroRespaldo) return primario;

  const respaldo = await telnyxPost(apiKey, {
    from: numeroRespaldo,
    to: phone,
    text,
    type: 'SMS',
  }, 'telnyx-respaldo');
  if (respaldo.ok) return { ok: true };

  return { ok: false, debug: `${primario.debug} || ${respaldo.debug}` };
}

async function sendViaTwilio(phone: string, code: string): Promise<{ ok: boolean; debug?: string }> {
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from  = Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!sid || !token || !from) return { ok: false, debug: `twilio: falta secret (sid=${!!sid}, token=${!!token}, from=${!!from})` };

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: from, To: phone,
      Body: `Tu código de verificación Movi es: ${code}. Válido por 10 minutos.`,
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Twilio error:', err);
    return { ok: false, debug: `twilio ${res.status}: ${err.slice(0, 300)}` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // BUG REAL encontrado 2026-08-20 (pedido explicito del usuario, "Edge function returned a
  // non-2xx status code" aparecia en la pantalla de conductores reales): el cliente supabase-js
  // (functions.invoke) descarta el body JSON por completo cuando el status HTTP no es 2xx --
  // deja data en null y solo expone ese mensaje generico en ingles como error.message, sin
  // importar que tan claro fuera el mensaje en español que mandaba esta funcion. Antes CADA
  // caso de error de aca (telefono invalido, demasiados intentos, fallo de envio, etc.) devolvia
  // 400/429/500, asi que NINGUNO de esos mensajes en español llegaba nunca al usuario -- siempre
  // veian el generico en ingles. Ahora todos los casos de error devuelven 200 (igual que ya hacia
  // ag-otp-verify correctamente), con { error: '...' } en el body -- asi el cliente SI recibe el
  // mensaje real.
  try {
    // canal: 'whatsapp' (2026-10-01) -> se deja lista la fila del código pero NO se manda SMS: la
    // app abre WhatsApp y el bot (ag-whatsapp, handleOtpCodeRequest) entrega el código por ahí.
    // Medido en 30 días: por WhatsApp entra el 88% de quienes reciben el código, por SMS el 70%
    // (16 personas pidieron SMS y nunca entraron). Sin canal = SMS, como siempre: las versiones
    // de la app que no mandan este campo siguen igual.
    const { phone, canal, accion, ref } = await req.json();

    // ── Seguimiento de un código ya enviado (ver bloque "Seguimiento en tiempo real") ──
    // `ref` es el wamid que devolvió el envío: no se puede adivinar, así que nadie consulta ni
    // dispara SMS de un código ajeno.
    if (accion === 'estado' || accion === 'sms_respaldo') {
      if (!ref || typeof ref !== 'string') return json({ error: 'ref requerida' });
      const sbS = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const st = await estadoCodigo(sbS, ref);
      if (accion === 'estado') return json({ ok: true, estado: st.estado, segundos: st.segundos, sms: st.sms });

      // sms_respaldo: solo si NO se entregó, NO es un número sin WhatsApp, ya pasó la espera
      // (o Meta dijo que falló) y todavía no se mandó un SMS para este código.
      if (!st.fila) return json({ ok: false, estado: st.estado });
      if (st.sms) return json({ ok: true, enviado: false, ya_enviado: true, estado: st.estado });
      const procede = st.estado === 'fallido' || (st.estado === 'pendiente' && st.segundos >= ESPERA_SMS_SEG - 3);
      if (!procede) return json({ ok: true, enviado: false, estado: st.estado });
      const { data: marcada } = await sbS.from('ag_wa_message_log')
        .update({ body: `${st.fila.body} [sms enviado]` })
        .eq('id', st.fila.id).not('body', 'like', '%[sms enviado]%').select('id');
      if (!marcada?.length) return json({ ok: true, enviado: false, ya_enviado: true, estado: st.estado });
      const tel = `+${st.fila.wa_phone}`;
      const codeS = String(Math.floor(100000 + Math.random() * 900000));
      await sbS.from('ag_otp_codes').insert({
        phone: tel, code_hash: await sha256(codeS), expires_at: new Date(Date.now() + 10 * 60e3).toISOString(),
      });
      const envio = await enviarSms(tel, codeS);
      if (!envio.ok) console.error('SMS de respaldo falló:', envio.debug);
      return json({ ok: envio.ok, enviado: envio.ok, estado: st.estado });
    }

    if (!phone) return json({ error: 'phone requerido' });

    // Colombia o Venezuela (ver normalizarCelular). Si no es ninguno, se rechaza abajo con el
    // aviso de cobertura, antes de insertar la fila y antes de gastar un mensaje.
    const celular = normalizarCelular(phone);
    const normalized = celular ?? toE164(phone);
    if (normalized.length < 10) return json({ error: 'Número de teléfono inválido' });

    // Fuera de cobertura: se corta ACA, antes de insertar la fila en ag_otp_codes y antes de
    // gastar un SMS que no va a llegar a ninguna parte. El flag `fuera_de_cobertura` es lo que
    // mira la app para tratarlo como error duro del formulario y NO ofrecer el respaldo por
    // WhatsApp -- que en este caso tampoco funcionaria y solo alargaria la frustracion.
    if (!celular) {
      return json({
        error: 'Escribe tu celular de Colombia 🇨🇴 o Venezuela 🇻🇪 (ej: 300 123 4567 o 0414 123 4567).',
        fuera_de_cobertura: true,
      });
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Rate limit: máximo 8 códigos por número en los últimos 10 minutos. Era 3, pero desde
    // 2026-10-01 en la misma tabla también caen los códigos que entrega el bot por WhatsApp (y la
    // plantilla del número oculto): un conductor real (…027, 2026-10-02) pidió 5 en 6 minutos y
    // la app le habría respondido "Demasiados intentos" justo cuando intentaba entrar.
    const { count } = await sb
      .from('ag_otp_codes')
      .select('id', { count: 'exact', head: true })
      .eq('phone', normalized)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    if ((count ?? 0) >= 8) {
      return json({ error: 'Demasiados intentos. Espera unos minutos.' });
    }

    // TEST_PHONE_NUMBERS (2026-07-30, pedido explicito del usuario): el numero de pruebas real
    // del usuario reinstala la app constantemente durante desarrollo, lo que borra la sesion
    // guardada y dispara un SMS real cada vez (gasta saldo de Telnyx sin necesidad). Para estos
    // numeros especificos se usa un codigo fijo y NO se manda ningun SMS/WhatsApp real -- el login
    // sigue funcionando exactamente igual (mismo flujo de verificacion), solo que el codigo
    // siempre es el mismo y no cuesta nada. NUNCA agregar aca un numero real de un usuario final.
    const TEST_PHONE_NUMBERS: Record<string, string> = {
      '+573134453649': '111111',
    };
    const isTestPhone = normalized in TEST_PHONE_NUMBERS;

    // Generar código de 6 dígitos (o usar el fijo de prueba)
    const code = isTestPhone ? TEST_PHONE_NUMBERS[normalized] : String(Math.floor(100000 + Math.random() * 900000));
    const hash = await sha256(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // CAMBIO 2026-10-02: ya NO se invalidan los códigos anteriores vigentes. Caso real (…027):
    // recibió el código por WhatsApp, volvió a la app, la app pidió otro, y ESE borrado dejaba
    // inválido el que tenía en la mano -- 5 códigos y ninguno le sirvió. ag-otp-verify acepta
    // cualquiera vigente y al usar uno cierra los demás. Solo se limpian los vencidos.
    await sb.from('ag_otp_codes').delete().eq('phone', normalized).eq('used', false).lt('expires_at', new Date().toISOString());

    // Insertar nuevo código
    const { error: insertError } = await sb.from('ag_otp_codes').insert({
      phone: normalized,
      code_hash: hash,
      expires_at: expiresAt,
    });
    if (insertError) {
      console.error('Insert error:', insertError);
      return json({ error: 'Error interno' });
    }

    if (isTestPhone) return json({ ok: true });

    // WhatsApp primero: el código sale solo al WhatsApp del número (ver sendViaWhatsAppTemplate).
    // La fila ya quedó, así que el camino viejo (escribirle al bot) también sigue sirviendo.
    // Si Meta lo rechaza en el acto, cae al SMS de abajo sin que la persona tenga que hacer nada.
    if (canal === 'whatsapp') {
      // Capa 3: "modo SMS" si WhatsApp no viene entregando. Igual se manda la plantilla (para
      // notar cuándo WhatsApp vuelve y salir solo del modo), pero el SMS sale de una.
      const enModoSms = await modoSmsActivo(sb);
      const wa = await sendViaWhatsAppTemplate(sb, normalized, code);
      if (wa.ok && !enModoSms) return json({ ok: true, canal: 'whatsapp', ref: wa.wamid ?? null });
      if (enModoSms) {
        await avisarAdminModoSms(sb);
        // Marca el código para que ni la app ni el acuse de fallo manden un segundo SMS.
        if (wa.wamid) {
          await sb.from('ag_wa_message_log').update({ body: `${PREFIJO_LOG_OTP} código automático desde la app [sms enviado] [modo sms]` })
            .eq('wamid', wa.wamid);
        }
      } else {
        console.error('Plantilla OTP rechazada, se pasa a SMS:', wa.debug);
      }
      const sms = await enviarSms(normalized, code);
      if (sms.ok) return json({ ok: true, canal: 'sms', ref: wa.wamid ?? null, motivo: enModoSms ? 'modo_sms' : 'whatsapp_fallo' });
      // Si ni el SMS salió pero la plantilla sí, la persona igual tiene el código por WhatsApp.
      if (wa.ok) return json({ ok: true, canal: 'whatsapp', ref: wa.wamid ?? null });
      return json({ error: 'No se pudo enviar el código. Intenta de nuevo en un minuto.' });
    }

    // CAMBIO 2026-07-30 (pedido explicito del usuario): WhatsApp via OpenWA reportaba envio
    // exitoso (201, messageId real) sin que el mensaje llegara de verdad en varios casos reales
    // (sesion "vendedoreslocales" vieja Y la sesion "bod" nueva con un pasajero real) -- causa
    // no confirmada del todo (posible desincronizacion de claves de cifrado tras reconexiones).
    // El usuario pidio pausar WhatsApp por completo y dejar SOLO SMS (Telnyx, sender "Publihaz",
    // confirmado funcionando para CO por soporte de Telnyx) como unico canal, priorizando
    // confiabilidad sobre costo cero. sendViaWhatsApp queda sin usar pero no se borra, por si se
    // retoma mas adelante (ver [[movi_otp_whatsapp_openwa]]).
    let result = await sendViaTelnyx(normalized, code);
    const telnyxDebug = result.debug;
    if (!result.ok) result = await sendViaTwilio(normalized, code);
    if (!result.ok) await avisarAdminSmsCaido(`${telnyxDebug} || ${result.debug}`);

    if (!result.ok) {
      // Diagnostico temporal 2026-09-01 (usuario real bloqueado, "No se pudo enviar el
      // codigo" en ambos proveedores): con ?debug=1 en la URL se incluye el error real de
      // cada proveedor en la respuesta, para diagnosticar sin adivinar. NUNCA depende de esto
      // el usuario final -- la app no manda ese query param, solo se usa a mano para depurar.
      const url = new URL(req.url);
      if (url.searchParams.get('debug') === '1') {
        return json({ error: 'No se pudo enviar el código. Intenta de nuevo.', debug: { telnyx: telnyxDebug, twilio: result.debug } });
      }
      return json({ error: 'No se pudo enviar el código. Intenta de nuevo.' });
    }

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'Error interno' });
  }
});
