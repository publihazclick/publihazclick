// Edge Function: ag-admin-action
//
// BUG REAL DE SEGURIDAD encontrado 2026-08-25 (auditoría de vulnerabilidades):
// el panel admin de Movi (anda-gana-admin.component.ts / movi-admin.component.ts)
// llamaba directo a la tabla ag_withdrawals/ag_sos_events con la clave anon de
// Movi, sin ninguna sesión real de Supabase Auth de Movi (el admin nunca inicia
// sesión en el proyecto de Movi, solo en publihazclick) -- por eso las políticas
// RLS que dejaban pasar esas acciones tenían qual:true para el rol public: sin
// eso, el panel admin no podía funcionar porque auth.uid() siempre era null ahí.
// Esta función reemplaza esos UPDATE directos: valida que quien llama es
// realmente un admin/dev de publihazclick (usando su JWT real de publihazclick,
// no de Movi) y solo entonces aplica el cambio en Movi con la service_role key
// (que sí puede saltarse RLS, pero de forma controlada por este código server-side).
//
// Body esperado: { action: 'approve_withdrawal'|'reject_withdrawal'|'resolve_sos'|
//   'list_sos_events'|'approve_driver'|'reject_driver'|'list_drivers'|
//   'create_coupon'|'toggle_coupon'|'list_coupons'|'list_passengers', ... }
// Header: Authorization: Bearer <JWT de sesión real de publihazclick del admin>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MOVI_URL = Deno.env.get('SUPABASE_URL') ?? '';
const MOVI_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const PUBLIHAZCLICK_URL = 'https://btkdmdhzouzvzgyuzgbh.supabase.co';
const PUBLIHAZCLICK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0a2RtZGh6b3V6dnpneXV6Z2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTM3NjcsImV4cCI6MjA4Njg2OTc2N30._vXkGfjlK_lql_KcE9nfBGP8VvkCJXQctNpuZDnYFz8';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** Confirma que el Bearer token es una sesión real de publihazclick con rol admin/dev. */
async function requireAdmin(authHeader: string | null): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  if (!authHeader) return { ok: false, status: 401, error: 'missing_authorization' };

  const userRes = await fetch(`${PUBLIHAZCLICK_URL}/auth/v1/user`, {
    headers: { apikey: PUBLIHAZCLICK_ANON_KEY, Authorization: authHeader },
  });
  if (!userRes.ok) return { ok: false, status: 401, error: 'invalid_publihazclick_session' };
  const user = await userRes.json();
  if (!user?.id) return { ok: false, status: 401, error: 'invalid_publihazclick_session' };

  const profileRes = await fetch(
    `${PUBLIHAZCLICK_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`,
    { headers: { apikey: PUBLIHAZCLICK_ANON_KEY, Authorization: authHeader } }
  );
  if (!profileRes.ok) return { ok: false, status: 403, error: 'profile_lookup_failed' };
  const rows = await profileRes.json();
  const role = rows?.[0]?.role;
  if (role !== 'admin' && role !== 'dev') return { ok: false, status: 403, error: 'not_admin' };

  return { ok: true, userId: user.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = await requireAdmin(req.headers.get('Authorization'));
  if (!admin.ok) return json({ error: admin.error }, admin.status);

  const body = await req.json().catch(() => null);
  if (!body?.action) return json({ error: 'missing_action' }, 400);

  const movi = createClient(MOVI_URL, MOVI_SERVICE_KEY);

  try {
    switch (body.action) {
      case 'approve_withdrawal': {
        if (!body.withdrawal_id) return json({ error: 'missing_withdrawal_id' }, 400);
        const { error } = await movi
          .from('ag_withdrawals')
          .update({ status: 'completed', processed_at: new Date().toISOString() })
          .eq('id', body.withdrawal_id);
        if (error) throw error;
        return json({ ok: true });
      }
      case 'reject_withdrawal': {
        if (!body.withdrawal_id) return json({ error: 'missing_withdrawal_id' }, 400);
        const { error } = await movi
          .from('ag_withdrawals')
          .update({
            status: 'rejected',
            rejection_reason: body.reason ?? null,
            processed_at: new Date().toISOString(),
          })
          .eq('id', body.withdrawal_id);
        if (error) throw error;
        const { error: refundError } = await movi.rpc('ag_admin_refund_withdrawal', {
          p_withdrawal_id: body.withdrawal_id,
        });
        if (refundError) throw refundError;
        return json({ ok: true });
      }
      case 'resolve_sos': {
        if (!body.sos_id) return json({ error: 'missing_sos_id' }, 400);
        // resolved_by es un uuid de ag_users (Movi), no del admin de publihazclick
        // (proyectos distintos) -- se deja sin asignar, la trazabilidad real del
        // admin queda en los logs de esta función.
        const { error } = await movi
          .from('ag_sos_events')
          .update({ status: body.status ?? 'resolved', resolved_at: new Date().toISOString() })
          .eq('id', body.sos_id);
        if (error) throw error;
        return json({ ok: true });
      }
      case 'list_sos_events': {
        const { data, error } = await movi
          .from('ag_sos_events').select('*')
          .order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        return json({ ok: true, data });
      }
      case 'approve_driver': {
        if (!body.driver_id) return json({ error: 'missing_driver_id' }, 400);
        const { error } = await movi
          .from('ag_drivers')
          .update({ status: 'approved', approved_at: new Date().toISOString() })
          .eq('id', body.driver_id);
        if (error) throw error;
        return json({ ok: true });
      }
      case 'reject_driver': {
        if (!body.driver_id) return json({ error: 'missing_driver_id' }, 400);
        const { error } = await movi
          .from('ag_drivers')
          .update({ status: 'rejected', rejection_reason: body.reason ?? null })
          .eq('id', body.driver_id);
        if (error) throw error;
        return json({ ok: true });
      }
      case 'list_drivers': {
        let q = movi.from('ag_drivers').select('*, ag_users(*)').order('created_at', { ascending: false }).limit(500);
        if (body.status) q = q.eq('status', body.status);
        const { data, error } = await q;
        if (error) throw error;
        return json({ ok: true, data });
      }
      case 'create_coupon': {
        const p = body.payload ?? {};
        if (!p.code || !p.title || !p.discountType || p.discountValue == null) {
          return json({ error: 'missing_coupon_fields' }, 400);
        }
        const { error } = await movi.from('ag_coupons').insert({
          code: String(p.code).toUpperCase(),
          title: p.title,
          description: p.description ?? null,
          discount_type: p.discountType,
          discount_value: p.discountValue,
          max_discount_cop: p.maxDiscountCop ?? null,
          min_trip_cop: p.minTripCop ?? 5000,
          max_uses: p.maxUses ?? null,
          max_uses_per_user: p.maxUsesPerUser ?? 1,
          valid_until: p.validUntil ?? null,
        });
        if (error) throw error;
        return json({ ok: true });
      }
      case 'toggle_coupon': {
        if (!body.coupon_id) return json({ error: 'missing_coupon_id' }, 400);
        const { error } = await movi
          .from('ag_coupons')
          .update({ is_active: !!body.active })
          .eq('id', body.coupon_id);
        if (error) throw error;
        return json({ ok: true });
      }
      case 'list_coupons': {
        const { data, error } = await movi
          .from('ag_coupons').select('*').order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        return json({ ok: true, data });
      }
      case 'list_passengers': {
        const { data, error } = await movi
          .from('ag_users').select('*').eq('role', 'passenger').order('created_at', { ascending: false }).limit(500);
        if (error) throw error;
        return json({ ok: true, data });
      }
      case 'set_commission_pct': {
        if (body.pct == null) return json({ error: 'missing_pct' }, 400);
        const pct = Math.max(0, Math.min(15, Number(body.pct)));
        const { error } = await movi
          .from('platform_settings')
          .upsert({ key: 'ag_commission_pct', value: String(pct) }, { onConflict: 'key' });
        if (error) throw error;
        return json({ ok: true });
      }
      case 'list_wa_conversations': {
        const role = body.role === 'conductor' ? 'conductor' : 'pasajero';
        const { data, error } = await movi.rpc('ag_wa_conversations_summary', { p_role: role });
        if (error) throw error;
        const rows = (data ?? []) as Array<Record<string, unknown>>;

        // Nombre real del contacto -- se cruza por los últimos 10 dígitos del
        // teléfono porque ag_users.phone está guardado con formatos mixtos
        // (con o sin +57, ver ag_wa_message_log). Solo pasajeros/conductores
        // reales tienen fila en ag_users -- invitados de WhatsApp sin cuenta
        // simplemente no aparecen con nombre.
        const phones = rows.map(r => String(r.wa_phone));
        const last10 = (p: string) => p.replace(/\D/g, '').slice(-10);
        let nameByLast10: Record<string, string> = {};
        if (phones.length) {
          const { data: users } = await movi.from('ag_users').select('full_name, phone').not('phone', 'is', null);
          for (const u of (users ?? []) as Array<Record<string, unknown>>) {
            const p = u.phone as string | null;
            if (p) nameByLast10[last10(p)] = (u.full_name as string) ?? '';
          }
        }

        // Escalado (solo aplica al canal de soporte a conductores)
        let escalatedSet = new Set<string>();
        if (role === 'conductor' && phones.length) {
          const { data: sessions } = await movi
            .from('ag_wa_support_sessions').select('wa_phone, escalated').eq('escalated', true);
          for (const s of (sessions ?? []) as Array<Record<string, unknown>>) {
            escalatedSet.add(s.wa_phone as string);
          }
        }

        const out = rows.map(r => ({
          ...r,
          contact_name: nameByLast10[last10(String(r.wa_phone))] || null,
          escalated: escalatedSet.has(String(r.wa_phone)),
        }));
        return json({ ok: true, data: out });
      }
      case 'get_stats': {
        // Antes el panel admin sacaba estos conteos con la clave anon
        // directo contra las tablas -- las políticas RLS de ag_users/
        // ag_drivers solo dejan ver los propios registros (auth.uid()), y el
        // admin nunca tiene sesión real en el proyecto de Movi, así que
        // SIEMPRE mostraba 0/0/0/0 sin importar cuántos datos reales
        // hubiera. Confirmado 2026-08-28: 46 pasajeros y 3 conductores
        // aprobados reales, el panel mostraba 0 en ambos.
        const [p, quick, pend, appr, rej] = await Promise.all([
          movi.from('ag_users').select('id', { count: 'exact', head: true }).eq('role', 'passenger'),
          // 'quick' = Registro Rápido: el conductor ya puede aceptar su primer
          // viaje sin documentos ni aprobación (ver anda-gana.component.ts
          // ~L5543). No es lo mismo que 'pending' -- faltaba en el resumen,
          // por eso Pendientes+Aprobados+Rechazados nunca sumaba el total
          // real de conductores que se ve en la pestaña Conductores.
          movi.from('ag_drivers').select('id', { count: 'exact', head: true }).eq('status', 'quick'),
          movi.from('ag_drivers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          movi.from('ag_drivers').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
          movi.from('ag_drivers').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
        ]);
        return json({
          ok: true,
          data: {
            passengers: p.count ?? 0,
            quick: quick.count ?? 0,
            pending: pend.count ?? 0,
            approved: appr.count ?? 0,
            rejected: rej.count ?? 0,
          },
        });
      }
      case 'list_withdrawals': {
        let q = movi.from('ag_withdrawals')
          .select('*, ag_drivers(plate, vehicle_brand, ag_users(full_name, phone))')
          .order('created_at', { ascending: false }).limit(200);
        if (body.status) q = q.eq('status', body.status);
        const { data, error } = await q;
        if (error) throw error;
        return json({ ok: true, data });
      }
      case 'list_active_trips': {
        const { data, error } = await movi
          .from('ag_trip_requests').select('*')
          .in('status', ['in_progress', 'accepted', 'pickup', 'on_route', 'arrived'])
          .order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        return json({ ok: true, data });
      }
      case 'list_cc_requests': {
        let q = movi.from('cc_admin_requests_v').select('*').limit(50);
        if (body.status) q = q.eq('status', body.status);
        const { data, error } = await q;
        if (error) throw error;
        return json({ ok: true, data });
      }
      case 'get_cc_flagged_count': {
        const { count, error } = await movi
          .from('cc_requests').select('id', { count: 'exact', head: true })
          .eq('gps_integrity_flagged', true);
        if (error) throw error;
        return json({ ok: true, data: count ?? 0 });
      }
      case 'get_inicio_stats': {
        const [onlineRes, tripsRes, pendingWd] = await Promise.all([
          movi.from('ag_drivers').select('id', { count: 'exact', head: true }).eq('is_online', true).eq('status', 'approved'),
          movi.from('ag_trip_requests').select('id', { count: 'exact', head: true }).in('status', ['in_progress', 'accepted', 'pickup', 'arrived', 'on_route']),
          movi.from('ag_withdrawals').select('amount').eq('status', 'pending'),
        ]);
        const pendingRows = (pendingWd.data ?? []) as Array<{ amount: number }>;
        return json({
          ok: true,
          data: {
            driversOnline: onlineRes.count ?? 0,
            activeTrips: tripsRes.count ?? 0,
            pendingWithdrawalsCount: pendingRows.length,
            pendingWithdrawalsTotal: pendingRows.reduce((s, w) => s + (w.amount || 0), 0),
          },
        });
      }
      case 'get_total_wallet_balance': {
        const { data, error } = await movi.from('ag_drivers').select('wallet_balance').eq('status', 'approved');
        if (error) throw error;
        const total = (data ?? []).reduce((s: number, d: { wallet_balance: number }) => s + (d.wallet_balance || 0), 0);
        return json({ ok: true, data: total });
      }
      case 'list_trip_history': {
        const { data, error } = await movi
          .from('ag_trip_requests').select('*')
          .in('status', ['completed', 'cancelled'])
          .order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        return json({ ok: true, data });
      }
      case 'list_wa_messages': {
        if (!body.phone) return json({ error: 'missing_phone' }, 400);
        const { data, error } = await movi
          .from('ag_wa_message_log')
          .select('direction, msg_type, body, created_at')
          .eq('wa_phone', body.phone)
          .order('created_at', { ascending: true })
          .limit(500);
        if (error) throw error;
        return json({ ok: true, data });
      }
      case 'set_distance_filter': {
        if (body.meters == null) return json({ error: 'missing_meters' }, 400);
        const meters = Math.max(5, Math.min(500, Number(body.meters)));
        const { error } = await movi
          .from('platform_settings')
          .upsert({ key: 'ag_distance_filter', value: String(meters) }, { onConflict: 'key' });
        if (error) throw error;
        return json({ ok: true });
      }
      default:
        return json({ error: 'unknown_action' }, 400);
    }
  } catch (e) {
    console.error('[ag-admin-action]', e);
    return json({ error: 'internal_error', detail: String(e) }, 500);
  }
});
