import { Injectable } from '@angular/core';
import { getSupabaseClient } from '../supabase.client';
import {
  FbSubscription, FbSession, FbGroup, FbPage,
  FbPostTemplate, FbMessageTemplate, FbCampaign,
  FbScheduledPost, FbDashboardStats,
} from '../models/facebook.model';

@Injectable({ providedIn: 'root' })
export class FacebookService {
  private supabase = getSupabaseClient();

  private async userId(): Promise<string | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    return user?.id ?? null;
  }

  // ─── Subscription ───────────────────────────
  async getSubscription(): Promise<FbSubscription | null> {
    const uid = await this.userId();
    if (!uid) return null;
    const { data } = await this.supabase.from('fb_subscriptions')
      .select('*').eq('user_id', uid).eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return data;
  }

  // ─── Sessions ───────────────────────────────
  async getSessions(): Promise<FbSession[]> {
    const uid = await this.userId();
    if (!uid) return [];
    const { data } = await this.supabase.from('fb_sessions')
      .select('*').eq('user_id', uid).order('created_at', { ascending: false });
    return data ?? [];
  }

  async createSession(name: string): Promise<FbSession | null> {
    const uid = await this.userId();
    if (!uid) return null;
    const { data } = await this.supabase.from('fb_sessions')
      .insert({ user_id: uid, account_name: name }).select().single();
    return data;
  }

  async deleteSession(id: string): Promise<void> {
    await this.supabase.from('fb_sessions').delete().eq('id', id);
  }

  // ─── Groups ─────────────────────────────────
  async getGroups(status?: string): Promise<FbGroup[]> {
    const uid = await this.userId();
    if (!uid) return [];
    let q = this.supabase.from('fb_groups').select('*').eq('user_id', uid);
    if (status) q = q.eq('status', status);
    const { data } = await q.order('name');
    return data ?? [];
  }

  async createGroup(group: Partial<FbGroup>): Promise<FbGroup | null> {
    const uid = await this.userId();
    if (!uid) return null;
    const { data } = await this.supabase.from('fb_groups')
      .insert({ ...group, user_id: uid }).select().single();
    return data;
  }

  async updateGroup(id: string, updates: Partial<FbGroup>): Promise<void> {
    await this.supabase.from('fb_groups').update(updates).eq('id', id);
  }

  async deleteGroup(id: string): Promise<void> {
    await this.supabase.from('fb_groups').delete().eq('id', id);
  }

  // ─── Pages ──────────────────────────────────
  async getPages(): Promise<FbPage[]> {
    const uid = await this.userId();
    if (!uid) return [];
    const { data } = await this.supabase.from('fb_pages')
      .select('*').eq('user_id', uid).order('name');
    return data ?? [];
  }

  async createPage(page: Partial<FbPage>): Promise<FbPage | null> {
    const uid = await this.userId();
    if (!uid) return null;
    const { data } = await this.supabase.from('fb_pages')
      .insert({ ...page, user_id: uid }).select().single();
    return data;
  }

  async deletePage(id: string): Promise<void> {
    await this.supabase.from('fb_pages').delete().eq('id', id);
  }

  // ─── Post Templates ─────────────────────────
  async getPostTemplates(): Promise<FbPostTemplate[]> {
    const uid = await this.userId();
    if (!uid) return [];
    const { data } = await this.supabase.from('fb_post_templates')
      .select('*').eq('user_id', uid)
      .order('is_favorite', { ascending: false }).order('created_at', { ascending: false });
    return data ?? [];
  }

  async createPostTemplate(t: Partial<FbPostTemplate>): Promise<FbPostTemplate | null> {
    const uid = await this.userId();
    if (!uid) return null;
    const variables = this.extractVars(t.content ?? '');
    const { data } = await this.supabase.from('fb_post_templates')
      .insert({ ...t, user_id: uid, variables }).select().single();
    return data;
  }

  async updatePostTemplate(id: string, t: Partial<FbPostTemplate>): Promise<void> {
    if (t.content) t.variables = this.extractVars(t.content);
    await this.supabase.from('fb_post_templates').update(t).eq('id', id);
  }

  async deletePostTemplate(id: string): Promise<void> {
    await this.supabase.from('fb_post_templates').delete().eq('id', id);
  }

  // ─── Message Templates ──────────────────────
  async getMessageTemplates(): Promise<FbMessageTemplate[]> {
    const uid = await this.userId();
    if (!uid) return [];
    const { data } = await this.supabase.from('fb_message_templates')
      .select('*').eq('user_id', uid)
      .order('is_favorite', { ascending: false }).order('created_at', { ascending: false });
    return data ?? [];
  }

  async createMessageTemplate(t: Partial<FbMessageTemplate>): Promise<FbMessageTemplate | null> {
    const uid = await this.userId();
    if (!uid) return null;
    const variables = this.extractVars(t.content ?? '');
    const { data } = await this.supabase.from('fb_message_templates')
      .insert({ ...t, user_id: uid, variables }).select().single();
    return data;
  }

  async updateMessageTemplate(id: string, t: Partial<FbMessageTemplate>): Promise<void> {
    if (t.content) t.variables = this.extractVars(t.content);
    await this.supabase.from('fb_message_templates').update(t).eq('id', id);
  }

  async deleteMessageTemplate(id: string): Promise<void> {
    await this.supabase.from('fb_message_templates').delete().eq('id', id);
  }

  // ─── Campaigns ──────────────────────────────
  async getCampaigns(): Promise<FbCampaign[]> {
    const uid = await this.userId();
    if (!uid) return [];
    const { data } = await this.supabase.from('fb_campaigns')
      .select('*, post_template:fb_post_templates(*), message_template:fb_message_templates(*)')
      .eq('user_id', uid).order('created_at', { ascending: false });
    return data ?? [];
  }

  async createCampaign(c: Partial<FbCampaign>): Promise<FbCampaign | null> {
    const uid = await this.userId();
    if (!uid) return null;
    const { data } = await this.supabase.from('fb_campaigns')
      .insert({ ...c, user_id: uid }).select().single();
    return data;
  }

  async updateCampaignStatus(id: string, status: string): Promise<void> {
    const updates: Record<string, unknown> = { status };
    if (status === 'running') updates['started_at'] = new Date().toISOString();
    if (status === 'completed') updates['completed_at'] = new Date().toISOString();
    await this.supabase.from('fb_campaigns').update(updates).eq('id', id);
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.supabase.from('fb_campaigns').delete().eq('id', id);
  }

  // ─── Scheduled Posts ────────────────────────
  async getScheduledPosts(): Promise<FbScheduledPost[]> {
    const uid = await this.userId();
    if (!uid) return [];
    const { data } = await this.supabase.from('fb_scheduled_posts')
      .select('*').eq('user_id', uid).order('scheduled_at', { ascending: true });
    return data ?? [];
  }

  async createScheduledPost(p: Partial<FbScheduledPost>): Promise<FbScheduledPost | null> {
    const uid = await this.userId();
    if (!uid) return null;
    const { data } = await this.supabase.from('fb_scheduled_posts')
      .insert({ ...p, user_id: uid }).select().single();
    return data;
  }

  async deleteScheduledPost(id: string): Promise<void> {
    await this.supabase.from('fb_scheduled_posts').delete().eq('id', id);
  }

  // ─── Dashboard ──────────────────────────────
  async getDashboardStats(): Promise<FbDashboardStats> {
    const uid = await this.userId();
    if (!uid) return this.emptyStats();

    const [groups, pages, campaigns, scheduled] = await Promise.all([
      this.supabase.from('fb_groups').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'joined'),
      this.supabase.from('fb_pages').select('*', { count: 'exact', head: true }).eq('user_id', uid),
      this.supabase.from('fb_campaigns').select('*').eq('user_id', uid),
      this.supabase.from('fb_scheduled_posts').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'scheduled'),
    ]);

    const all: FbCampaign[] = campaigns.data ?? [];
    const totalSuccess = all.reduce((s, c) => s + c.success_count, 0);
    const totalCompleted = all.reduce((s, c) => s + c.completed_count, 0);
    const totalPosts = all.filter(c => ['group_post', 'page_post', 'scheduled_post'].includes(c.campaign_type)).reduce((s, c) => s + c.success_count, 0);
    const totalMessages = all.filter(c => ['group_message', 'friend_message', 'page_message'].includes(c.campaign_type)).reduce((s, c) => s + c.success_count, 0);
    const totalJoins = all.filter(c => c.campaign_type === 'group_join').reduce((s, c) => s + c.success_count, 0);

    return {
      totalGroups: groups.count ?? 0,
      totalPages: pages.count ?? 0,
      totalCampaigns: all.length,
      activeCampaigns: all.filter(c => c.status === 'running').length,
      totalPostsSent: totalPosts,
      totalMessagesSent: totalMessages,
      totalGroupJoins: totalJoins,
      scheduledPosts: scheduled.count ?? 0,
      successRate: totalCompleted > 0 ? (totalSuccess / totalCompleted) * 100 : 0,
      todayActions: 0,
    };
  }

  // ─── Media Upload ───────────────────────────
  async uploadMedia(file: File): Promise<string | null> {
    const uid = await this.userId();
    if (!uid) return null;
    const ext = file.name.split('.').pop();
    const path = `fb-media/${uid}/${Date.now()}.${ext}`;
    const { error } = await this.supabase.storage.from('public').upload(path, file);
    if (error) return null;
    const { data } = this.supabase.storage.from('public').getPublicUrl(path);
    return data.publicUrl;
  }

  private extractVars(content: string): string[] {
    const m = content.match(/\{(\w+)\}/g);
    return m ? [...new Set(m.map(v => v.slice(1, -1)))] : [];
  }

  private emptyStats(): FbDashboardStats {
    return { totalGroups: 0, totalPages: 0, totalCampaigns: 0, activeCampaigns: 0, totalPostsSent: 0, totalMessagesSent: 0, totalGroupJoins: 0, scheduledPosts: 0, successRate: 0, todayActions: 0 };
  }
}
