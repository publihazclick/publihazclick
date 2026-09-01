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

async function sendViaTelnyx(phone: string, code: string): Promise<{ ok: boolean; debug?: string }> {
  const apiKey    = Deno.env.get('TELNYX_API_KEY');
  const fromSender = Deno.env.get('TELNYX_SENDER_ID') ?? Deno.env.get('TELNYX_PHONE_NUMBER');
  if (!apiKey || !fromSender) return { ok: false, debug: `telnyx: falta secret (apiKey=${!!apiKey}, from=${!!fromSender})` };

  // No incluir messaging_profile_id: el número ya está asignado a su perfil en Telnyx,
  // y enviarlo explícito rompe la sustitución automática de remitente alfanumérico para CO.
  const payload: Record<string, string> = {
    from: fromSender,
    to: phone,
    text: `Tu código de verificación Movi es: ${code}. Válido por 10 minutos.`,
    type: 'SMS',
  };

  const res = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  // BUG REAL encontrado 2026-08-20: esto lanzaba una excepción en vez de devolver false, así que
  // cualquier falla de Telnyx (saldo, rate limit, error transitorio) saltaba DIRECTO al catch
  // general de Deno.serve (abajo) sin pasar nunca por el fallback a Twilio de la línea 174 --
  // ese fallback era código muerto, nunca se ejecutaba. Ahora sendViaTelnyx falla igual que
  // sendViaWhatsApp/sendViaTwilio (devuelve false), así que el fallback real sí corre.
  if (!res.ok) {
    const err = await res.text();
    console.error('Telnyx error:', err);
    return { ok: false, debug: `telnyx ${res.status}: ${err.slice(0, 300)}` };
  }
  return { ok: true };
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
    const { phone } = await req.json();
    if (!phone) return json({ error: 'phone requerido' });

    const normalized = toE164(phone);
    if (normalized.length < 10) return json({ error: 'Número de teléfono inválido' });

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Rate limit: máximo 3 códigos por número en los últimos 10 minutos
    const { count } = await sb
      .from('ag_otp_codes')
      .select('id', { count: 'exact', head: true })
      .eq('phone', normalized)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    if ((count ?? 0) >= 3) {
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

    // Invalidar códigos anteriores del mismo número
    await sb.from('ag_otp_codes').delete().eq('phone', normalized).eq('used', false);

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
