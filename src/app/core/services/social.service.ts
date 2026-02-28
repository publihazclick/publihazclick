import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase.client';
import { sanitizePostgrestFilter } from '../utils/sanitize';
import type {
  AdvertiserCard,
  SocialConnection,
  SocialConversation,
  SocialMessage,
  SocialBusinessProfile,
  ConnectionStatus,
} from '../models/social.model';

@Injectable({ providedIn: 'root' })
export class SocialService {
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = getSupabaseClient();
  }

  private get currentUserId(): string {
    return this.supabase.auth.getUser().then(() => '') as unknown as string;
  }

  private async getUserId(): Promise<string> {
    const { data } = await this.supabase.auth.getUser();
    return data.user?.id ?? '';
  }

  // ============================================================
  // DIRECTORIO: listar anunciantes
  // ============================================================

  async getDirectory(search = '', page = 0, limit = 20): Promise<AdvertiserCard[]> {
    const userId = await this.getUserId();

    // Obtener perfiles de advertiser, admin y dev
    let query = this.supabase
      .from('profiles')
      .select(`
        id, username, full_name, avatar_url, total_referrals_count, role,
        social_business_profiles (business_name, description, category, location)
      `)
      .in('role', ['advertiser', 'admin', 'dev'])
      .neq('id', userId)
      .eq('is_active', true)
      .range(page * limit, (page + 1) * limit - 1);

    if (search.trim()) {
      const safeSearch = sanitizePostgrestFilter(search);
      if (safeSearch) {
        query = query.or(`username.ilike.%${safeSearch}%,full_name.ilike.%${safeSearch}%`);
      }
    }

    const { data: profiles, error } = await query;
    if (error) throw error;

    // Obtener conexiones del usuario actual
    const { data: connections } = await this.supabase
      .from('social_connections')
      .select('id, requester_id, receiver_id, status')
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`);

    const connMap = new Map<string, { status: ConnectionStatus; id: string; is_requester: boolean }>();
    (connections ?? []).forEach((c: any) => {
      const otherId = c.requester_id === userId ? c.receiver_id : c.requester_id;
      connMap.set(otherId, {
        status: c.status,
        id: c.id,
        is_requester: c.requester_id === userId,
      });
    });

    return (profiles ?? []).map((p: any) => {
      const bp = Array.isArray(p.social_business_profiles)
        ? p.social_business_profiles[0]
        : p.social_business_profiles;
      const conn = connMap.get(p.id);
      return {
        id: p.id,
        username: p.username,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        role: p.role,
        total_referrals_count: p.total_referrals_count ?? 0,
        business_name: bp?.business_name ?? null,
        description: bp?.description ?? null,
        category: bp?.category ?? null,
        location: bp?.location ?? null,
        connection_status: conn?.status ?? null,
        connection_id: conn?.id ?? null,
        is_requester: conn?.is_requester ?? false,
      } as AdvertiserCard;
    });
  }

  // ============================================================
  // PERFIL DE USUARIO
  // ============================================================

  async getUserProfile(userId: string): Promise<AdvertiserCard | null> {
    const currentUserId = await this.getUserId();

    const { data: profile, error } = await this.supabase
      .from('profiles')
      .select(`
        id, username, full_name, avatar_url, total_referrals_count, role,
        social_business_profiles (business_name, description, category, location)
      `)
      .eq('id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !profile) return null;

    let connectionStatus: ConnectionStatus | null = null;
    let connectionId: string | null = null;
    let isRequester = false;

    if (currentUserId && currentUserId !== userId) {
      const { data: conn } = await this.supabase
        .from('social_connections')
        .select('id, status, requester_id')
        .or(`and(requester_id.eq.${currentUserId},receiver_id.eq.${userId}),and(requester_id.eq.${userId},receiver_id.eq.${currentUserId})`)
        .maybeSingle();

      if (conn) {
        connectionStatus = (conn as any).status;
        connectionId = (conn as any).id;
        isRequester = (conn as any).requester_id === currentUserId;
      }
    }

    const bp = Array.isArray((profile as any).social_business_profiles)
      ? (profile as any).social_business_profiles[0]
      : (profile as any).social_business_profiles;

    return {
      id: (profile as any).id,
      username: (profile as any).username,
      full_name: (profile as any).full_name,
      avatar_url: (profile as any).avatar_url,
      role: (profile as any).role,
      total_referrals_count: (profile as any).total_referrals_count ?? 0,
      business_name: bp?.business_name ?? null,
      description: bp?.description ?? null,
      category: bp?.category ?? null,
      location: bp?.location ?? null,
      connection_status: connectionStatus,
      connection_id: connectionId,
      is_requester: isRequester,
    } as AdvertiserCard;
  }

  async getUserProfileByUsername(username: string): Promise<AdvertiserCard | null> {
    const { data: profile, error } = await this.supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !profile) return null;
    return this.getUserProfile((profile as any).id);
  }

  // ============================================================
  // CONEXIONES
  // ============================================================

  async sendConnectionRequest(receiverId: string): Promise<void> {
    const userId = await this.getUserId();
    const { error } = await this.supabase
      .from('social_connections')
      .insert({ requester_id: userId, receiver_id: receiverId, status: 'pending' });
    if (error) throw error;
  }

  async respondToRequest(connectionId: string, accept: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('social_connections')
      .update({ status: accept ? 'accepted' : 'rejected' })
      .eq('id', connectionId);
    if (error) throw error;
  }

  async removeConnection(connectionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('social_connections')
      .delete()
      .eq('id', connectionId);
    if (error) throw error;
  }

  async getPendingRequests(): Promise<SocialConnection[]> {
    const userId = await this.getUserId();
    const { data, error } = await this.supabase
      .from('social_connections')
      .select(`
        id, requester_id, receiver_id, status, created_at, updated_at,
        requester:profiles!social_connections_requester_id_fkey(id, username, full_name, avatar_url)
      `)
      .eq('receiver_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map((c: any) => ({
      ...c,
      other_user: {
        id: c.requester?.id,
        username: c.requester?.username,
        full_name: c.requester?.full_name,
        avatar_url: c.requester?.avatar_url,
        business_name: null,
      },
    }));
  }

  async getMyConnections(): Promise<SocialConnection[]> {
    const userId = await this.getUserId();
    const { data, error } = await this.supabase
      .from('social_connections')
      .select(`
        id, requester_id, receiver_id, status, created_at, updated_at,
        requester:profiles!social_connections_requester_id_fkey(id, username, full_name, avatar_url),
        receiver:profiles!social_connections_receiver_id_fkey(id, username, full_name, avatar_url)
      `)
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
      .eq('status', 'accepted')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map((c: any) => {
      const isRequester = c.requester_id === userId;
      const other = isRequester ? c.receiver : c.requester;
      return {
        id: c.id,
        requester_id: c.requester_id,
        receiver_id: c.receiver_id,
        status: c.status,
        created_at: c.created_at,
        updated_at: c.updated_at,
        other_user: {
          id: other?.id,
          username: other?.username,
          full_name: other?.full_name,
          avatar_url: other?.avatar_url,
          business_name: null,
        },
      };
    });
  }

  async getPendingCount(): Promise<number> {
    const userId = await this.getUserId();
    const { count } = await this.supabase
      .from('social_connections')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .eq('status', 'pending');
    return count ?? 0;
  }

  // ============================================================
  // CONVERSACIONES Y MENSAJES
  // ============================================================

  async getOrCreateConversation(otherUserId: string): Promise<string> {
    const userId = await this.getUserId();
    const [p1, p2] = [userId, otherUserId].sort();

    const { data: existing } = await this.supabase
      .from('social_conversations')
      .select('id')
      .or(
        `and(participant_1.eq.${p1},participant_2.eq.${p2}),and(participant_1.eq.${p2},participant_2.eq.${p1})`
      )
      .maybeSingle();

    if (existing) return existing.id;

    const { data: created, error } = await this.supabase
      .from('social_conversations')
      .insert({ participant_1: p1, participant_2: p2 })
      .select('id')
      .single();

    if (error) throw error;
    return created.id;
  }

  async getConversations(): Promise<SocialConversation[]> {
    const userId = await this.getUserId();
    const { data, error } = await this.supabase
      .from('social_conversations')
      .select(`
        id, participant_1, participant_2, last_message_at, created_at,
        p1:profiles!social_conversations_participant_1_fkey(id, username, full_name, avatar_url),
        p2:profiles!social_conversations_participant_2_fkey(id, username, full_name, avatar_url)
      `)
      .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
      .order('last_message_at', { ascending: false });

    if (error) throw error;

    const convIds = (data ?? []).map((c: any) => c.id);
    let lastMsgMap = new Map<string, string>();
    let unreadMap = new Map<string, number>();

    if (convIds.length > 0) {
      const { data: msgs } = await this.supabase
        .from('social_messages')
        .select('conversation_id, content, sender_id, read_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false });

      const seen = new Set<string>();
      (msgs ?? []).forEach((m: any) => {
        if (!seen.has(m.conversation_id)) {
          seen.add(m.conversation_id);
          lastMsgMap.set(m.conversation_id, m.content);
        }
        if (m.sender_id !== userId && !m.read_at) {
          unreadMap.set(m.conversation_id, (unreadMap.get(m.conversation_id) ?? 0) + 1);
        }
      });
    }

    return (data ?? []).map((c: any) => {
      const isP1 = c.participant_1 === userId;
      const other = isP1 ? c.p2 : c.p1;
      return {
        id: c.id,
        participant_1: c.participant_1,
        participant_2: c.participant_2,
        last_message_at: c.last_message_at,
        created_at: c.created_at,
        other_user: {
          id: other?.id,
          username: other?.username,
          full_name: other?.full_name,
          avatar_url: other?.avatar_url,
          business_name: null,
        },
        last_message: lastMsgMap.get(c.id),
        unread_count: unreadMap.get(c.id) ?? 0,
      };
    });
  }

  async getMessages(conversationId: string): Promise<SocialMessage[]> {
    const { data, error } = await this.supabase
      .from('social_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  async sendMessage(conversationId: string, content: string): Promise<SocialMessage> {
    const userId = await this.getUserId();
    const { data, error } = await this.supabase
      .from('social_messages')
      .insert({ conversation_id: conversationId, sender_id: userId, content, type: 'text' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async markConversationAsRead(conversationId: string): Promise<void> {
    const userId = await this.getUserId();
    await this.supabase
      .from('social_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', userId)
      .is('read_at', null);
  }

  // ============================================================
  // PERFIL DE NEGOCIO
  // ============================================================

  async getBusinessProfile(userId: string): Promise<SocialBusinessProfile | null> {
    const { data } = await this.supabase
      .from('social_business_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    return data ?? null;
  }

  async upsertBusinessProfile(profile: Partial<SocialBusinessProfile>): Promise<void> {
    const userId = await this.getUserId();
    const { error } = await this.supabase
      .from('social_business_profiles')
      .upsert({ ...profile, user_id: userId, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async getUnreadMessagesCount(): Promise<number> {
    const userId = await this.getUserId();
    const { data } = await this.supabase
      .from('social_conversations')
      .select('id')
      .or(`participant_1.eq.${userId},participant_2.eq.${userId}`);

    if (!data || data.length === 0) return 0;
    const ids = data.map((c: any) => c.id);

    const { count } = await this.supabase
      .from('social_messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', ids)
      .neq('sender_id', userId)
      .is('read_at', null);

    return count ?? 0;
  }
}
