// Edge Function: Enviar campaña SMS vía Telnyx
// Recibe campaign_id, obtiene destinatarios, envía SMS y actualiza contadores
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const TELNYX_API_KEY = Deno.env.get('TELNYX_API_KEY')!;
const TELNYX_FROM    = Deno.env.get('TELNYX_SENDER_ID') ?? Deno.env.get('TELNYX_PHONE_NUMBER')!;
const TELNYX_MSG_PROFILE = Deno.env.get('TELNYX_MESSAGING_PROFILE_ID') ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DEFAULT_SHORT_LINK_BASE = Deno.env.get('SMS_SHORT_LINK_BASE') ?? 'https://www.publihazclick.com/s';

// Dueño real de la cuenta: es quien recarga saldo en Telnyx directamente (turismohermosacolombia@gmail.com).
// Para este usuario no aplica el precio de reventa (80 COP/msg) ni el bloqueo por saldo de la wallet interna:
// solo debe topar con el saldo real de Telnyx, y el costo que se le registra es el costo real de Telnyx.
const OWNER_USER_ID = 'bef0a949-67bc-4e85-9389-230dd9dc3bbd';
const REAL_SMS_COST_USD = 0.042; // confirmado con el detalle real de mensajes entregados en Telnyx (2026-07-24)
const FALLBACK_COP_RATE = 3850;

async function getRealCostPerSmsCop(): Promise<number> {
  try {
    const resp = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=COP');
    if (resp.ok) {
      const data = await resp.json();
      const rate = data?.rates?.COP;
      if (typeof rate === 'number' && rate > 0) {
        return Math.round(REAL_SMS_COST_USD * rate * 100) / 100;
      }
    }
  } catch {
    // usar fallback
  }
  return Math.round(REAL_SMS_COST_USD * FALLBACK_COP_RATE * 100) / 100;
}

// Dominios propios que ya tienen la ruta /s/:code configurada (vercel.json) apuntando
// a esta misma función. Si el link a acortar pertenece a uno de estos, el link corto
// sale con la marca del destino en vez de siempre publihazclick.com.
const BRANDED_SHORT_LINK_DOMAINS = new Set(['publihazclick.com', 'lokomproaqui.com']);

const URL_REGEX = /https?:\/\/[^\s]+/g;
const SHORT_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateShortCode(len = 7): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) out += SHORT_CODE_CHARS[bytes[i] % SHORT_CODE_CHARS.length];
  return out;
}

// Elige el dominio del link corto según el destino: si el link apunta a uno de nuestros
// propios dominios ya configurados, usa ese mismo dominio (se ve coherente con el mensaje).
// Si no, cae en el dominio por defecto (publihazclick.com).
function shortLinkBaseFor(destinationUrl: string): string {
  try {
    const host = new URL(destinationUrl).hostname;
    const bareHost = host.replace(/^www\./, '');
    if (BRANDED_SHORT_LINK_DOMAINS.has(bareHost)) {
      return `https://${host}/s`;
    }
  } catch {
    // URL inválida: usar el default
  }
  return DEFAULT_SHORT_LINK_BASE;
}

// Reemplaza los links de un mensaje por links cortos rastreables (uno por URL única, reutilizable si la campaña se reintenta)
async function shortenMessageLinks(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  campaignId: string,
  body: string,
): Promise<string> {
  const urls = [...new Set(body.match(URL_REGEX) ?? [])];
  if (urls.length === 0) return body;

  const { data: existing } = await supabase
    .from('sms_short_links')
    .select('code, destination_url')
    .eq('campaign_id', campaignId);

  const existingMap = new Map<string, string>(
    (existing ?? []).map((l: { destination_url: string; code: string }) => [l.destination_url, l.code]),
  );

  let finalBody = body;
  for (const longUrl of urls) {
    let code = existingMap.get(longUrl);
    if (!code) {
      for (let attempt = 0; attempt < 5 && !code; attempt++) {
        const candidate = generateShortCode();
        const { error } = await supabase
          .from('sms_short_links')
          .insert({ user_id: userId, campaign_id: campaignId, code: candidate, destination_url: longUrl });
        if (!error) code = candidate;
      }
    }
    if (code) {
      finalBody = finalBody.split(longUrl).join(`${shortLinkBaseFor(longUrl)}/${code}`);
    }
  }
  return finalBody;
}

