const fs = require('fs');
const p = 'supabase/functions/ag-whatsapp/index.ts';
let s = fs.readFileSync(p, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';

const viejo = [
"      let waResult = await sendTemplate(toE164(targetPhone), 'trip_error_alert', 'es_CO', [contexto, detalle]);",
"      if (!waResult.ok) {",
"        waResult = await sendText(toE164(targetPhone), `🔴 *Movi* — Error en el flujo de viaje\n\n📍 Contexto: ${contexto}\n⚠️ ${detalle}`);",
"      }",
].join(EOL);

const nuevo = [
"      const tplResult = await sendTemplate(toE164(targetPhone), 'trip_error_alert', 'es_CO', [contexto, detalle]);",
"      let waResult = tplResult;",
"      let txtResult: WaResult | null = null;",
"      if (!waResult.ok) {",
"        txtResult = await sendText(toE164(targetPhone), `🔴 *Movi* — Error en el flujo de viaje\n\n📍 Contexto: ${contexto}\n⚠️ ${detalle}`);",
"        waResult = txtResult;",
"      }",
].join(EOL);

if (!s.includes(viejo)) { console.error('bloque no encontrado'); process.exit(1); }
s = s.replace(viejo, nuevo);

const viejoRet = [
"      return new Response(JSON.stringify({ sent: waResult.ok }), {",
"        headers: { ...corsHeaders, 'Content-Type': 'application/json' },",
"      });",
].join(EOL);

const nuevoRet = [
"      // Diagnostico permanente pero gateado (mismo patron que ag-otp-send): con ?debug=1 en la",
"      // URL se devuelve el error crudo de Meta de CADA intento. Sin eso la respuesta es la de",
"      // siempre. Hace falta porque logWaMessage() registra el mensaje aunque Meta lo rechace,",
"      // asi que el log dice 'enviado' cuando en realidad no llego nada -- y sin logs de",
"      // ejecucion no habia forma de ver el motivo real.",
"      const url = new URL(req.url);",
"      if (url.searchParams.get('debug') === '1') {",
"        return new Response(JSON.stringify({",
"          sent: waResult.ok,",
"          plantilla: { ok: tplResult.ok, status: tplResult.status, body: (tplResult.body ?? '').slice(0, 500) },",
"          texto: txtResult ? { ok: txtResult.ok, status: txtResult.status, body: (txtResult.body ?? '').slice(0, 500) } : 'no hizo falta',",
"        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });",
"      }",
"      return new Response(JSON.stringify({ sent: waResult.ok }), {",
"        headers: { ...corsHeaders, 'Content-Type': 'application/json' },",
"      });",
].join(EOL);

if (!s.includes(viejoRet)) { console.error('return no encontrado'); process.exit(1); }
s = s.replace(viejoRet, nuevoRet);

fs.writeFileSync(p, s);
console.log('ok');
