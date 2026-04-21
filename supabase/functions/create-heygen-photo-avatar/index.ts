// =============================================================================
// Edge Function: create-heygen-photo-avatar
// Sube una foto a HeyGen y obtiene un talking_photo_id personalizado para
// ese usuario. Cobra la acción 'photo_avatar_heygen'. Usa endpoint v1 de
// HeyGen Photo Avatar upload.
//
// Cliente envía: { image_base64: "data:image/jpeg;base64,..." } o una URL
// pública en image_url.
//
// Devuelve: { talking_photo_id, image_url, charged, balance_after }
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

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; contentType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('data URL inválido');
  const contentType = match[1];
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, contentType };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!HEYGEN_API_KEY) return json({ error: 'HeyGen no configurado' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Token inválido' }, 401);

    const body = await req.json().catch(() => ({})) as {
      image_base64?: string;
      image_url?: string;
    };

    if (!body.image_base64 && !body.image_url) {
      return json({ error: 'image_base64 o image_url requerido' }, 400);
    }

    // Cobrar
    const { data: charge, error: chargeErr } = await supabase.rpc('charge_ai_action', {
      p_user_id: user.id,
      p_action_id: 'photo_avatar_heygen',
      p_metadata: { source: body.image_base64 ? 'upload' : 'url' },
    });
    if (chargeErr) return json({ error: 'Error al cobrar' }, 500);
    if (!charge?.ok) {
      return json({
        error: charge?.error ?? 'Saldo insuficiente',
        need_recharge: true,
        required: charge?.required,
        balance: charge?.balance,
      }, 402);
    }

    // Preparar upload a HeyGen:
    // POST https://upload.heygen.com/v1/talking_photo con body binario.
    // HeyGen devuelve { data: { talking_photo_id, talking_photo_url } }
    let uploadBody: BodyInit;
    let contentType = 'image/jpeg';
    if (body.image_base64) {
      const { bytes, contentType: ct } = dataUrlToBytes(body.image_base64);
      uploadBody = bytes;
      contentType = ct;
    } else {
      // Descargar la URL y hacer upload binario
      const imgRes = await fetch(body.image_url as string);
      if (!imgRes.ok) {
        await refund(supabase, user.id, charge.charged ?? 0, 'image download failed');
        return json({ error: 'No se pudo descargar la imagen' }, 400);
      }
      const buf = await imgRes.arrayBuffer();
      uploadBody = new Uint8Array(buf);
      contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    }

    const heygenRes = await fetch('https://upload.heygen.com/v1/talking_photo', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': contentType,
      },
      body: uploadBody,
    });

    const heygenData = await heygenRes.json().catch(() => ({}));

    if (!heygenRes.ok || heygenData?.error) {
      console.error('[photo-avatar] HeyGen error:', JSON.stringify(heygenData));
      await refund(supabase, user.id, charge.charged ?? 0, 'heygen upload failed');
      return json({ error: heygenData?.error?.message ?? heygenData?.message ?? 'Error al subir foto' }, 502);
    }

    const talkingPhotoId = heygenData?.data?.talking_photo_id;
    const talkingPhotoUrl = heygenData?.data?.talking_photo_url;
    if (!talkingPhotoId) {
      await refund(supabase, user.id, charge.charged ?? 0, 'no talking_photo_id');
      return json({ error: 'HeyGen no devolvió talking_photo_id' }, 502);
    }

    // Guardar en ai_projects
    await supabase.from('ai_projects').insert({
      user_id: user.id,
      kind: 'photo_avatar',
      title: 'Mi avatar personal',
      provider: 'heygen',
      cost_cop: charge.charged ?? 0,
      external_id: talkingPhotoId,
      url: talkingPhotoUrl ?? null,
      thumbnail: talkingPhotoUrl ?? null,
      data: { talking_photo_id: talkingPhotoId, talking_photo_url: talkingPhotoUrl },
    });

    return json({
      success: true,
      talking_photo_id: talkingPhotoId,
      image_url: talkingPhotoUrl,
      charged: charge.charged,
      balance_after: charge.balance_after,
    });

  } catch (err) {
    console.error('[photo-avatar] error:', err);
    return json({ error: 'Error interno' }, 500);
  }
});

async function refund(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  reason: string,
) {
  if (amount <= 0) return;
  try {
    const { data: wallet } = await supabase
      .from('ai_wallets')
      .select('id, balance')
      .eq('user_id', userId)
      .single();
    if (!wallet) return;

    await supabase.from('ai_wallets').update({
      balance: (wallet.balance as number) + amount,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);

    await supabase.from('ai_wallet_transactions').insert({
      wallet_id: wallet.id,
      user_id: userId,
      type: 'refund',
      amount: amount,
      balance_after: (wallet.balance as number) + amount,
      description: `Reembolso foto avatar (${reason})`,
      metadata: { action_id: 'photo_avatar_heygen', reason },
    });
  } catch (e) {
    console.error('[photo-avatar] refund failed:', e);
  }
}
