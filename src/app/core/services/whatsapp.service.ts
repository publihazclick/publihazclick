import { Injectable } from '@angular/core';
import * as QRCode from 'qrcode';
import { getSupabaseClient } from '../supabase.client';
import { environment } from '../../../environments/environment';
import {
  WaSubscription,
  WaSession,
  WaContact,
  WaContactGroup,
  WaTemplate,
  WaCampaign,
  WaCampaignMessage,
  WaDashboardStats,
  WaAntiBlockConfig,
} from '../models/whatsapp.model';

@Injectable({ providedIn: 'root' })
export class WhatsappService {
  private supabase = getSupabaseClient();

  // ─── Subscription ───────────────────────────

  async getSubscription(): Promise<WaSubscription | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const { data } = await this.supabase
      .from('wa_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  }

  async createSubscription(paymentMethod: string, paymentReference: string): Promise<WaSubscription | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const now = new Date();
    const expires = new Date(now);
    expires.setDate(expires.getDate() + 30);
    const { data } = await this.supabase
      .from('wa_subscriptions')
      .insert({
        user_id: user.id,
        status: 'active',
        price: 20.00,
        currency: 'USD',
        started_at: now.toISOString(),
        expires_at: expires.toISOString(),
        payment_method: paymentMethod,
        payment_reference: paymentReference,
      })
      .select()
      .single();
    return data;
  }

  // ─── Engine (Evolution API proxy) ────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async callEngine(action: string, params: Record<string, unknown> = {}): Promise<any> {
    // 1) Garantizar sesión válida (el SDK a veces no refresca a tiempo).
    const { data: sessionData } = await this.supabase.auth.getSession();
    let session = sessionData.session;
    if (!session) {
      throw new Error('Sesión expirada. Por favor vuelve a iniciar sesión.');
    }
    const expiresAtMs = (session.expires_at ?? 0) * 1000;
    if (expiresAtMs && expiresAtMs - Date.now() < 60_000) {
      const { data: refreshed, error: refreshErr } = await this.supabase.auth.refreshSession();
      if (refreshErr || !refreshed.session) {
        throw new Error('No se pudo refrescar la sesión. Vuelve a iniciar sesión.');
      }
      session = refreshed.session;
    }

