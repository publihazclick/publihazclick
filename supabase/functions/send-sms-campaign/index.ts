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

    // Verificar saldo SMS del usuario
    const { data: wallet } = await supabase
      .from('sms_wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    const balance = wallet?.balance ?? 0;

    // Obtener destinatarios pendientes
    const { data: recipients, error: rErr } = await supabase
      .from('sms_campaign_recipients')
      .select('*')
      .eq('campaign_id', campaign_id)
      .eq('status', 'pending');

    if (rErr || !recipients || recipients.length === 0) {
      return json({ error: 'No hay destinatarios pendientes' }, 400);
    }

    // Verificar saldo suficiente (wallet y costos en COP)
    const costPerSms = campaign.cost_per_sms ?? 80;
    const totalCost = recipients.length * costPerSms;

    if (balance < totalCost) {
      return json({
        error: `Saldo insuficiente. Necesitas $${totalCost.toLocaleString('es-CO')} COP, tienes $${balance.toLocaleString('es-CO')} COP`,
      }, 400);
    }

    // Enviar SMS en lote (máximo 50 concurrentes para no saturar Telnyx)
    let sentCount = 0;
    let failedCount = 0;
    const batchSize = 50;

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (r) => {
          const result = await sendOneSms(r.phone_number, campaign.message_body);
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

    // Descontar saldo
    const actualCost = sentCount * costPerSms;
    if (actualCost > 0) {
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

    // Actualizar contadores de la campaña
    await supabase
      .from('sms_campaigns')
      .update({
        status: 'completed',
        sent_count: (campaign.sent_count ?? 0) + sentCount,
        delivered_count: (campaign.delivered_count ?? 0) + sentCount,
        failed_count: (campaign.failed_count ?? 0) + failedCount,
        total_cost: (campaign.total_cost ?? 0) + actualCost,
      })
      .eq('id', campaign_id);

    return json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      cost: actualCost,
      remaining_balance: Math.max(0, balance - actualCost),
    });
  } catch (e) {
    console.error('send-sms-campaign error:', e);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
