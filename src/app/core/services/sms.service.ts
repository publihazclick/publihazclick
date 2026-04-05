import { Injectable } from '@angular/core';
import { getSupabaseClient } from '../supabase.client';
import type {
  SmsContact,
  SmsContactGroup,
  SmsTemplate,
  SmsCampaign,
  SmsCampaignRecipient,
  SmsDashboardStats,
} from '../models/sms.model';

@Injectable({ providedIn: 'root' })
export class SmsService {
  private readonly supabase = getSupabaseClient();

  // ── Contacts ────────────────────────────────────────────────

  async getContacts(userId: string) {
    const { data, error } = await this.supabase
      .from('sms_contacts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as SmsContact[];
  }

  async createContact(data: Partial<SmsContact>) {
    const { data: created, error } = await this.supabase
      .from('sms_contacts')
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return created as SmsContact;
  }

  async updateContact(id: string, data: Partial<SmsContact>) {
    const { data: updated, error } = await this.supabase
      .from('sms_contacts')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return updated as SmsContact;
  }

  async deleteContact(id: string) {
    const { error } = await this.supabase
      .from('sms_contacts')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  async bulkImportContacts(contacts: Partial<SmsContact>[]) {
    const { data, error } = await this.supabase
      .from('sms_contacts')
      .upsert(contacts, { onConflict: 'user_id,phone_number' })
      .select();
    if (error) throw error;
    return data as SmsContact[];
  }

  async getContactCount(userId: string) {
    const { count, error } = await this.supabase
      .from('sms_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw error;
    return count ?? 0;
  }

  // ── Groups ──────────────────────────────────────────────────

  async getGroups(userId: string) {
    const { data, error } = await this.supabase
      .from('sms_contact_groups')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as SmsContactGroup[];
  }

  async createGroup(data: { user_id: string; name: string; description?: string }) {
    const { data: created, error } = await this.supabase
      .from('sms_contact_groups')
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return created as SmsContactGroup;
  }

  async deleteGroup(id: string) {
    const { error } = await this.supabase
      .from('sms_contact_groups')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ── Templates ───────────────────────────────────────────────

  async getTemplates(userId: string) {
    const { data, error } = await this.supabase
      .from('sms_templates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as SmsTemplate[];
  }

  async createTemplate(data: Partial<SmsTemplate>) {
    const { data: created, error } = await this.supabase
      .from('sms_templates')
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return created as SmsTemplate;
  }

  async updateTemplate(id: string, data: Partial<SmsTemplate>) {
    const { data: updated, error } = await this.supabase
      .from('sms_templates')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return updated as SmsTemplate;
  }

  async deleteTemplate(id: string) {
    const { error } = await this.supabase
      .from('sms_templates')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ── Campaigns ───────────────────────────────────────────────

  async getCampaigns(userId: string) {
    const { data, error } = await this.supabase
      .from('sms_campaigns')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as SmsCampaign[];
  }

  async createCampaign(data: Partial<SmsCampaign>) {
    const { data: created, error } = await this.supabase
      .from('sms_campaigns')
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return created as SmsCampaign;
  }

  async updateCampaign(id: string, data: Partial<SmsCampaign>) {
    const { data: updated, error } = await this.supabase
      .from('sms_campaigns')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return updated as SmsCampaign;
  }

  async cancelCampaign(id: string) {
    const { data: updated, error } = await this.supabase
      .from('sms_campaigns')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return updated as SmsCampaign;
  }

  async getCampaignRecipients(campaignId: string) {
    const { data, error } = await this.supabase
      .from('sms_campaign_recipients')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('sent_at', { ascending: false });
    if (error) throw error;
    return data as SmsCampaignRecipient[];
  }

  async addCampaignRecipients(recipients: Partial<SmsCampaignRecipient>[]) {
    const { data, error } = await this.supabase
      .from('sms_campaign_recipients')
      .insert(recipients)
      .select();
    if (error) throw error;
    return data as SmsCampaignRecipient[];
  }

  // ── Enviar campaña vía Twilio ────────────────────────────────

  async sendCampaignSms(campaignId: string): Promise<{ success: boolean; sent?: number; failed?: number; cost?: number; error?: string }> {
    const { data, error } = await this.supabase.functions.invoke('send-sms-campaign', {
      body: { campaign_id: campaignId },
    });
    if (error) return { success: false, error: error.message };
    if (data?.error) return { success: false, error: data.error };
    return { success: true, sent: data.sent, failed: data.failed, cost: data.cost };
  }

  // ── Dashboard Stats ─────────────────────────────────────────

  async getDashboardStats(userId: string): Promise<SmsDashboardStats> {
    const [contactsRes, campaignsRes, sentRes] = await Promise.all([
      this.supabase
        .from('sms_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      this.supabase
        .from('sms_campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      this.supabase
        .from('sms_campaigns')
        .select('sent_count, delivered_count, failed_count, total_cost')
        .eq('user_id', userId),
    ]);

    if (contactsRes.error) throw contactsRes.error;
    if (campaignsRes.error) throw campaignsRes.error;
    if (sentRes.error) throw sentRes.error;

    const campaigns = sentRes.data ?? [];
    const totalSent = campaigns.reduce((sum, c) => sum + (c.sent_count ?? 0), 0);
    const totalDelivered = campaigns.reduce((sum, c) => sum + (c.delivered_count ?? 0), 0);
    const totalFailed = campaigns.reduce((sum, c) => sum + (c.failed_count ?? 0), 0);
    const totalCost = campaigns.reduce((sum, c) => sum + (c.total_cost ?? 0), 0);

    return {
      total_contacts: contactsRes.count ?? 0,
      total_campaigns: campaignsRes.count ?? 0,
      total_sent: totalSent,
      delivered_rate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
      failed_rate: totalSent > 0 ? (totalFailed / totalSent) * 100 : 0,
      total_cost: totalCost,
    };
  }
}

// ── Utility ─────────────────────────────────────────────────

const GSM7_CHARS =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ' +
  ' !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§' +
  '¿abcdefghijklmnopqrstuvwxyzäöñüà';

const GSM7_EXTENDED = new Set(['{', '}', '[', ']', '~', '\\', '|', '^', '€']);

function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!GSM7_CHARS.includes(char) && !GSM7_EXTENDED.has(char)) {
      return false;
    }
  }
  return true;
}

export function calculateSmsSegments(text: string): {
  chars: number;
  segments: number;
  encoding: 'GSM-7' | 'UCS-2';
  maxPerSegment: number;
} {
  const gsm7 = isGsm7(text);

  if (gsm7) {
    // GSM-7: count extended chars as 2
    let chars = 0;
    for (const char of text) {
      chars += GSM7_EXTENDED.has(char) ? 2 : 1;
    }
    const singleMax = 160;
    const concatMax = 153;
    const segments = chars <= singleMax ? 1 : Math.ceil(chars / concatMax);
    return {
      chars,
      segments,
      encoding: 'GSM-7',
      maxPerSegment: chars <= singleMax ? singleMax : concatMax,
    };
  }

  // UCS-2
  const chars = text.length;
  const singleMax = 70;
  const concatMax = 67;
  const segments = chars <= singleMax ? 1 : Math.ceil(chars / concatMax);
  return {
    chars,
    segments,
    encoding: 'UCS-2',
    maxPerSegment: chars <= singleMax ? singleMax : concatMax,
  };
}
