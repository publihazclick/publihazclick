import { Component, inject, signal, OnInit, ChangeDetectionStrategy, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CursosService } from '../../../../core/services/cursos.service';
import {
  COURSE_CATEGORIES, COURSE_LEVEL_LABELS,
  type Course, type CourseModule, type CourseLesson, type CourseLevel,
} from '../../../../core/models/cursos.model';

type SellTab = 'info' | 'content' | 'publish';
type SellView = 'list' | 'edit';

@Component({
  selector: 'app-cursos-sell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './cursos-sell.component.html',
  host: { class: 'block bg-gray-900 rounded-2xl p-4 lg:p-6' },
})
export class CursosSellComponent implements OnInit {
  private readonly cursosService = inject(CursosService);

  readonly myCourses     = signal<Course[]>([]);
  readonly loading       = signal(true);
  readonly saving        = signal(false);
  readonly view          = signal<SellView>('list');
  readonly activeTab     = signal<SellTab>('info');
  readonly editCourse    = signal<Course | null>(null);
  readonly modules       = signal<CourseModule[]>([]);
  readonly saveError     = signal<string | null>(null);
  readonly saveSuccess   = signal(false);
  readonly expandedMods  = signal<Set<string>>(new Set());
  readonly editingLesson = signal<string | null>(null);
  readonly previewYtId   = signal<string>('');
  readonly deletingId    = signal<string | null>(null);

  // Form fields
  title       = '';
  description = '';
  thumbnail   = '';
  promoVideo  = '';
  priceCop    = 0;
  category    = COURSE_CATEGORIES[0] as string;
  level: CourseLevel = 'beginner';

  // New module
  newModuleTitle = '';

  // New lesson per module (keyed by module id)
  newLessonData: Record<string, {
    title: string; videoUrl: string; description: string;
    durationMin: number; isFree: boolean;
  }> = {};

  // Inline edit lesson form
  editLessonData: {
    title: string; videoUrl: string; description: string;
    durationMin: number; isFree: boolean;
  } = { title: '', videoUrl: '', description: '', durationMin: 0, isFree: false };

  readonly categories  = COURSE_CATEGORIES;
  readonly levelLabels = COURSE_LEVEL_LABELS;
  readonly levels: CourseLevel[] = ['beginner', 'intermediate', 'advanced'];

