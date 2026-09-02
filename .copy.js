const fs = require('fs');
const p = 'supabase/functions/ag-whatsapp/index.ts';
let s = fs.readFileSync(p, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';

const viejo = [
"    const body =",
"      `👀 *${sawCount}* ${noun} vieron tu solicitud${forName ? ` para *${forName}*` : ''}, pero ninguno la ha aceptado todavía.\n\n` +",
"      `¿Qué quieres hacer?`;",
].join(EOL);

const nuevo = [
"    // Pedido explicito del usuario 2026-09-02: al ofrecer 'Subir oferta' hay que explicarle por",
"    // que le conviene, no solo darle el boton. La razon real es sencilla y conviene decirla tal",
"    // cual: el conductor elige entre varias solicitudes y toma primero la que mejor le paga.",
"    const body =",
"      `👀 *${sawCount}* ${noun} vieron tu solicitud${forName ? ` para *${forName}*` : ''}, pero ninguno la ha aceptado todavía.\n\n` +",
"      `💡 Los ${noun} suelen tomar primero los viajes que pagan un poco mejor. ` +",
"      `Si subes tu oferta, lo más probable es que alguien la acepte enseguida.\n\n` +",
"      `¿Qué quieres hacer?`;",
].join(EOL);

if (!s.includes(viejo)) { console.error('mensaje no encontrado'); process.exit(1); }
fs.writeFileSync(p, s.replace(viejo, nuevo));
console.log('ok');
