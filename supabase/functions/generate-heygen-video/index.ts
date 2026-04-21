// =============================================================================
// Edge Function: generate-heygen-video
// Genera video con avatar HeyGen. Valida JWT contra Supabase y cobra
// 'video_heygen' desde el wallet del usuario antes de llamar al proveedor.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const HEYGEN_API_KEY       = Deno.env.get('HEYGEN_API_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!HEYGEN_API_KEY)  return json({ error: 'HeyGen API key no configurada' }, 500);
    if (!SUPABASE_SERVICE_KEY) return json({ error: 'Servicio no configurado' }, 500);

    // 1. Validar JWT contra Supabase auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Token invalido' }, 401);

    // 2. Body
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Body requerido' }, 400);
    const { avatar_id, talking_photo_id, voice_id, script, title, dimension, character_type } = body;
    if (!voice_id || !script) return json({ error: 'voice_id y script son requeridos' }, 400);

    // 3. Cobrar ANTES de llamar a HeyGen. Si falla, no se genera.
    const { data: chargeData, error: chargeErr } = await supabase.rpc('charge_ai_action', {
      p_user_id: user.id,
      p_action_id: 'video_heygen',
      p_metadata: {
        character_type: character_type ?? 'avatar',
        voice_id,
        script_chars: (script as string).length,
      },
    });
    if (chargeErr) {
      console.error('[heygen] charge error:', chargeErr);
      return json({ error: 'Error al cobrar la acción' }, 500);
    }
    if (!chargeData?.ok) {
      return json({
        error: chargeData?.error ?? 'Saldo insuficiente',
        need_recharge: chargeData?.need_recharge ?? false,
        required: chargeData?.required,
        balance: chargeData?.balance,
      }, 402);
    }

    // 4. Construir character config según el tipo
    let character: Record<string, unknown>;
    if (character_type === 'talking_photo' && talking_photo_id) {
      character = { type: 'talking_photo', talking_photo_id };
    } else if (avatar_id) {
      character = { type: 'avatar', avatar_id, avatar_style: 'normal' };
    } else {
      // Esto no debería pasar si el cliente valida, pero devolvemos reembolso logico
      await refund(supabase, user.id, 'video_heygen', chargeData.charged ?? 0, 'missing avatar_id/talking_photo_id');
      return json({ error: 'avatar_id o talking_photo_id requerido' }, 400);
    }

    // 5. Llamar a HeyGen
    const heygenRes = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title ?? 'Video PubliHazClick',
        dimension: dimension ?? { width: 1920, height: 1080 },
        video_inputs: [{
          character,
          voice: { type: 'text', input_text: script, voice_id, speed: 1.0 },
        }],
      }),
    });

    const heygenData = await heygenRes.json().catch(() => ({}));

    if (!heygenRes.ok || heygenData?.error) {
      console.error('[heygen] API error:', JSON.stringify(heygenData));
      // Reembolso si HeyGen rechazó la solicitud
      await refund(supabase, user.id, 'video_heygen', chargeData.charged ?? 0, 'heygen API error');
      return json({ error: heygenData.error?.message ?? 'Error al generar video' }, 500);
    }

    const videoId = heygenData.data?.video_id;
    if (!videoId) {
      await refund(supabase, user.id, 'video_heygen', chargeData.charged ?? 0, 'no video_id');
      return json({ error: 'No se obtuvo video_id' }, 500);
    }

    return json({
      video_id: videoId,
      status: 'processing',
      message: 'Video en proceso de generación.',
      balance_after: chargeData.balance_after,
      charged: chargeData.charged,
    });

  } catch (err) {
    console.error('[heygen] Error:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});

/**
 * Si HeyGen rechaza, revertimos el cobro creando una transacción 'refund'.
 * No tocamos directamente ai_wallets para mantener consistencia con trigger.
 */
async function refund(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  actionId: string,
  amount: number,
  reason: string,
) {
  if (amount <= 0) return;
  try {
    // Sumar al balance
    const { data: wallet } = await supabase
      .from('ai_wallets')
      .select('id, balance')
      .eq('user_id', userId)
      .single();
    if (!wallet) return;

    await supabase
      .from('ai_wallets')
      .update({
        balance: (wallet.balance as number) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    await supabase
      .from('ai_wallet_transactions')
      .insert({
        wallet_id: wallet.id,
        user_id: userId,
        type: 'refund',
        amount: amount,
        balance_after: (wallet.balance as number) + amount,
        description: `Reembolso por error (${actionId})`,
        metadata: { action_id: actionId, reason },
      });
  } catch (e) {
    console.error('[heygen] refund failed:', e);
  }
}