    // 2) Llamada directa con fetch para controlar la respuesta completa.
    //    Evitamos supabase.functions.invoke porque consume el body del error
    //    internamente y pierde el mensaje real.
    const url = `${environment.supabase.url}/functions/v1/wa-engine`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': environment.supabase.anonKey,
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action, ...params }),
      });
    } catch (e) {
      console.error('[wa-engine] network error', e);
      throw new Error('Error de red al contactar wa-engine');
    }

    const raw = await response.text();
    let parsed: unknown;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }

    if (!response.ok) {
      const body = parsed as { error?: string; message?: string } | null;
      const msg = body?.error || body?.message || raw || `HTTP ${response.status}`;
      console.error('[wa-engine]', { action, status: response.status, body: parsed, raw });
      throw new Error(msg);
    }
    return parsed;
  }

  // ─── Sessions ───────────────────────────────

  async getSessions(): Promise<WaSession[]> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return [];
    const { data } = await this.supabase
      .from('wa_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    return data ?? [];
  }

  async createSession(name: string): Promise<{ session: WaSession | null; instance: string | null }> {
    const result = await this.callEngine('create_instance', { name });
    const instance = result?.instance ?? null;
    const sessionId = result?.session_id ?? null;

    if (sessionId) {
      const { data } = await this.supabase
        .from('wa_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      return { session: data ?? null, instance };
    }
    // Fallback: intentar recuperar por instance/phone_number
    if (instance) {
      const { data } = await this.supabase
        .from('wa_sessions')
        .select('*')
        .eq('phone_number', instance)
        .maybeSingle();
      return { session: data ?? null, instance };
    }
    return { session: null, instance };
  }

  async getQRCode(instance: string): Promise<{ qrCode: string | null; qrImage: string | null; pairingCode: string | null }> {
    const result = await this.callEngine('get_qr', { instance });
    console.log('[wa-engine get_qr response JSON]', JSON.stringify(result, null, 2));

    // Evolution API puede devolver la respuesta en varias formas según version:
    //  - result.data.base64 (imagen lista como data URL)
    //  - result.data.code (string plano del QR que renderizamos localmente)
    //  - result.data.qrcode.{base64|code}
    //  - result.base64 / result.code (plano, sin anidar)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = result ?? {};
    const d = r.data ?? r;
    const qr = d.qrcode ?? d;

    const rawBase64: string | null = qr.base64 ?? d.base64 ?? r.base64 ?? null;
    const code: string | null = qr.code ?? d.code ?? r.code ?? null;
    const pairingCode: string | null = qr.pairingCode ?? d.pairingCode ?? r.pairingCode ?? null;

    let qrImage: string | null = null;
    if (rawBase64) {
      qrImage = rawBase64.startsWith('data:') ? rawBase64 : `data:image/png;base64,${rawBase64}`;
    } else if (code) {
      // Renderizamos el QR en el cliente con la librería qrcode. No depende
      // de que Evolution API envíe la imagen.
      try {
        qrImage = await QRCode.toDataURL(code, {
          errorCorrectionLevel: 'L',
          margin: 1,
          scale: 8,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
      } catch (e) {
        console.error('[wa-engine] error generando QR local', e);
      }
    }

    return { qrCode: code, qrImage, pairingCode };
  }

  async getInstanceStatus(instance: string): Promise<string> {
    try {
      const result = await this.callEngine('get_status', { instance });
      const data = result?.data;
      if (Array.isArray(data) && data.length) {
        const raw = (data[0]?.connectionStatus || data[0]?.state || 'disconnected') as string;
        return this.mapEvolutionState(raw);
      }
      return 'disconnected';
    } catch {
      return 'disconnected';
    }
  }

  /**
   * Mapea los estados de Evolution API a los 4 valores permitidos por el
   * CHECK constraint de wa_sessions.status: connected | disconnected |
   * qr_pending | banned.
   */
  private mapEvolutionState(raw: string): string {
    const s = (raw || '').toLowerCase();
    if (s === 'open' || s === 'connected') return 'connected';
    if (s === 'connecting' || s === 'qrcode' || s === 'qr' || s === 'qr_pending') return 'qr_pending';
    if (s === 'banned' || s === 'blocked') return 'banned';
    return 'disconnected';
  }

  async updateSession(id: string, status: string): Promise<void> {
    await this.supabase.from('wa_sessions').update({ status }).eq('id', id);
  }

  async deleteSession(id: string): Promise<void> {
    // Obtener el nombre de instancia antes de borrar
    const { data: session } = await this.supabase
      .from('wa_sessions').select('phone_number').eq('id', id).single();
    if (session?.phone_number) {
      try { await this.callEngine('delete_instance', { instance: session.phone_number }); } catch {}
    }
    await this.supabase.from('wa_sessions').delete().eq('id', id);
  }

  // ─── Contacts ───────────────────────────────

  async getContacts(search?: string, groupId?: string): Promise<WaContact[]> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return [];
    let query = this.supabase
      .from('wa_contacts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (search) {
      query = query.or(`phone.ilike.%${search}%,name.ilike.%${search}%`);
    }
    const { data } = await query.limit(500);
    let contacts = data ?? [];
    if (groupId) {
      const { data: members } = await this.supabase
        .from('wa_contact_group_members')
        .select('contact_id')
        .eq('group_id', groupId);
      const memberIds = new Set((members ?? []).map(m => m.contact_id));
      contacts = contacts.filter(c => memberIds.has(c.id));
    }
    return contacts;
  }

  async getContactCount(): Promise<number> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return 0;
    const { count } = await this.supabase
      .from('wa_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    return count ?? 0;
  }

  async createContact(contact: Partial<WaContact>): Promise<WaContact | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const { data } = await this.supabase
      .from('wa_contacts')
      .insert({ ...contact, user_id: user.id })
      .select()
      .single();
    return data;
  }

  async updateContact(id: string, updates: Partial<WaContact>): Promise<WaContact | null> {
    const { data } = await this.supabase
      .from('wa_contacts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    return data;
  }

  async deleteContact(id: string): Promise<void> {
    await this.supabase.from('wa_contacts').delete().eq('id', id);
  }

  async importContacts(contacts: { phone: string; name?: string }[]): Promise<number> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return 0;
    const rows = contacts.map(c => ({ user_id: user.id, phone: c.phone, name: c.name ?? null }));
    const { data } = await this.supabase
      .from('wa_contacts')
      .upsert(rows, { onConflict: 'user_id,phone', ignoreDuplicates: true })
      .select();
    return data?.length ?? 0;
  }

  /**
   * Importa contactos desde Excel y devuelve los IDs (existentes + nuevos)
   * para usarlos como target_contact_ids en una campaña. A diferencia de
   * importContacts, hace una segunda consulta para asegurar que los IDs
   * de contactos previamente existentes tambien se incluyan.
   */
  async importContactsForCampaign(
    contacts: { phone: string; name?: string }[],
  ): Promise<{ ids: string[]; imported: number; total: number }> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user || contacts.length === 0) return { ids: [], imported: 0, total: 0 };

    const phones = Array.from(new Set(contacts.map(c => c.phone)));
    const rows = contacts.map(c => ({ user_id: user.id, phone: c.phone, name: c.name ?? null }));

    const { data: imported } = await this.supabase
      .from('wa_contacts')
      .upsert(rows, { onConflict: 'user_id,phone', ignoreDuplicates: true })
      .select('id');

    // Recuperar IDs de TODOS los telefonos (los nuevos + los que ya existian).
    // Supabase limita .in() a ~1000 valores; partimos en lotes para listas grandes.
    const ids: string[] = [];
    for (let i = 0; i < phones.length; i += 800) {
      const batch = phones.slice(i, i + 800);
      const { data } = await this.supabase
        .from('wa_contacts')
        .select('id')
        .eq('user_id', user.id)
        .in('phone', batch);
      if (data) ids.push(...data.map(r => r.id));
    }

    return { ids, imported: imported?.length ?? 0, total: phones.length };
  }

  // ─── Contact Groups ─────────────────────────

  async getGroups(): Promise<WaContactGroup[]> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return [];
    const { data } = await this.supabase
      .from('wa_contact_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    return data ?? [];
  }

  async createGroup(name: string, color: string, description?: string): Promise<WaContactGroup | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const { data } = await this.supabase
      .from('wa_contact_groups')
      .insert({ user_id: user.id, name, color, description: description ?? null })
      .select()
      .single();
    return data;
  }

  async deleteGroup(id: string): Promise<void> {
    await this.supabase.from('wa_contact_groups').delete().eq('id', id);
  }

  async addContactsToGroup(groupId: string, contactIds: string[]): Promise<void> {
    const rows = contactIds.map(cid => ({ contact_id: cid, group_id: groupId }));
    await this.supabase.from('wa_contact_group_members').upsert(rows, { ignoreDuplicates: true });
  }

  async removeContactFromGroup(groupId: string, contactId: string): Promise<void> {
    await this.supabase
      .from('wa_contact_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('contact_id', contactId);
  }

  // ─── Templates ──────────────────────────────

  async getTemplates(): Promise<WaTemplate[]> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return [];
    const { data } = await this.supabase
      .from('wa_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('is_favorite', { ascending: false })
      .order('created_at', { ascending: false });
    return data ?? [];
  }

  async createTemplate(template: Partial<WaTemplate>): Promise<WaTemplate | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const variables = this.extractVariables(template.content ?? '');
    const { data } = await this.supabase
      .from('wa_templates')
      .insert({ ...template, user_id: user.id, variables })
      .select()
      .single();
    return data;
  }

  async updateTemplate(id: string, updates: Partial<WaTemplate>): Promise<WaTemplate | null> {
    if (updates.content) {
      updates.variables = this.extractVariables(updates.content);
    }
    const { data } = await this.supabase
      .from('wa_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    return data;
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.supabase.from('wa_templates').delete().eq('id', id);
  }

  async toggleFavoriteTemplate(id: string, isFavorite: boolean): Promise<void> {
    await this.supabase.from('wa_templates').update({ is_favorite: isFavorite }).eq('id', id);
  }

  // ─── Campaigns ──────────────────────────────

  async getCampaigns(): Promise<WaCampaign[]> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return [];
    const { data } = await this.supabase
      .from('wa_campaigns')
      .select('*, template:wa_templates(*), target_group:wa_contact_groups(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    return data ?? [];
  }

  async createCampaign(campaign: Partial<WaCampaign>): Promise<{ data: WaCampaign | null; error: string | null }> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return { data: null, error: 'Sesión no válida' };
    const { data, error } = await this.supabase
      .from('wa_campaigns')
      .insert({ ...campaign, user_id: user.id })
      .select('*, template:wa_templates(*), target_group:wa_contact_groups(*)')
      .single();
    if (error) {
      console.error('[wa createCampaign]', error);
      return { data: null, error: error.message || 'No se pudo crear la campaña' };
    }
    return { data, error: null };
  }

  async updateCampaign(id: string, updates: Partial<WaCampaign>): Promise<WaCampaign | null> {
    const { data } = await this.supabase
      .from('wa_campaigns')
      .update(updates)
      .eq('id', id)
      .select('*, template:wa_templates(*), target_group:wa_contact_groups(*)')
      .single();
    return data;
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.supabase.from('wa_campaigns').delete().eq('id', id);
  }

  async startCampaign(id: string): Promise<{ ok: boolean; message?: string; error?: string }> {
    try {
      const result = await this.callEngine('start_campaign', { campaign_id: id });
      return { ok: true, message: result?.message };
    } catch (e: unknown) {
      // Fallback: actualizar status en DB directamente
      await this.supabase
        .from('wa_campaigns')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', id);
      return { ok: false, error: e instanceof Error ? e.message : 'Error al iniciar' };
    }
  }

  async sendTestMessage(instance: string, number: string, text: string): Promise<boolean> {
    try {
      await this.callEngine('send_text', { instance, number, text });
      return true;
    } catch {
      return false;
    }
  }

  async pauseCampaign(id: string): Promise<void> {
    await this.supabase.from('wa_campaigns').update({ status: 'paused' }).eq('id', id);
  }

  async cancelCampaign(id: string): Promise<void> {
    await this.supabase.from('wa_campaigns').update({ status: 'cancelled' }).eq('id', id);
  }

  async getCampaignMessages(campaignId: string): Promise<WaCampaignMessage[]> {
    const { data } = await this.supabase
      .from('wa_campaign_messages')
      .select('*, contact:wa_contacts(id,phone,name)')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(200);
    return data ?? [];
  }

  // ─── Dashboard Stats ────────────────────────

  async getDashboardStats(): Promise<WaDashboardStats> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return this.emptyStats();

    const [contacts, groups, campaigns, templates] = await Promise.all([
      this.supabase.from('wa_contacts').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      this.supabase.from('wa_contact_groups').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      this.supabase.from('wa_campaigns').select('*').eq('user_id', user.id),
      this.supabase.from('wa_templates').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);

    const allCampaigns: WaCampaign[] = campaigns.data ?? [];
    const totalSent = allCampaigns.reduce((s, c) => s + c.sent_count, 0);
    const totalDelivered = allCampaigns.reduce((s, c) => s + c.delivered_count, 0);
    const totalFailed = allCampaigns.reduce((s, c) => s + c.failed_count, 0);
    const totalReplies = allCampaigns.reduce((s, c) => s + c.reply_count, 0);
    const activeCampaigns = allCampaigns.filter(c => c.status === 'running').length;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todaySent } = await this.supabase
      .from('wa_campaign_messages')
      .select('*', { count: 'exact', head: true })
      .in('campaign_id', allCampaigns.map(c => c.id))
      .gte('sent_at', todayStart.toISOString())
      .in('status', ['sent', 'delivered', 'replied']);

    return {
      totalContacts: contacts.count ?? 0,
      totalGroups: groups.count ?? 0,
      totalCampaigns: allCampaigns.length,
      totalTemplates: templates.count ?? 0,
      totalSent,
      totalDelivered,
      totalFailed,
      totalReplies,
      deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
      replyRate: totalDelivered > 0 ? (totalReplies / totalDelivered) * 100 : 0,
      activeCampaigns,
      todaySent: todaySent ?? 0,
    };
  }

  // ─── Media Upload ───────────────────────────

  async uploadMedia(file: File): Promise<string | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const ext = file.name.split('.').pop();
    const path = `wa-media/${user.id}/${Date.now()}.${ext}`;
    const { error } = await this.supabase.storage.from('public').upload(path, file);
    if (error) return null;
    const { data } = this.supabase.storage.from('public').getPublicUrl(path);
    return data.publicUrl;
  }

  // ─── Helpers ────────────────────────────────

  private extractVariables(content: string): string[] {
    const matches = content.match(/\{(\w+)\}/g);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.slice(1, -1)))];
  }

  private emptyStats(): WaDashboardStats {
    return {
      totalContacts: 0, totalGroups: 0, totalCampaigns: 0, totalTemplates: 0,
      totalSent: 0, totalDelivered: 0, totalFailed: 0, totalReplies: 0,
      deliveryRate: 0, replyRate: 0, activeCampaigns: 0, todaySent: 0,
    };
  }
}
