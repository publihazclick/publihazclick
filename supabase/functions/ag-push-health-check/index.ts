// ============================================================================
// ag-push-health-check — Chequeo diario de conductores sin notificaciones
// ============================================================================
//
// POR QUÉ EXISTE
// --------------
// Un conductor sin token FCM en ag_push_subs es invisible para el reparto de
// viajes: las 3 ramas de ag_notify_drivers_on_trip_request lo excluyen. Y hoy
// NADA avisa cuando eso pasa — ni al conductor ni a nosotros.
//
// El caso que lo motivó: ANDRES (+573145697734) se registró el 29-ago, pagó
// $10.000 de recarga y estuvo 4 días y medio sin recibir una sola solicitud.
// Al auditar, 8 de 45 conductores estaban igual: saldo $0, cero ofertas, cero
// posibilidad de trabajar. Ver migración 261 para el detalle completo.
//
// QUÉ HACE, EN ORDEN
// ------------------
//   1. Pide el diagnóstico a ag_push_health_report() (una sola fuente de
//      verdad, compartida con el panel admin).
//   2. Le manda un SMS al conductor afectado explicándole cómo reactivar las
//      notificaciones.
//   3. Le manda a administración un resumen por WhatsApp.
//   4. Guarda el snapshot en ag_push_health_checks para ver la tendencia.
//
// POR QUÉ SMS Y NO WHATSAPP PARA EL CONDUCTOR
// -------------------------------------------
// WhatsApp fuera de la ventana de 24h exige plantilla aprobada por Meta, y
// estos conductores justamente NO nos han escrito (por eso están perdidos).
// Telnyx ya está configurado y funcionando para los OTP, no depende de
// ventanas ni aprobaciones, y llega a un teléfono que sabemos que existe
// porque verificó el registro con él. Para el resumen a administración sí se
// usa WhatsApp, vía la plantilla trip_error_alert que ya está aprobada.
//
// MODO SIMULACIÓN
// ---------------
// Por defecto NO manda nada (dry_run = true). Hay que pasar {"dry_run": false}
// explícito para que salgan mensajes reales. Es a propósito: esto le escribe a
// personas de verdad, y un bug acá se traduce en spam a la flota. El cron pasa
// el flag explícito una vez que el comportamiento está verificado.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Enlace corto y estable a la app. Se manda en el SMS para que el conductor
// tenga a dónde ir sin buscar. Play Store y no APK suelto: ver la decisión ya
// tomada en movi_play_store_launch.
const APP_URL = 'https://play.google.com/store/apps/details?id=com.publihazclick.movi';

interface Afectado {
  driver_id: string;
  nombre: string | null;
  telefono: string;
  ciudad: string | null;
  vehiculo: string;
  status: string;
  motivo: string;
  saldo: number | null;
  ofertas: number;
  avisos_previos: number;
}

// ─── SMS por Telnyx ─────────────────────────────────────────────────────────
// Un solo POST a Telnyx. NO se manda messaging_profile_id junto con from,
// porque rompe la sustitución del remitente alfanumérico en Colombia (bug real
// documentado en telnyx_messaging_profile_bug). El número resuelve su perfil
// solo.
async function telnyxPost(apiKey: string, from: string, to: string, text: string)
  : Promise<{ ok: boolean; detalle?: string }> {
  try {
    const resp = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, text, type: 'SMS' }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error('[push-health] Telnyx error:', resp.status, err);
      return { ok: false, detalle: `Telnyx ${resp.status}: ${err.slice(0, 180)}` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[push-health] Telnyx fetch error:', e);
    return { ok: false, detalle: String(e).slice(0, 180) };
  }
}

// Dos intentos, igual que ag-otp-send. Comprobado en vivo acá el 2026-09-03:
// el remitente "MOVI" fue rechazado por los 8 destinos con 40305 "Alphanumeric
// sender ID MOVI is not supported for the destination number". En Colombia
// cada remitente alfanumérico tiene que estar registrado con cada operador y
// "MOVI" no lo está para todos — por eso unos SMS llegan y otros no, de forma
// aparentemente aleatoria. NO es falta de saldo.
//
// El respaldo usa el número de SMS Masivos (remitente "Publihaz"), ya
// registrado y con entrega comprobada. El conductor ve "Publihaz" en vez de
// "MOVI", cosa preferible a no recibir nada.
async function enviarSms(telefono: string, texto: string): Promise<{ ok: boolean; detalle?: string }> {
  const apiKey = Deno.env.get('TELNYX_API_KEY');
  const from   = Deno.env.get('TELNYX_PHONE_NUMBER');
  if (!apiKey || !from) return { ok: false, detalle: 'Telnyx sin configurar' };

  const primario = await telnyxPost(apiKey, from, telefono, texto);
  if (primario.ok) return primario;

  const respaldo = Deno.env.get('TELNYX_FALLBACK_PHONE_NUMBER');
  if (!respaldo) return primario;

  const segundo = await telnyxPost(apiKey, respaldo, telefono, texto);
  if (segundo.ok) return segundo;

  return { ok: false, detalle: `${primario.detalle} || ${segundo.detalle}` };
}

