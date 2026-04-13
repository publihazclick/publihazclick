import { Injectable } from '@angular/core';
import { getSupabaseClient } from '../supabase.client';
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
    const { data, error } = await this.supabase.functions.invoke('wa-engine', {
      body: { action, ...params },
    });
    if (error) throw new Error(error.message);
    return data;
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
    const instance = result?.instance || null;

    const sessions = await this.getSessions();
    const session = sessions[0] ?? null;

    if (session && instance) {
      await this.supabase.from('wa_sessions')
        .update({ phone_number: instance })
        .eq('id', session.id);
    }

    return { session, instance };
  }

  async getQRCode(instance: string): Promise<{ qrCode: string | null; pairingCode: string | null }> {
    const result = await this.callEngine('get_qr', { instance });
    const data = result?.data;
    return {
      qrCode: data?.code ?? null,
      pairingCode: data?.pairingCode ?? null,
    };
  }

  async getInstanceStatus(instance: string): Promise<string> {
    try {
      const result = await this.callEngine('get_status', { instance });
      const data = result?.data;
      if (Array.isArray(data) && data.length) {
        const state = data[0]?.connectionStatus || data[0]?.state || 'disconnected';
        return state === 'open' ? 'connected' : state;
      }
      return 'disconnected';
    } catch {
      return 'disconnected';
    }
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

  async createCampaign(campaign: Partial<WaCampaign>): Promise<WaCampaign | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const { data } = await this.supabase
      .from('wa_campaigns')
      .insert({ ...campaign, user_id: user.id })
      .select('*, template:wa_templates(*), target_group:wa_contact_groups(*)')
      .single();
    return data;
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
