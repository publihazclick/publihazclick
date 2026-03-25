export type CourseStatus   = 'pending' | 'active' | 'rejected' | 'paused';
export type CourseLevel    = 'beginner' | 'intermediate' | 'advanced';
export type PurchaseStatus = 'pending' | 'completed' | 'refunded';

export const COURSE_LEVEL_LABELS: Record<CourseLevel, string> = {
  beginner:     'Principiante',
  intermediate: 'Intermedio',
  advanced:     'Avanzado',
};

export const COURSE_CATEGORIES = [
  'Marketing Digital', 'Negocios', 'Tecnología', 'Finanzas',
  'Desarrollo Personal', 'Idiomas', 'Arte y Diseño', 'Salud y Bienestar',
  'Programación', 'Fotografía', 'Música', 'Gastronomía', 'General',
] as const;

export interface Course {
  id: string;
  creator_id: string;
  creator_username?: string;
  creator_avatar?: string;
  title: string;
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
  promo_video_url: string | null;
  price_cop: number;
  category: string;
  level: CourseLevel;
  status: CourseStatus;
  rejection_reason: string | null;
  total_sales: number;
  total_revenue_cop: number;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  modules?: CourseModule[];
  total_lessons?: number;
}

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  position: number;
  created_at: string;
  lessons?: CourseLesson[];
}

export interface CourseLesson {
  id: string;
  module_id: string;
  course_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  duration_seconds: number;
  position: number;
  is_free_preview: boolean;
  created_at: string;
  completed?: boolean; // UI only
}

export interface CourseAffiliate {
  id: string;
  course_id: string;
  user_id: string;
  aff_code: string;
  total_sales: number;
  total_earned_cop: number;
  created_at: string;
  course?: Course;
}

export interface CoursePurchase {
  id: string;
  course_id: string;
  buyer_id: string;
  buyer_username?: string;
  affiliate_id: string | null;
  affiliate_username?: string;
  amount_cop: number;
  platform_cut: number;
  creator_cut: number;
  affiliate_cut: number;
  epayco_ref: string | null;
  status: PurchaseStatus;
  created_at: string;
  completed_at: string | null;
  course?: Course;
}

export interface CourseProgress {
  id: string;
  course_id: string;
  user_id: string;
  lesson_id: string;
  completed_at: string;
}

export interface CreateCourseData {
  title: string;
  description?: string;
  thumbnail_url?: string;
  promo_video_url?: string;
  price_cop: number;
  category: string;
  level: CourseLevel;
}

export interface CursoPaymentParams {
  publicKey: string;
  test: boolean;
  name: string;
  description: string;
  invoice: string;
  currency: string;
  amount: string;
  tax_base: string;
  tax: string;
  country: string;
  lang: string;
  email_billing: string;
  name_billing: string;
  extra1: string;
  extra2: string;
  extra3: string;
  confirmation: string;
  response: string;
  payment_db_id: string;
}