  readonly statusConfig = {
    pending:  { text: 'En revisión',  icon: 'schedule',     cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',   desc: 'El equipo revisará tu curso pronto.' },
    active:   { text: 'Activo',       icon: 'check_circle', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', desc: 'Tu curso está publicado y visible.' },
    rejected: { text: 'Rechazado',    icon: 'cancel',       cls: 'bg-red-500/10 text-red-400 border-red-500/20',             desc: 'Revisa el motivo y corrígelo.' },
    paused:   { text: 'Pausado',      icon: 'pause_circle', cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20',       desc: 'Tu curso está oculto temporalmente.' },
  };

  readonly completeness = computed(() => {
    const mods = this.modules();
    const hasTitle       = !!this.title.trim();
    const hasDescription = this.description.trim().length >= 50;
    const hasPrice       = this.priceCop > 0;
    const hasCategory    = !!this.category;
    const hasThumbnail   = !!this.thumbnail.trim();
    const hasPromoVideo  = !!this.promoVideo.trim();
    const hasModules     = mods.length > 0;
    const hasLessons     = mods.some(m => (m.lessons?.length ?? 0) > 0);
    const checks = [hasTitle, hasDescription, hasPrice, hasCategory, hasThumbnail, hasModules, hasLessons];
    const score  = Math.round(checks.filter(Boolean).length / checks.length * 100);
    return { hasTitle, hasDescription, hasPrice, hasCategory, hasThumbnail, hasPromoVideo, hasModules, hasLessons, score };
  });

  async ngOnInit(): Promise<void> {
    await this.loadCourses();
  }

  async loadCourses(): Promise<void> {
    this.loading.set(true);
    this.myCourses.set(await this.cursosService.getMyCourses());
    this.loading.set(false);
  }

  async openCreate(): Promise<void> {
    this.resetForm();
    this.editCourse.set(null);
    this.modules.set([]);
    this.activeTab.set('info');
    this.view.set('edit');
  }

  async openEdit(course: Course): Promise<void> {
    this.resetForm();
    this.editCourse.set(course);
    this.title       = course.title;
    this.description = course.description ?? '';
    this.thumbnail   = course.thumbnail_url ?? '';
    this.promoVideo  = course.promo_video_url ?? '';
    this.priceCop    = course.price_cop;
    this.category    = course.category as string;
    this.level       = course.level;
    this.previewYtId.set(this.promoVideo ? this.cursosService.extractYoutubeId(this.promoVideo) : '');
    const mods = await this.cursosService.getCourseModules(course.id);
    this.modules.set(mods);
    // Expand all modules
    this.expandedMods.set(new Set(mods.map(m => m.id)));
    this.activeTab.set('info');
    this.view.set('edit');
  }

  backToList(): void {
    this.view.set('list');
    this.loadCourses();
  }

  onPromoVideoChange(val: string): void {
    this.promoVideo = val;
    const id = val ? this.cursosService.extractYoutubeId(val) : '';
    this.previewYtId.set(id);
  }

  // ── Save course info ───────────────────────────────────────────────────────

  async save(): Promise<void> {
    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(false);
    try {
      const data = {
        title:           this.title,
        description:     this.description || null,
        thumbnail_url:   this.thumbnail   || null,
        promo_video_url: this.promoVideo  || null,
        price_cop:       this.priceCop,
        category:        this.category,
        level:           this.level,
      };
      const ec = this.editCourse();
      if (ec) {
        await this.cursosService.updateCourse(ec.id, data as any);
        this.editCourse.set({ ...ec, ...data } as Course);
      } else {
        const created = await this.cursosService.createCourse(data as any);
        this.editCourse.set(created);
        // Auto-advance to content tab after creating
        setTimeout(() => this.activeTab.set('content'), 400);
      }
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(false), 3000);
    } catch (e: any) {
      this.saveError.set(e?.message ?? 'Error al guardar');
    }
    this.saving.set(false);
  }

  // ── Modules ───────────────────────────────────────────────────────────────

  toggleModule(modId: string): void {
    const s = new Set(this.expandedMods());
    s.has(modId) ? s.delete(modId) : s.add(modId);
    this.expandedMods.set(s);
  }

  isExpanded(modId: string): boolean { return this.expandedMods().has(modId); }

  async addModule(): Promise<void> {
    const course = this.editCourse();
    if (!course || !this.newModuleTitle.trim()) return;
    const mod = await this.cursosService.addModule(course.id, this.newModuleTitle.trim());
    this.newModuleTitle = '';
    const mods = await this.cursosService.getCourseModules(course.id);
    this.modules.set(mods);
    const s = new Set(this.expandedMods());
    s.add(mod.id);
    this.expandedMods.set(s);
  }

  async moveModule(modId: string, dir: 'up' | 'down'): Promise<void> {
    const course = this.editCourse();
    if (!course) return;
    const mods = [...this.modules()];
    const idx = mods.findIndex(m => m.id === modId);
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === mods.length - 1) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    [mods[idx], mods[swapIdx]] = [mods[swapIdx], mods[idx]];
    // Optimistic update
    this.modules.set(mods);
    // Persist new positions
    await Promise.all([
      this.cursosService.updateModule(mods[idx].id, mods[idx].title, idx),
      this.cursosService.updateModule(mods[swapIdx].id, mods[swapIdx].title, swapIdx),
    ]);
  }

  async deleteModule(modId: string): Promise<void> {
    const course = this.editCourse();
    if (!course || !confirm('¿Eliminar este módulo y todas sus lecciones?')) return;
    this.deletingId.set(modId);
    await this.cursosService.deleteModule(modId);
    const mods = await this.cursosService.getCourseModules(course.id);
    this.modules.set(mods);
    this.deletingId.set(null);
  }

  // ── Lessons ───────────────────────────────────────────────────────────────

  initNewLesson(modId: string): void {
    if (!this.newLessonData[modId]) {
      this.newLessonData[modId] = { title: '', videoUrl: '', description: '', durationMin: 0, isFree: false };
    }
  }

  getNewLesson(modId: string): { title: string; videoUrl: string; description: string; durationMin: number; isFree: boolean } {
    this.initNewLesson(modId);
    return this.newLessonData[modId];
  }

  async addLesson(mod: CourseModule): Promise<void> {
    const course = this.editCourse();
    const d = this.newLessonData[mod.id];
    if (!course || !d?.title.trim()) return;
    await this.cursosService.addLesson(mod.id, course.id, {
      title:            d.title.trim(),
      video_url:        d.videoUrl || undefined,
      description:      d.description || undefined,
      is_free_preview:  d.isFree,
      duration_seconds: d.durationMin * 60,
    });
    this.newLessonData[mod.id] = { title: '', videoUrl: '', description: '', durationMin: 0, isFree: false };
    const mods = await this.cursosService.getCourseModules(course.id);
    this.modules.set(mods);
  }

  startEditLesson(lesson: CourseLesson): void {
    this.editingLesson.set(lesson.id);
    this.editLessonData = {
      title:       lesson.title,
      videoUrl:    lesson.video_url ?? '',
      description: lesson.description ?? '',
      durationMin: Math.round(lesson.duration_seconds / 60),
      isFree:      lesson.is_free_preview,
    };
  }

  cancelEditLesson(): void { this.editingLesson.set(null); }

  async saveLesson(lesson: CourseLesson): Promise<void> {
    const course = this.editCourse();
    if (!course) return;
    const d = this.editLessonData;
    await this.cursosService.updateLesson(lesson.id, {
      title:            d.title.trim(),
      video_url:        d.videoUrl || null,
      description:      d.description || null,
      is_free_preview:  d.isFree,
      duration_seconds: d.durationMin * 60,
    });
    this.editingLesson.set(null);
    const mods = await this.cursosService.getCourseModules(course.id);
    this.modules.set(mods);
  }

  async moveLesson(mod: CourseModule, lessonId: string, dir: 'up' | 'down'): Promise<void> {
    const course = this.editCourse();
    if (!course) return;
    const lessons = [...(mod.lessons ?? [])];
    const idx = lessons.findIndex(l => l.id === lessonId);
    if (dir === 'up' && idx === 0) return;
    if (dir === 'down' && idx === lessons.length - 1) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    [lessons[idx], lessons[swapIdx]] = [lessons[swapIdx], lessons[idx]];
    // Update modules optimistically
    const mods = this.modules().map(m => m.id === mod.id ? { ...m, lessons } : m);
    this.modules.set(mods);
    await Promise.all([
      this.cursosService.updateLesson(lessons[idx].id, { position: idx }),
      this.cursosService.updateLesson(lessons[swapIdx].id, { position: swapIdx }),
    ]);
  }

  async deleteLesson(mod: CourseModule, lessonId: string): Promise<void> {
    const course = this.editCourse();
    if (!course || !confirm('¿Eliminar esta lección?')) return;
    this.deletingId.set(lessonId);
    await this.cursosService.deleteLesson(lessonId);
    const mods = await this.cursosService.getCourseModules(course.id);
    this.modules.set(mods);
    this.deletingId.set(null);
  }

  getYoutubeId(url: string): string { return url ? this.cursosService.extractYoutubeId(url) : ''; }

  // ── Course deletion ───────────────────────────────────────────────────────

  async deleteCourse(course: Course): Promise<void> {
    if (!confirm(`¿Eliminar permanentemente "${course.title}"? Esta acción no se puede deshacer.`)) return;
    await this.cursosService.deleteCourse(course.id);
    await this.loadCourses();
  }

  getTotalLessons(course: Course): number {
    return (course as any).total_lessons ?? 0;
  }

  formatCOP(v: number): string { return this.cursosService.formatCOP(v); }

  private resetForm(): void {
    this.title = ''; this.description = ''; this.thumbnail = '';
    this.promoVideo = ''; this.priceCop = 0;
    this.category = COURSE_CATEGORIES[0] as string; this.level = 'beginner';
    this.newModuleTitle = ''; this.newLessonData = {};
    this.expandedMods.set(new Set()); this.editingLesson.set(null);
    this.previewYtId.set('');
    this.saveError.set(null); this.saveSuccess.set(false);
  }
}
