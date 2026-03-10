// =============================================================================
// Edge Function: check-vertex-video
// Verifica el estado de una operación Veo y descarga el video cuando esté listo
// Lo sube a Supabase Storage (bucket: ai-videos) y retorna URL pública
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SA_JSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!;
const LOCATION = 'us-central1';

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

// ── Descargar video de GCS ───────────────────────────────────────────────────

async function downloadFromGCS(gcsUri: string, accessToken: string): Promise<Uint8Array> {
  // gcsUri: gs://bucket-name/path/to/file.mp4
  const withoutPrefix = gcsUri.replace('gs://', '');
  const slashIdx = withoutPrefix.indexOf('/');
  const bucket = withoutPrefix.substring(0, slashIdx);
  const object = withoutPrefix.substring(slashIdx + 1);

  const url = `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(object)}?alt=media`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`GCS download error: ${res.status} ${await res.text()}`);
  }

  return new Uint8Array(await res.arrayBuffer());
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

    // 2. Parsear body
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Body inválido' }, 400);

    const { operationName } = body as { operationName: string };

    if (!operationName?.startsWith('projects/'))
      return json({ error: 'operationName inválido' }, 400);

    // 3. Obtener token de Google
    const accessToken = await getGoogleAccessToken();

    // 4. Verificar estado de la operación
    const opUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/${operationName}`;

    const opRes = await fetch(opUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!opRes.ok) {
      const errText = await opRes.text().catch(() => '');
      console.error('Operation check error:', opRes.status, errText);
      return json({ error: 'Error al verificar operación' }, 502);
    }

    const opData = await opRes.json();

    // Si aún no terminó
    if (!opData.done) {
      return json({ success: true, status: 'pending', done: false });
    }

    // Si falló
    if (opData.error) {
      return json({
        success: false,
        status: 'failed',
        done: true,
        error: opData.error.message || 'La operación falló',
      });
    }

    // 5. Operación completada — extraer URI del video
    const videos = opData.response?.videos as { uri?: string; gcsUri?: string }[] | undefined;
    const videoUri = videos?.[0]?.uri || videos?.[0]?.gcsUri;

    if (!videoUri) {
      return json({ error: 'La operación terminó pero no devolvió video' }, 502);
    }

    // 6. Descargar video de GCS
    const videoBytes = await downloadFromGCS(videoUri, accessToken);

    // 7. Subir a Supabase Storage (bucket: ai-videos)
    const fileName = `${user.id}/${Date.now()}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from('ai-videos')
      .upload(fileName, videoBytes, {
        contentType: 'video/mp4',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return json({ error: 'Error al guardar el video' }, 500);
    }

    // 8. Obtener URL pública
    const { data: publicData } = supabase.storage.from('ai-videos').getPublicUrl(fileName);

    return json({
      success: true,
      status: 'completed',
      done: true,
      videoUrl: publicData.publicUrl,
    });
  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
