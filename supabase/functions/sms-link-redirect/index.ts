// Edge Function pública: resuelve un código corto de SMS, registra el clic y redirige
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const FALLBACK_URL = 'https://www.publihazclick.com';

serve(async (req) => {
  const url = new URL(req.url);
  // Soporta /functions/v1/sms-link-redirect/<code> y ?c=<code>
  const pathCode = url.pathname.split('/').filter(Boolean).pop();
  const code = url.searchParams.get('c') ?? (pathCode !== 'sms-link-redirect' ? pathCode : null);

  if (!code) {
    return new Response(null, { status: 302, headers: { Location: FALLBACK_URL } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: destination } = await supabase.rpc('sms_short_link_register_click', {
    p_code: code,
    p_user_agent: req.headers.get('user-agent') ?? null,
  });

  return new Response(null, {
    status: 302,
    headers: { Location: destination ?? FALLBACK_URL },
  });
});
