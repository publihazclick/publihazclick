// =============================================================================
// Edge Function: create-curso-payment
// Crea un registro de compra de curso y devuelve params para ePayco checkout.
// Distribución: Plataforma 10% | Creador 70% | Afiliado 20% (o 90% sin afiliado)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EPAYCO_PUBLIC_KEY    = Deno.env.get('EPAYCO_PUBLIC_KEY')!;
const EPAYCO_TEST          = Deno.env.get('EPAYCO_TEST') ?? 'true';
const APP_URL              = Deno.env.get('APP_URL') ?? 'https://publihazclick.com';

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

function decodeJwtPayload(token: string): { sub: string; email?: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // ── 1. Verificar JWT ─────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);

    const token      = authHeader.replace('Bearer ', '');
    const jwtPayload = decodeJwtPayload(token);
    const userId     = jwtPayload.sub;
    const userEmail  = jwtPayload.email ?? '';
    if (!userId) return json({ error: 'Token sin user ID' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 2. Parsear body ──────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body?.course_id) return json({ error: 'course_id requerido' }, 400);

    const { course_id, aff_code } = body as { course_id: string; aff_code?: string };

    // ── 3. Obtener curso activo ──────────────────────────────────────────────
    const { data: course } = await supabase
      .from('courses')
      .select('id, title, slug, price_cop, creator_id')
      .eq('id', course_id)
      .eq('status', 'active')
      .single();

    if (!course) return json({ error: 'Curso no encontrado o no activo' }, 404);

    // No puede comprar el creador su propio curso
    if (course.creator_id === userId) return json({ error: 'No puedes comprar tu propio curso' }, 409);

    // ── 4. Verificar que no lo haya comprado ya ──────────────────────────────
    const { count: alreadyBought } = await supabase
      .from('course_purchases')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', course_id)
      .eq('buyer_id', userId)
      .eq('status', 'completed');

    if ((alreadyBought ?? 0) > 0) return json({ error: 'Ya compraste este curso' }, 409);

    // ── 5. Resolver código de afiliado ───────────────────────────────────────
    let affiliateId: string | null = null;
    if (aff_code) {
      const { data: aff } = await supabase
        .from('course_affiliates')
        .select('id, user_id')
        .eq('aff_code', aff_code)
        .eq('course_id', course_id)
        .maybeSingle();

      // El afiliado no puede ser el mismo comprador
      if (aff && aff.user_id !== userId) affiliateId = aff.id;
    }

    // ── 6. Calcular distribución ─────────────────────────────────────────────
    const price          = course.price_cop;
    const platform_cut   = Math.floor(price * 0.10);
    const affiliate_cut  = affiliateId ? Math.floor(price * 0.20) : 0;
    const creator_cut    = price - platform_cut - affiliate_cut;

    // ── 7. Perfil del comprador ──────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, email')
      .eq('id', userId)
      .single();

    // ── 8. Crear registro de compra pendiente ────────────────────────────────
    const { data: purchase, error: purchaseErr } = await supabase
      .from('course_purchases')
      .insert({
        course_id,
        buyer_id:     userId,
        affiliate_id: affiliateId,
        amount_cop:   price,
        platform_cut,
        creator_cut,
        affiliate_cut,
        status: 'pending',
      })
      .select('id')
      .single();

    if (purchaseErr || !purchase) {
      console.error('Error insertando purchase:', purchaseErr);
      return json({ error: 'Error al registrar la compra' }, 500);
    }

    // ── 9. Generar invoice y devolver params de checkout ─────────────────────
    const invoice = `CRS-${Date.now()}-${userId.substring(0, 8).toUpperCase()}`;

    return json({
      publicKey:     EPAYCO_PUBLIC_KEY,
      test:          EPAYCO_TEST === 'true',
      name:          course.title,
      description:   `Curso: ${course.title} — Publihazclick`,
      invoice,
      currency:      'cop',
      amount:        String(price),
      tax_base:      '0',
      tax:           '0',
      country:       'CO',
      lang:          'es',
      email_billing: profile?.email ?? userEmail,
      name_billing:  profile?.username ?? 'Estudiante',
      extra1:        purchase.id,         // course_purchase UUID
      extra2:        course_id,           // course ID
      extra3:        'curso_purchase',    // tipo de pago
      confirmation:  `${SUPABASE_URL}/functions/v1/epayco-webhook`,
      response:      `${APP_URL}/advertiser/cursos/ver/${course.slug}?compra=ok`,
      payment_db_id: purchase.id,
    });

  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
