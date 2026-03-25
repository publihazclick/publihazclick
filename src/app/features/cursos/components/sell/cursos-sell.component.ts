import { Component, inject, signal, OnInit, ChangeDetectionStrategy, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CursosService } from '../../../../core/services/cursos.service';
import {
  COURSE_CATEGORIES, COURSE_LEVEL_LABELS,
  type Course, type CourseModule, type CourseLesson, type CourseLevel,
} from '../../../../core/models/cursos.model';

type SellView = 'list' | 'create' | 'edit';

@Component({
  selector: 'app-cursos-sell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './cursos-sell.component.html',
})
export class CursosSellComponent implements OnInit {
  private readonly cursosService = inject(CursosService);

  readonly myCourses   = signal<Course[]>([]);
  readonly loading     = signal(true);
  readonly saving      = signal(false);
  readonly view        = signal<SellView>('list');
  readonly editCourse  = signal<Course | null>(null);
  readonly modules     = signal<CourseModule[]>([]);
  readonly saveError   = signal<string | null>(null);
  readonly saveSuccess = signal(false);

  // Form fields
  title       = '';
  description = '';
  thumbnail   = '';
  promoVideo  = '';
  priceCop    = 0;
  category    = COURSE_CATEGORIES[0] as string;
  level: CourseLevel = 'beginner';

  // New module/lesson inputs
  newModuleTitle = '';
  newLessonTitle: Record<string, string> = {};
  newLessonVideo: Record<string, string> = {};
  newLessonFree: Record<string, boolean> = {};
  newLessonDuration: Record<string, number> = {};

  readonly categories  = COURSE_CATEGORIES;
  readonly levelLabels = COURSE_LEVEL_LABELS;
  readonly levels: CourseLevel[] = ['beginner', 'intermediate', 'advanced'];

  readonly statusLabel = computed(() => ({
    pending:  { text: 'En revisión', cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
    active:   { text: 'Activo',      cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    rejected: { text: 'Rechazado',  cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
    paused:   { text: 'Pausado',    cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  }));

  async ngOnInit(): Promise<void> {
    await this.loadCourses();
  }

  async loadCourses(): Promise<void> {
    this.loading.set(true);
    this.myCourses.set(await this.cursosService.getMyCourses());
    this.loading.set(false);
  }

  openCreate(): void {
    this.resetForm();
    this.editCourse.set(null);
    this.modules.set([]);
    this.view.set('create');
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
    const mods = await this.cursosService.getCourseModules(course.id);
    this.modules.set(mods);
    this.view.set('edit');
  }

  backToList(): void {
    this.view.set('list');
    this.loadCourses();
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(false);
    try {
      const data = {
        title: this.title,
        description: this.description || null,
        thumbnail_url: this.thumbnail || null,
        promo_video_url: this.promoVideo || null,
        price_cop: this.priceCop,
        category: this.category,
        level: this.level,
      };
      const ec = this.editCourse();
      if (ec) {
        await this.cursosService.updateCourse(ec.id, data as any);
        this.editCourse.set({ ...ec, ...data } as Course);
      } else {
        const created = await this.cursosService.createCourse(data as any);
        this.editCourse.set(created);
        this.view.set('edit');
      }
      this.saveSuccess.set(true);
      setTimeout(() => this.saveSuccess.set(false), 3000);
    } catch (e: any) {
      this.saveError.set(e?.message ?? 'Error al guardar');
    }
    this.saving.set(false);
  }

  async addModule(): Promise<void> {
    const course = this.editCourse();
    if (!course || !this.newModuleTitle.trim()) return;
    await this.cursosService.addModule(course.id, this.newModuleTitle.trim());
    this.newModuleTitle = '';
    const mods = await this.cursosService.getCourseModules(course.id);
    this.modules.set(mods);
  }

  async deleteModule(modId: string): Promise<void> {
    const course = this.editCourse();
    if (!course) return;
    await this.cursosService.deleteModule(modId);
    const mods = await this.cursosService.getCourseModules(course.id);
    this.modules.set(mods);
  }

  async addLesson(mod: CourseModule): Promise<void> {
    const course = this.editCourse();
    const title = this.newLessonTitle[mod.id]?.trim();
    if (!course || !title) return;
    await this.cursosService.addLesson(mod.id, course.id, {
      title,
      video_url:        this.newLessonVideo[mod.id] || undefined,
      is_free_preview:  this.newLessonFree[mod.id] ?? false,
      duration_seconds: this.newLessonDuration[mod.id] ?? 0,
    });
    this.newLessonTitle[mod.id]    = '';
    this.newLessonVideo[mod.id]    = '';
    this.newLessonFree[mod.id]     = false;
    this.newLessonDuration[mod.id] = 0;
    const mods = await this.cursosService.getCourseModules(course.id);
    this.modules.set(mods);
  }

  async deleteLesson(lessonId: string): Promise<void> {
    const course = this.editCourse();
    if (!course) return;
    await this.cursosService.deleteLesson(lessonId);
    const mods = await this.cursosService.getCourseModules(course.id);
    this.modules.set(mods);
  }

  async deleteCourse(course: Course): Promise<void> {
    if (!confirm(`¿Eliminar "${course.title}"?`)) return;
    await this.cursosService.deleteCourse(course.id);
    await this.loadCourses();
  }

  formatCOP(v: number): string { return this.cursosService.formatCOP(v); }

  private resetForm(): void {
    this.title = ''; this.description = ''; this.thumbnail = '';
    this.promoVideo = ''; this.priceCop = 0;
    this.category = COURSE_CATEGORIES[0]; this.level = 'beginner';
    this.saveError.set(null); this.saveSuccess.set(false);
  }
}
