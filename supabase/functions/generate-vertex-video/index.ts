// =============================================================================
// Edge Function: generate-vertex-video
// Inicia generación de video con Vertex AI Veo 2
// Retorna el nombre de la operación para polling
// Requiere secret: GOOGLE_STORAGE_BUCKET (bucket de GCS para output)
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PROJECT_ID = Deno.env.get('GOOGLE_CLOUD_PROJECT_ID')!;
const LOCATION = 'us-central1'; // Veo 2 solo disponible en us-central1
const SA_JSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!;
const GCS_BUCKET = Deno.env.get('GOOGLE_STORAGE_BUCKET') || '';

const MODEL = 'veo-2.0-generate-001';

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

// ── Google Auth ──────────────────────────────────────────────────────────────

function b64url(data: string | ArrayBuffer): string {
  let base64: string;
  if (typeof data === 'string') {
    base64 = btoa(unescape(encodeURIComponent(data)));
  } else {
    base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  }
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getGoogleAccessToken(): Promise<string> {
  const sa = JSON.parse(SA_JSON);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;

  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const keyBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${b64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`Google auth error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // 1. Verificar JWT de Supabase
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer '))
      return json({ error: 'No autorizado' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !user) return json({ error: 'Token inválido o expirado' }, 401);

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['advertiser', 'admin', 'dev'].includes(profile.role))
      return json({ error: 'Sin permisos para usar esta función' }, 403);

    if (!GCS_BUCKET)
      return json({ error: 'GOOGLE_STORAGE_BUCKET no configurado en secrets' }, 500);

    // 2. Parsear body
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Body inválido' }, 400);

    const {
      prompt,
      aspectRatio = '16:9',
      durationSeconds = 8,
      negativePrompt,
    } = body as {
      prompt: string;
      aspectRatio?: string;
      durationSeconds?: number;
      negativePrompt?: string;
    };

    if (!prompt || prompt.trim().length < 5)
      return json({ error: 'El prompt debe tener al menos 5 caracteres' }, 400);

    const validAspects = ['16:9', '9:16', '1:1'];
    if (!validAspects.includes(aspectRatio))
      return json({ error: 'Aspect ratio inválido. Use: 16:9, 9:16 o 1:1' }, 400);

    const duration = Math.min(Math.max(5, durationSeconds), 8);

    // 3. Obtener token de Google
    const accessToken = await getGoogleAccessToken();

    // 4. Llamar a Vertex AI Veo (predictLongRunning)
    const vertexUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predictLongRunning`;

    const storageUri = `gs://${GCS_BUCKET}/vertex-videos/${user.id}/${Date.now()}/`;

    const requestBody: Record<string, unknown> = {
      instances: [{ prompt: prompt.trim() }],
      parameters: {
        storageUri,
        sampleCount: 1,
        durationSeconds: duration,
        aspectRatio,
        safetyFilterLevel: 'block_some',
        personGeneration: 'allow_adult',
      },
    };

    if (negativePrompt?.trim()) {
      (requestBody['instances'] as Record<string, unknown>[])[0]['negativePrompt'] =
        negativePrompt.trim();
    }

    const vertexRes = await fetch(vertexUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!vertexRes.ok) {
      const errText = await vertexRes.text().catch(() => '');
      console.error('Vertex Veo error:', vertexRes.status, errText);
      return json({ error: 'Error al iniciar generación de video. Intenta de nuevo.' }, 502);
    }

    const vertexData = await vertexRes.json();
    const operationName = vertexData?.name;

    if (!operationName)
      return json({ error: 'Veo no devolvió un nombre de operación' }, 502);

    // 5. Retornar nombre de operación para polling
    return json({
      success: true,
      operationName,
      storageUri,
      estimatedSeconds: duration * 15, // estimado de espera
    });
  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
