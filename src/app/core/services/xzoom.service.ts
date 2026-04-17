import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { getSupabaseClient } from '../supabase.client';
import type {
  XzoomHost,
  XzoomHostSubscription,
  XzoomViewerSubscription,
  XzoomScheduledSession,
  XzoomLiveSession,
  XzoomLiveKitTokenResponse,
} from '../models/xzoom.model';

@Injectable({ providedIn: 'root' })
export class XzoomService {
  private readonly supabase = getSupabaseClient();

  // ─────────────────────────────────────────────────────────────
  // HOSTS
  // ─────────────────────────────────────────────────────────────

  async getCurrentHostProfile(userId: string): Promise<XzoomHost | null> {
    const { data, error } = await this.supabase
      .from('xzoom_hosts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data as XzoomHost | null;
  }

  async listActiveHosts(): Promise<XzoomHost[]> {
    const { data, error } = await this.supabase
      .from('xzoom_hosts')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as XzoomHost[];
  }

  async getHostBySlug(slug: string): Promise<XzoomHost | null> {
    const { data, error } = await this.supabase
      .from('xzoom_hosts')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw error;
    return data as XzoomHost | null;
  }

  /**
   * Crea el perfil de anfitrión XZOOM para el usuario actual.
   * El slug se deriva del username y se hace único si hace falta.
   */
  async createHostProfile(params: {
    userId: string;
    displayName: string;
    username: string;
    subscriberPriceCop: number;
    bio?: string;
    category?: string;
  }): Promise<XzoomHost> {
    const slug = await this.generateUniqueSlug(params.username);
    const livekitRoomName = `xzoom-${slug}`;

    const { data, error } = await this.supabase
      .from('xzoom_hosts')
      .insert({
        user_id: params.userId,
        slug,
        display_name: params.displayName,
        bio: params.bio ?? null,
        category: params.category ?? null,
        subscriber_price_cop: params.subscriberPriceCop,
        currency: 'COP',
        is_active: true,
        livekit_room_name: livekitRoomName,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as XzoomHost;
  }

  async updateHostProfile(hostId: string, patch: Partial<XzoomHost>): Promise<XzoomHost> {
    const { data, error } = await this.supabase
      .from('xzoom_hosts')
      .update(patch)
      .eq('id', hostId)
      .select('*')
      .single();
    if (error) throw error;
    return data as XzoomHost;
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    const normalized = base
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 35) || 'anfitrion';
    // Asegurar longitud mínima de 3
    const candidate = normalized.length >= 3 ? normalized : `${normalized}-xzoom`;

    // Intentar candidate, luego candidate-2, candidate-3…
    for (let i = 0; i < 20; i++) {
      const slug = i === 0 ? candidate : `${candidate}-${i + 1}`;
      const { data } = await this.supabase
        .from('xzoom_hosts').select('id').eq('slug', slug).maybeSingle();
      if (!data) return slug;
    }
    // fallback con timestamp
    return `${candidate}-${Date.now().toString(36)}`;
  }

  // ─────────────────────────────────────────────────────────────
  // SUSCRIPCIONES (pagos vía Edge Function)
  // ─────────────────────────────────────────────────────────────

  async getHostSubscription(hostId: string): Promise<XzoomHostSubscription | null> {
    const { data, error } = await this.supabase
      .from('xzoom_host_subscriptions')
      .select('*')
      .eq('host_id', hostId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as XzoomHostSubscription | null;
  }

  async createHostSubscriptionCheckout(copAmount: number): Promise<any> {
    const { data, error } = await this.supabase.functions.invoke(
      'create-xzoom-host-subscription',
      { body: { cop_amount: copAmount } },
    );
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  }

  async createViewerSubscriptionCheckout(hostId: string): Promise<any> {
    // fetch directo (igual que getLivekitToken) para garantizar que el header
    // Authorization siempre salga con el access_token del usuario.
    const { data: sess } = await this.supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;
    if (!accessToken) {
      throw new Error('Sesión no iniciada. Cierra sesión e inicia sesión nuevamente.');
    }
    const url = `${environment.supabase.url}/functions/v1/create-xzoom-viewer-subscription`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: environment.supabase.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ host_id: hostId }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error('[createViewerSubscriptionCheckout] HTTP', resp.status, text);
      let msg = `Error ${resp.status}`;
      try {
        const j = JSON.parse(text);
        msg = j.error ?? j.message ?? msg;
      } catch { /* noop */ }
      throw new Error(msg);
    }
    return JSON.parse(text);
  }

  /**
   * Suscripción pública desde la landing privada del anfitrión.
   * No requiere usuario autenticado. Al validar el pago, el webhook crea el
   * auth user con el email indicado y envía un link para setear la clave.
   */
  async createPublicSubscriptionCheckout(params: {
    hostSlug: string;
    email: string;
    fullName: string;
  }): Promise<any> {
    const { data, error } = await this.supabase.functions.invoke(
      'create-xzoom-public-subscription',
      {
        body: {
          host_slug: params.hostSlug,
          email: params.email,
          full_name: params.fullName,
        },
      },
    );
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  }

  async listMyViewerSubscriptions(userId: string): Promise<XzoomViewerSubscription[]> {
    const { data, error } = await this.supabase
      .from('xzoom_viewer_subscriptions')
      .select('*')
      .eq('viewer_user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as XzoomViewerSubscription[];
  }

  async listMyHostSubscribers(hostId: string): Promise<XzoomViewerSubscription[]> {
    const { data, error } = await this.supabase
      .from('xzoom_viewer_subscriptions')
      .select('*')
      .eq('host_id', hostId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as XzoomViewerSubscription[];
  }

  // ─────────────────────────────────────────────────────────────
  // SESIONES PROGRAMADAS
  // ─────────────────────────────────────────────────────────────

  async listScheduledSessions(hostId: string): Promise<XzoomScheduledSession[]> {
    const { data, error } = await this.supabase
      .from('xzoom_scheduled_sessions')
      .select('*')
      .eq('host_id', hostId)
      .order('scheduled_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as XzoomScheduledSession[];
  }

  async createScheduledSession(params: {
    hostId: string;
    title: string;
    description?: string;
    scheduledAt: Date;
    durationMinutes: number;
  }): Promise<XzoomScheduledSession> {
    const { data, error } = await this.supabase
      .from('xzoom_scheduled_sessions')
      .insert({
        host_id: params.hostId,
        title: params.title,
        description: params.description ?? null,
        scheduled_at: params.scheduledAt.toISOString(),
        duration_minutes: params.durationMinutes,
        status: 'scheduled',
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as XzoomScheduledSession;
  }

  async cancelScheduledSession(sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('xzoom_scheduled_sessions')
      .update({ status: 'cancelled' })
      .eq('id', sessionId);
    if (error) throw error;
  }

  // ─────────────────────────────────────────────────────────────
  // BILLETERA XZOOM — RETIRO DE GANANCIAS
  // ─────────────────────────────────────────────────────────────

  async requestXzoomWithdrawal(hostId: string, amountCop: number): Promise<string> {
    const { data, error } = await this.supabase.rpc('xzoom_request_withdrawal', {
      p_host_id: hostId,
      p_amount_cop: amountCop,
    });
    if (error) throw error;
    return data as string;
  }

  // LIVE SESSIONS / GRABACIONES
  // ─────────────────────────────────────────────────────────────

  async listRecordings(hostId: string): Promise<XzoomLiveSession[]> {
    const { data, error } = await this.supabase
      .from('xzoom_live_sessions')
      .select('*')
      .eq('host_id', hostId)
      .eq('recording_status', 'ready')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as XzoomLiveSession[];
  }

  async deleteRecording(sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('xzoom_live_sessions')
      .delete()
      .eq('id', sessionId);
    if (error) throw error;
  }

  // ─────────────────────────────────────────────────────────────
  // LIVEKIT — tokens
  // ─────────────────────────────────────────────────────────────

  async getLivekitToken(hostId: string): Promise<XzoomLiveKitTokenResponse> {
    // Usamos fetch directo en vez de supabase.functions.invoke() porque la
    // invocación vía SDK a veces no incluye el Authorization header en entornos
    // SSR/hydratados, y el gateway de Supabase rechaza con 401. Con fetch
    // controlamos exactamente los headers que salen.
    const { data: sess } = await this.supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;
    if (!accessToken) {
      throw new Error('Sesión no iniciada. Cierra sesión e inicia sesión nuevamente.');
    }

    const url = `${environment.supabase.url}/functions/v1/xzoom-livekit-token`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: environment.supabase.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ host_id: hostId }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      console.error('[getLivekitToken] HTTP', resp.status, text);
      let msg = `Error ${resp.status}`;
      try {
        const j = JSON.parse(text);
        msg = j.error ?? j.message ?? msg;
      } catch { /* noop */ }
      throw new Error(msg);
    }

    try {
      return JSON.parse(text) as XzoomLiveKitTokenResponse;
    } catch {
      throw new Error('Respuesta inválida del servidor');
    }
  }
}
