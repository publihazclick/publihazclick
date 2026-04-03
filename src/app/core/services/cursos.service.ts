import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { getSupabaseClient } from '../supabase.client';
import type {
  Course, CourseModule, CourseLesson, CourseAffiliate,
  CoursePurchase, CourseProgress, CreateCourseData, CursoPaymentParams,
} from '../models/cursos.model';

// Porcentajes de distribución
const PCT_PLATFORM  = 0.10;
const PCT_CREATOR   = 0.70;
const PCT_AFFILIATE = 0.20;

@Injectable({ providedIn: 'root' })
export class CursosService {
  private readonly supabase   = getSupabaseClient();
  private readonly platformId = inject(PLATFORM_ID);

  // ── Helpers ───────────────────────────────────────────────────────────────

  generateSlug(title: string): string {
    return title.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')
      + '-' + Date.now().toString(36);
  }

  formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP',
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(amount) + ' COP';
  }

  extractYoutubeId(url: string): string {
    if (!url) return '';
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  // ── Marketplace ───────────────────────────────────────────────────────────

  async getActiveCourses(filters?: { category?: string; level?: string; search?: string }): Promise<Course[]> {
    let q = this.supabase
      .from('courses')
      .select('*, profiles!creator_id(username, avatar_url)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filters?.category) q = q.eq('category', filters.category);
    if (filters?.level)    q = q.eq('level', filters.level);
    if (filters?.search)   q = q.ilike('title', `%${filters.search}%`);

    const { data } = await q;
    return (data ?? []).map((r: any) => ({
      ...r,
      creator_username: r.profiles?.username,
      creator_avatar:   r.profiles?.avatar_url,
    }));
  }

  async getCourseBySlug(slug: string): Promise<Course & { modules: CourseModule[] } | null> {
    const { data: course } = await this.supabase
      .from('courses')
      .select('*, profiles!creator_id(username, avatar_url)')
      .eq('slug', slug)
      .maybeSingle();

    if (!course) return null;

    const { data: modules } = await this.supabase
      .from('course_modules')
      .select('*, course_lessons(*)')
      .eq('course_id', course.id)
      .order('position');

    const formattedModules = (modules ?? []).map((m: any) => ({
      ...m,
      lessons: (m.course_lessons ?? []).sort((a: any, b: any) => a.position - b.position),
    }));

    return {
      ...course,
      creator_username: (course as any).profiles?.username,
      creator_avatar:   (course as any).profiles?.avatar_url,
      modules:          formattedModules,
      total_lessons:    formattedModules.reduce((s: number, m: any) => s + m.lessons.length, 0),
    };
  }

  // ── User purchases ─────────────────────────────────────────────────────────

  async hasPurchased(courseId: string): Promise<boolean> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return false;
    const { count } = await this.supabase
      .from('course_purchases')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', courseId)
      .eq('buyer_id', user.id)
      .eq('status', 'completed');
    return (count ?? 0) > 0;
  }

  async getMyPurchasedCourses(): Promise<(Course & { progress_pct: number })[]> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return [];

    const { data: purchases } = await this.supabase
      .from('course_purchases')
      .select('course_id, courses(*)')
      .eq('buyer_id', user.id)
      .eq('status', 'completed');

    const courseIds = (purchases ?? []).map((p: any) => p.course_id);
    if (!courseIds.length) return [];

    // Get progress for all purchased courses
    const { data: progress } = await this.supabase
      .from('course_progress')
      .select('course_id, lesson_id')
      .eq('user_id', user.id)
      .in('course_id', courseIds);

    const progressMap: Record<string, number> = {};
    (progress ?? []).forEach((p: any) => {
      progressMap[p.course_id] = (progressMap[p.course_id] ?? 0) + 1;
    });

    // Get total lessons per course
    const { data: lessons } = await this.supabase
      .from('course_lessons')
      .select('course_id')
      .in('course_id', courseIds);

    const totalLessonsMap: Record<string, number> = {};
    (lessons ?? []).forEach((l: any) => {
      totalLessonsMap[l.course_id] = (totalLessonsMap[l.course_id] ?? 0) + 1;
    });

    return (purchases ?? []).map((p: any) => ({
      ...p.courses,
      progress_pct: totalLessonsMap[p.course_id]
        ? Math.round((progressMap[p.course_id] ?? 0) / totalLessonsMap[p.course_id] * 100)
        : 0,
    }));
  }

  async getLessonProgress(courseId: string): Promise<Set<string>> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return new Set();
    const { data } = await this.supabase
      .from('course_progress')
      .select('lesson_id')
      .eq('course_id', courseId)
      .eq('user_id', user.id);
    return new Set((data ?? []).map((r: any) => r.lesson_id));
  }

  async markLessonComplete(courseId: string, lessonId: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;
    await this.supabase.from('course_progress').upsert({
      course_id: courseId, user_id: user.id, lesson_id: lessonId,
    }, { onConflict: 'lesson_id,user_id' });
  }

  // ── Creator (mis cursos) ───────────────────────────────────────────────────

  async getMyCourses(): Promise<Course[]> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return [];
    const { data } = await this.supabase
      .from('courses')
      .select('*')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });
    return data ?? [];
  }

  async createCourse(courseData: CreateCourseData): Promise<Course | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await this.supabase
      .from('courses')
      .insert({ ...courseData, creator_id: user.id, slug: this.generateSlug(courseData.title) })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateCourse(id: string, updates: Partial<CreateCourseData> | Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase
      .from('courses')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async deleteCourse(id: string): Promise<void> {
    const { error } = await this.supabase.from('courses').delete().eq('id', id);
    if (error) throw error;
  }

  // ── Modules & Lessons ─────────────────────────────────────────────────────

  async getCourseModules(courseId: string): Promise<CourseModule[]> {
    const { data } = await this.supabase
      .from('course_modules')
      .select('*, course_lessons(*)')
      .eq('course_id', courseId)
      .order('position');
    return (data ?? []).map((m: any) => ({
      ...m,
      lessons: (m.course_lessons ?? []).sort((a: any, b: any) => a.position - b.position),
    }));
  }

  async addModule(courseId: string, title: string): Promise<CourseModule> {
    const { data: existing } = await this.supabase
      .from('course_modules').select('position').eq('course_id', courseId).order('position', { ascending: false }).limit(1);
    const nextPos = (existing?.[0]?.position ?? -1) + 1;
    const { data, error } = await this.supabase
      .from('course_modules').insert({ course_id: courseId, title, position: nextPos }).select().single();
    if (error) throw error;
    return data;
  }

  async updateModule(id: string, title: string, position?: number): Promise<void> {
    const update: Record<string, unknown> = { title };
    if (position !== undefined) update['position'] = position;
    await this.supabase.from('course_modules').update(update).eq('id', id);
  }

  async deleteModule(id: string): Promise<void> {
    await this.supabase.from('course_modules').delete().eq('id', id);
  }

  async addLesson(moduleId: string, courseId: string, data: Partial<CourseLesson>): Promise<CourseLesson> {
    const { data: existing } = await this.supabase
      .from('course_lessons').select('position').eq('module_id', moduleId).order('position', { ascending: false }).limit(1);
    const nextPos = (existing?.[0]?.position ?? -1) + 1;
    const { data: lesson, error } = await this.supabase
      .from('course_lessons')
      .insert({ ...data, module_id: moduleId, course_id: courseId, position: nextPos })
      .select().single();
    if (error) throw error;
    return lesson;
  }

  async updateLesson(id: string, updates: Partial<CourseLesson>): Promise<void> {
    await this.supabase.from('course_lessons').update(updates).eq('id', id);
  }

  async deleteLesson(id: string): Promise<void> {
    await this.supabase.from('course_lessons').delete().eq('id', id);
  }

  // ── Affiliates ────────────────────────────────────────────────────────────

  async joinAsAffiliate(courseId: string): Promise<CourseAffiliate> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const affCode = `crs_${courseId.substring(0, 8)}_${user.id.substring(0, 8)}`;
    const { data, error } = await this.supabase
      .from('course_affiliates')
      .upsert({ course_id: courseId, user_id: user.id, aff_code: affCode }, { onConflict: 'course_id,user_id' })
      .select().single();
    if (error) throw error;
    return data;
  }

  async getMyAffiliateLinks(): Promise<CourseAffiliate[]> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return [];
    const { data } = await this.supabase
      .from('course_affiliates')
      .select('*, courses(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    return (data ?? []).map((r: any) => ({ ...r, course: r.courses }));
  }

  async getMyAffiliateForCourse(courseId: string): Promise<CourseAffiliate | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const { data } = await this.supabase
      .from('course_affiliates').select('*').eq('course_id', courseId).eq('user_id', user.id).maybeSingle();
    return data;
  }

  // ── By ID (player) ────────────────────────────────────────────────────────

  async getCourseById(id: string): Promise<Course & { modules: CourseModule[] } | null> {
    const { data: course } = await this.supabase
      .from('courses')
      .select('*, profiles!creator_id(username, avatar_url)')
      .eq('id', id)
      .maybeSingle();

    if (!course) return null;

    const { data: modules } = await this.supabase
      .from('course_modules')
      .select('*, course_lessons(*)')
      .eq('course_id', id)
      .order('position');

    const formattedModules = (modules ?? []).map((m: any) => ({
      ...m,
      lessons: (m.course_lessons ?? []).sort((a: any, b: any) => a.position - b.position),
    }));

    return {
      ...course,
      creator_username: (course as any).profiles?.username,
      creator_avatar:   (course as any).profiles?.avatar_url,
      modules:          formattedModules,
    };
  }

  // ── Earnings ──────────────────────────────────────────────────────────────

  async getMyCreatorSales(): Promise<CoursePurchase[]> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return [];
    const { data } = await this.supabase
      .from('course_purchases')
      .select('*, courses(title, thumbnail_url), profiles!buyer_id(username)')
      .order('created_at', { ascending: false })
      .limit(100);
    // Filter in JS since nested filter on join doesn't work directly
    const myCourseIds = await this.getMyCoursesIds(user.id);
    return (data ?? [])
      .filter((p: any) => myCourseIds.has(p.course_id))
      .map((p: any) => ({
        ...p,
        course: p.courses,
        buyer_username: p.profiles?.username,
      }));
  }

  private async getMyCoursesIds(userId: string): Promise<Set<string>> {
    const { data } = await this.supabase.from('courses').select('id').eq('creator_id', userId);
    return new Set((data ?? []).map((r: any) => r.id));
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  async getAdminPendingCourses(): Promise<Course[]> {
    const { data } = await this.supabase
      .from('courses')
      .select('*, profiles!creator_id(username)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    return (data ?? []).map((r: any) => ({ ...r, creator_username: r.profiles?.username }));
  }

  async getAdminAllCourses(): Promise<Course[]> {
    const { data } = await this.supabase
      .from('courses')
      .select('*, profiles!creator_id(username)')
      .order('created_at', { ascending: false })
      .limit(200);
    return (data ?? []).map((r: any) => ({ ...r, creator_username: r.profiles?.username }));
  }

  async getAdminAllTransactions(): Promise<CoursePurchase[]> {
    const { data } = await this.supabase
      .from('course_purchases')
      .select('*, courses(title), profiles!buyer_id(username)')
      .order('created_at', { ascending: false })
      .limit(500);
    return (data ?? []).map((p: any) => ({
      ...p,
      course:         p.courses,
      buyer_username: p.profiles?.username,
    }));
  }

  async adminApproveCourse(id: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    const { error } = await this.supabase.from('courses').update({
      status:      'active',
      approved_at: new Date().toISOString(),
      approved_by: user?.id,
    }).eq('id', id);
    if (error) throw error;
  }

  async adminRejectCourse(id: string, reason: string): Promise<void> {
    const { error } = await this.supabase.from('courses').update({
      status:           'rejected',
      rejection_reason: reason,
    }).eq('id', id);
    if (error) throw error;
  }

  // ── Payment (ePayco) ──────────────────────────────────────────────────────

  async createCursoPayment(courseId: string, affCode?: string): Promise<CursoPaymentParams> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('No autenticado');

    const supabaseUrl = (this.supabase as any).supabaseUrl as string;
    const res = await fetch(`${supabaseUrl}/functions/v1/create-curso-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': (this.supabase as any).supabaseKey ?? '',
      },
      body: JSON.stringify({ course_id: courseId, aff_code: affCode }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any)?.error ?? 'Error al crear el pago');
    }
    return res.json();
  }

  async openEpaycoCheckout(params: CursoPaymentParams): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    await this.loadEpaycoScript();
    const epayco = (window as any)['ePayco'] as {
      checkout: { configure: (cfg: unknown) => { open: (p: unknown) => void } };
    };
    const handler = epayco.checkout.configure({
      key:  params.publicKey,
      test: params.test,
    });
    handler.open({
      name:         params.name,
      description:  params.description,
      invoice:      params.invoice,
      currency:     params.currency,
      amount:       params.amount,
      tax_base:     params.tax_base,
      tax:          params.tax,
      country:      params.country,
      lang:         params.lang,
      external:     'false',
      email_billing: params.email_billing,
      name_billing:  params.name_billing,
      extra1:       params.extra1,
      extra2:       params.extra2,
      extra3:       params.extra3,
      confirmation: params.confirmation,
      response:     params.response,
    });
  }

  private loadEpaycoScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any)['ePayco']) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://checkout.epayco.co/checkout.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar ePayco'));
      document.head.appendChild(s);
    });
  }
}