async function sendOneSms(to: string, body: string): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const payload: Record<string, string> = {
    from: TELNYX_FROM,
    to,
    text: body,
    type: 'SMS',
  };
  if (TELNYX_MSG_PROFILE) {
    payload.messaging_profile_id = TELNYX_MSG_PROFILE;
  }

  const resp = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (resp.ok) {
    const data = await resp.json();
    return { ok: true, messageId: data.data?.id };
  }
  const err = await resp.json().catch(() => ({ errors: [{ detail: 'Unknown error' }] }));
  const detail = err.errors?.[0]?.detail ?? `HTTP ${resp.status}`;
  return { ok: false, error: detail };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Autenticar usuario
    const authHeader = req.headers.get('authorization') ?? '';
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: 'No autenticado' }, 401);

    const { campaign_id } = await req.json();
    if (!campaign_id) return json({ error: 'campaign_id requerido' }, 400);

    // Verificar que la campaña pertenece al usuario
    const { data: campaign, error: cErr } = await supabase
      .from('sms_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .eq('user_id', user.id)
      .single();

    if (cErr || !campaign) return json({ error: 'Campaña no encontrada' }, 404);

    const isOwner = user.id === OWNER_USER_ID;

    // Verificar saldo SMS del usuario
    const { data: wallet } = await supabase
      .from('sms_wallets')
      .select('balance, unlimited')
      .eq('user_id', user.id)
      .single();

    const balance = wallet?.balance ?? 0;
    // El dueño de la cuenta no depende de la wallet interna: solo lo limita el saldo real de Telnyx.
    const isUnlimited = isOwner || (wallet?.unlimited ?? false);

    // Obtener destinatarios pendientes
    const { data: recipients, error: rErr } = await supabase
      .from('sms_campaign_recipients')
      .select('id, phone_number')
      .eq('campaign_id', campaign_id)
      .eq('status', 'pending')
      .limit(5000);

    if (rErr || !recipients || recipients.length === 0) {
      return json({ error: 'No hay destinatarios pendientes' }, 400);
    }

    // Verificar saldo suficiente (wallet y costos en COP). Para el dueño, el costo registrado
    // es el costo real de Telnyx (no el precio de reventa de 80 COP/msg).
    const costPerSms = isOwner ? await getRealCostPerSmsCop() : (campaign.cost_per_sms ?? 80);
    const totalCost = recipients.length * costPerSms;

    if (!isUnlimited && balance < totalCost) {
      return json({
        error: `Saldo insuficiente. Necesitas $${totalCost.toLocaleString('es-CO')} COP, tienes $${balance.toLocaleString('es-CO')} COP`,
      }, 400);
    }

    // Acortar links del mensaje (una sola vez, mismo link corto para todos los destinatarios)
    const messageBody = await shortenMessageLinks(supabase, user.id, campaign_id, campaign.message_body);

    // Enviar SMS en lote (máximo 50 concurrentes para no saturar Telnyx)
    let sentCount = 0;
    let failedCount = 0;
    const batchSize = 50;

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (r) => {
          const result = await sendOneSms(r.phone_number, messageBody);
          const status = result.ok ? 'sent' : 'failed';
          const updateData: Record<string, unknown> = {
            status,
            sent_at: new Date().toISOString(),
          };
          if (result.error) updateData.error_message = result.error;
          if (result.messageId) updateData.provider_message_id = result.messageId;

          await supabase
            .from('sms_campaign_recipients')
            .update(updateData)
            .eq('id', r.id);

          return result.ok;
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) sentCount++;
        else failedCount++;
      }
    }

    // Descontar saldo (no aplica a wallets ilimitadas)
    const actualCost = sentCount * costPerSms;
    if (actualCost > 0 && !isUnlimited) {
      await supabase.rpc('deduct_sms_balance', {
        p_user_id: user.id,
        p_amount: actualCost,
      }).catch(() => {
        // Fallback: update manual
        supabase
          .from('sms_wallets')
          .update({ balance: Math.max(0, balance - actualCost) })
          .eq('user_id', user.id);
      });
    }

    // Actualizar contadores de la campaña (si no se entregó ni un solo mensaje, reflejarlo como fallida)
    const finalStatus = sentCount === 0 && failedCount > 0 ? 'failed' : 'completed';
    await supabase
      .from('sms_campaigns')
      .update({
        status: finalStatus,
        sent_count: (campaign.sent_count ?? 0) + sentCount,
        delivered_count: (campaign.delivered_count ?? 0) + sentCount,
        failed_count: (campaign.failed_count ?? 0) + failedCount,
        total_cost: (campaign.total_cost ?? 0) + actualCost,
        ...(isOwner ? { cost_per_sms: costPerSms } : {}),
      })
      .eq('id', campaign_id);

    return json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      cost: actualCost,
      remaining_balance: isUnlimited ? balance : Math.max(0, balance - actualCost),
    });
  } catch (e) {
    console.error('send-sms-campaign error:', e);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
