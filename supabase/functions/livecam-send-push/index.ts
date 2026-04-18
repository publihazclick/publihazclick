// =============================================================================
// Edge Function: livecam-send-push
// Envía Web Push a subscripciones de un user_id específico.
// Requiere env VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...).
// Usa web-push-deno.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7?target=deno';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PUBLIC_KEY     = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY    = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT        = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@livecam-pro.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return json({ error: 'Supabase no configurado' }, 500);
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ error: 'VAPID no configurado' }, 500);

  try {
    const body = await req.json();
    const userIds: string[] = Array.isArray(body?.user_ids) ? body.user_ids : (body?.user_id ? [body.user_id] : []);
    if (userIds.length === 0) return json({ error: 'user_id(s) requerido' }, 400);

    const payload = JSON.stringify({
      title: body?.title ?? 'LiveCam Pro',
      body: body?.body ?? '',
      url: body?.url ?? '/',
      tag: body?.tag,
    });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: subs } = await supabase.from('livecam_push_subs').select('*').in('user_id', userIds);
    if (!subs || subs.length === 0) return json({ ok: true, sent: 0 });

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        } as any, payload);
        sent++;
      } catch (e: any) {
        console.error('[push] fail', s.endpoint, e);
        if ((e?.statusCode ?? e?.status) === 410 || (e?.statusCode ?? e?.status) === 404) {
          await supabase.from('livecam_push_subs').delete().eq('endpoint', s.endpoint);
        }
      }
    }

    return json({ ok: true, sent });
  } catch (err) {
    console.error('send-push error:', err);
    return json({ error: 'Error interno' }, 500);
  }
});
