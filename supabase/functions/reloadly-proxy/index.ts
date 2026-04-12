// =============================================================================
// Edge Function: reloadly-proxy
// Proxy seguro para la API de Reloadly (recargas celulares).
// Protege las credenciales del lado del servidor.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const RELOADLY_CLIENT_ID     = Deno.env.get('RELOADLY_CLIENT_ID') ?? '';
const RELOADLY_CLIENT_SECRET = Deno.env.get('RELOADLY_CLIENT_SECRET') ?? '';
const RELOADLY_SANDBOX       = (Deno.env.get('RELOADLY_SANDBOX') ?? 'true') === 'true';

const AUTH_URL  = 'https://auth.reloadly.com/oauth/token';
const API_BASE  = RELOADLY_SANDBOX
  ? 'https://topups-sandbox.reloadly.com'
  : 'https://topups.reloadly.com';
const AUDIENCE  = API_BASE;

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

/* ------------------------------------------------------------------ */
/*  Token cache (in-memory, per-instance)                              */
/* ------------------------------------------------------------------ */
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: RELOADLY_CLIENT_ID,
      client_secret: RELOADLY_CLIENT_SECRET,
      grant_type: 'client_credentials',
      audience: AUDIENCE,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Reloadly auth failed: ${res.status} — ${err}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Refresh 5 min before expiry
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken!;
}

/* ------------------------------------------------------------------ */
/*  Reloadly API helper                                                */
/* ------------------------------------------------------------------ */
async function reloadlyFetch(path: string, method = 'GET', body?: unknown) {
  const token = await getAccessToken();
  const opts: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/com.reloadly.topups-v1+json',
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

/* ------------------------------------------------------------------ */
/*  Auth helper — extracts user from JWT                               */
/* ------------------------------------------------------------------ */
function getUserFromAuth(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (!auth) return null;
  try {
    const token = auth.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const userId = getUserFromAuth(req);
    if (!userId) return json({ error: 'No autorizado' }, 401);

    if (!RELOADLY_CLIENT_ID || !RELOADLY_CLIENT_SECRET) {
      return json({ error: 'Reloadly no configurado. Configura RELOADLY_CLIENT_ID y RELOADLY_CLIENT_SECRET.' }, 503);
    }

    const { action, ...params } = await req.json();

    switch (action) {
      /* ---------- Listar operadores de Colombia ---------- */
      case 'get-operators': {
        const { status, data } = await reloadlyFetch('/operators/countries/CO');
        return json(data, status);
      }

      /* ---------- Auto-detectar operador por teléfono ---------- */
      case 'detect-operator': {
        const phone = params.phone?.replace(/\s/g, '');
        if (!phone) return json({ error: 'Número de teléfono requerido' }, 400);
        const fullPhone = phone.startsWith('57') ? phone : `57${phone}`;
        const { status, data } = await reloadlyFetch(
          `/operators/auto-detect/phone/${fullPhone}/countries/CO?suggestedAmounts=true&suggestedAmountsMap=true`
        );
        return json(data, status);
      }

      /* ---------- Enviar recarga ---------- */
      case 'send-topup': {
        const { operatorId, amount, phone } = params;
        if (!operatorId || !amount || !phone) {
          return json({ error: 'operatorId, amount y phone son requeridos' }, 400);
        }

        const cleanPhone = phone.replace(/\s/g, '');
        const fullPhone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;
        const customId = `pp-${userId}-${Date.now()}`;

        const { status, data } = await reloadlyFetch('/topups', 'POST', {
          operatorId,
          amount: Number(amount),
          useLocalAmount: true,
          customIdentifier: customId,
          recipientPhone: {
            countryCode: 'CO',
            number: fullPhone,
          },
        });

        // Log transaction in Supabase
        try {
          const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
          await sb.from('punto_pago_transactions').insert({
            user_id: userId,
            category: 'recargas',
            provider_name: data.operatorName ?? 'Desconocido',
            reference: fullPhone,
            amount: Number(amount),
            external_id: String(data.transactionId ?? ''),
            custom_identifier: customId,
            status: data.status === 'SUCCESSFUL' ? 'completed' : data.status === 'PENDING' ? 'pending' : 'failed',
            raw_response: data,
          });
        } catch (e) {
          console.error('Error logging transaction:', e);
        }

        return json(data, status);
      }

      /* ---------- Estado de transacción ---------- */
      case 'check-status': {
        const { transactionId } = params;
        if (!transactionId) return json({ error: 'transactionId requerido' }, 400);
        const { status, data } = await reloadlyFetch(`/topups/${transactionId}/status`);
        return json(data, status);
      }

      /* ---------- Balance de cuenta ---------- */
      case 'get-balance': {
        const { status, data } = await reloadlyFetch('/accounts/balance');
        return json(data, status);
      }

      /* ---------- Promociones Colombia ---------- */
      case 'get-promotions': {
        const { status, data } = await reloadlyFetch('/promotions/country-codes/CO');
        return json(data, status);
      }

      default:
        return json({ error: `Acción desconocida: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error('reloadly-proxy error:', err);
    return json({ error: err.message ?? 'Error interno' }, 500);
  }
});
