/** Estados de campaña SMS */
export type SmsCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed' | 'cancelled';

/** Estados de mensaje SMS individual */
export type SmsMessageStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'rejected';

/** Contacto SMS */
export interface SmsContact {
  id: string;
  user_id: string;
  full_name: string;
  phone_number: string;
  country_code: string;
  tags: string[];
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Grupo de contactos SMS */
export interface SmsContactGroup {
  id: string;
  user_id: string;
  name: string;
  description: string;
  contact_count?: number;
  created_at: string;
}

/** Plantilla de mensaje SMS */
export interface SmsTemplate {
  id: string;
  user_id: string;
  name: string;
  body: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

/** Campaña SMS */
export interface SmsCampaign {
  id: string;
  user_id: string;
  name: string;
  message_body: string;
  template_id?: string;
  status: SmsCampaignStatus;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  cost_per_sms: number;
  total_cost: number;
  created_at: string;
  updated_at: string;
}

/** Destinatario individual de una campaña SMS */
export interface SmsCampaignRecipient {
  id: string;
  campaign_id: string;
  contact_id?: string;
  phone_number: string;
  contact_name?: string;
  status: SmsMessageStatus;
  error_message?: string;
  sent_at?: string;
  delivered_at?: string;
  cost: number;
}

/** Estadísticas del dashboard SMS */
export interface SmsDashboardStats {
  total_contacts: number;
  total_campaigns: number;
  total_sent: number;
  delivered_rate: number;
  failed_rate: number;
  total_cost: number;
}
