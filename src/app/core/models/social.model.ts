/**
 * Modelos para la red social de anunciantes
 */

export type ConnectionStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';
export type MessageType = 'text' | 'image' | 'file';

export interface SocialBusinessProfile {
  user_id: string;
  business_name: string | null;
  description: string | null;
  category: string | null;
  website: string | null;
  whatsapp: string | null;
  location: string | null;
  banner_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdvertiserCard {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  business_name: string | null;
  description: string | null;
  category: string | null;
  location: string | null;
  total_referrals_count: number;
  connection_status: ConnectionStatus | null; // null = sin relación
  connection_id: string | null;
}

export interface SocialConnection {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: ConnectionStatus;
  created_at: string;
  updated_at: string;
  // Datos del otro usuario (join)
  other_user?: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    business_name: string | null;
  };
}

export interface SocialConversation {
  id: string;
  participant_1: string;
  participant_2: string;
  last_message_at: string;
  created_at: string;
  // Datos del otro participante (join)
  other_user: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    business_name: string | null;
  };
  // Último mensaje preview
  last_message?: string;
  unread_count?: number;
}

export interface SocialMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  type: MessageType;
  read_at: string | null;
  created_at: string;
}

export interface SendMessageData {
  conversation_id: string;
  content: string;
  type?: MessageType;
}
