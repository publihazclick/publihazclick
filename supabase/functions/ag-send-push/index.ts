// Edge Function: ag-send-push — envía Web Push a user_id(s) de Movi
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7?target=deno';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PUBLIC_KEY     = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY    = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT        = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:publihazclick.com@gmail.com';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ error: 'VAPID no configurado' }, 500);

  try {
    const body = await req.json();
    const userIds: string[] = Array.isArray(body?.user_ids) ? body.user_ids : (body?.user_id ? [body.user_id] : []);
    if (userIds.length === 0) return json({ error: 'user_id(s) requerido' }, 400);
    const payload = JSON.stringify({
      title: body?.title ?? 'Movi',
      body: body?.body ?? '',
      url: body?.url ?? '/anda-gana',
      tag: body?.tag,
      urgent: !!body?.urgent,
    });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: subs } = await supabase.from('ag_push_subs').select('*').in('user_id', userIds);
    if (!subs?.length) return json({ ok: true, sent: 0 });

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as any, payload);
        sent++;
        supabase.from('ag_push_subs').update({ last_used_at: new Date().toISOString() }).eq('id', s.id).then(() => {});
      } catch (e: any) {
        if ((e?.statusCode ?? e?.status) === 410 || (e?.statusCode ?? e?.status) === 404) {
          await supabase.from('ag_push_subs').delete().eq('endpoint', s.endpoint);
        }
      }
    }
    return json({ ok: true, sent });
  } catch (err) {
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