// El SMS tiene que caber cómodo y ser accionable: qué pasa, qué hacer, dónde.
// Sin jerga técnica — "token FCM" no significa nada para un conductor.
function textoParaConductor(nombre: string | null): string {
  const saludo = nombre ? `${nombre.split(' ')[0]}, ` : '';
  return `Movi: ${saludo}tus notificaciones estan apagadas y por eso no te llegan las solicitudes de viaje. `
       + `Abre la app, entra como conductor y activa "En linea". Si Android te pide permiso de notificaciones, acepta. `
       + `Ayuda: ${APP_URL}`;
}

// ─── Resumen a administración por WhatsApp ──────────────────────────────────
// Reutiliza ag-whatsapp con to:'admin', que ya resuelve el número de soporte
// server-side y usa la plantilla aprobada trip_error_alert con respaldo a texto
// libre si Meta la rechaza.
async function avisarAdmin(contexto: string, detalle: string): Promise<boolean> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/ag-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        to: 'admin',
        event: 'error_alert',
        data: { context: contexto, message: detalle },
      }),
    });
    return resp.ok;
  } catch (e) {
    console.error('[push-health] avisarAdmin error:', e);
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // El cron invoca sin body; cualquier cuerpo inválido cae en simulación, que
  // es el lado seguro del error.
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* sin body = simulación */ }

  const dryRun = body.dry_run !== false;   // hay que pedir false explícito
  const soloReporte = body.solo_reporte === true; // diagnóstico sin avisar a nadie

  // ─── 1. Diagnóstico ───────────────────────────────────────────────────────
  const { data: reporte, error: errReporte } = await supabase.rpc('ag_push_health_report', {
    p_dias_max_aviso: 7,
    p_max_avisos: 3,
  });

  if (errReporte || !reporte) {
    console.error('[push-health] Falló ag_push_health_report:', errReporte);
    return json({ error: 'No se pudo generar el reporte', detalle: errReporte?.message }, 500);
  }

  const afectados: Afectado[] = (reporte.afectados ?? []) as Afectado[];
  const aAvisar:   Afectado[] = (reporte.a_avisar ?? []) as Afectado[];

  if (soloReporte) {
    return json({ modo: 'solo_reporte', reporte });
  }

  // ─── 2. Avisar a cada conductor ───────────────────────────────────────────
  const resultados: Array<{ nombre: string | null; telefono: string; ok: boolean; detalle?: string }> = [];

  for (const c of aAvisar) {
    if (dryRun) {
      // En simulación se registra igual, con canal 'simulado' y enviado_ok=false,
      // para que NO cuente contra el tope de 3 avisos reales del conductor.
      await supabase.rpc('ag_push_health_log_alert', {
        p_driver_id: c.driver_id,
        p_motivo: c.motivo,
        p_canal: 'simulado',
        p_ok: false,
        p_detalle: 'Simulación — no se envió nada',
      });
      resultados.push({ nombre: c.nombre, telefono: c.telefono, ok: false, detalle: 'simulado' });
      continue;
    }

    const envio = await enviarSms(c.telefono, textoParaConductor(c.nombre));
    await supabase.rpc('ag_push_health_log_alert', {
      p_driver_id: c.driver_id,
      p_motivo: c.motivo,
      p_canal: 'sms',
      p_ok: envio.ok,
      p_detalle: envio.detalle ?? null,
    });
    resultados.push({ nombre: c.nombre, telefono: c.telefono, ok: envio.ok, detalle: envio.detalle });
  }

  const enviadosOk = resultados.filter((r) => r.ok).length;

  // ─── 3. Resumen a administración ──────────────────────────────────────────
  // Solo se avisa si hay algo que reportar. Un cron que manda "todo bien" a
  // diario se vuelve ruido y se deja de leer.
  let adminAvisado = false;
  if (afectados.length > 0) {
    const lista = afectados
      .slice(0, 10)
      .map((c) => `• ${c.nombre ?? 'sin nombre'} (${c.telefono}) — ${c.vehiculo}, ${c.ciudad ?? 'sin ciudad'}`)
      .join('\n');
    const extra = afectados.length > 10 ? `\n…y ${afectados.length - 10} más` : '';
    const modo = dryRun ? ' [SIMULACIÓN — no se envió ningún SMS]' : '';

    adminAvisado = await avisarAdmin(
      'Conductores sin notificaciones',
      `${afectados.length} de ${reporte.total} conductores no pueden recibir solicitudes porque no tienen `
      + `notificaciones activas. Se avisó por SMS a ${enviadosOk}.${modo}\n\n${lista}${extra}`,
    );
  }

  // ─── 4. Snapshot para ver la tendencia ────────────────────────────────────
  await supabase.from('ag_push_health_checks').insert({
    total_drivers: reporte.total,
    con_push: reporte.con_push,
    sin_push: reporte.sin_push,
    avisados: enviadosOk,
    detalle: { dry_run: dryRun, admin_avisado: adminAvisado, resultados },
  });

  return json({
    ok: true,
    dry_run: dryRun,
    total: reporte.total,
    con_push: reporte.con_push,
    sin_push: reporte.sin_push,
    avisables: reporte.avisables,
    avisados: enviadosOk,
    admin_avisado: adminAvisado,
    resultados,
  });
});
