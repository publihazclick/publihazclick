import { Component, inject, signal, OnInit, ChangeDetectionStrategy, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { CursosService } from '../../../../core/services/cursos.service';
import { COURSE_LEVEL_LABELS, type Course, type CourseModule, type CourseLesson } from '../../../../core/models/cursos.model';

@Component({
  selector: 'app-cursos-player',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './cursos-player.component.html',
})
export class CursosPlayerComponent implements OnInit {
  private readonly route         = inject(ActivatedRoute);
  private readonly cursosService = inject(CursosService);
  private readonly platformId    = inject(PLATFORM_ID);

  readonly course        = signal<(Course & { modules: CourseModule[] }) | null>(null);
  readonly loading       = signal(true);
  readonly currentLesson = signal<CourseLesson | null>(null);
  readonly completedIds  = signal<Set<string>>(new Set());
  readonly sidebarOpen   = signal(true);

  async ngOnInit(): Promise<void> {
    const courseId = this.route.snapshot.paramMap.get('courseId')!;

    const [courseData, completed] = await Promise.all([
      this.cursosService.getCourseById(courseId),
      this.cursosService.getLessonProgress(courseId),
    ]);

    this.course.set(courseData);
    this.completedIds.set(completed);

    // Auto-select first lesson
    const firstLesson = courseData?.modules?.[0]?.lessons?.[0];
    if (firstLesson) this.currentLesson.set(firstLesson);

    this.loading.set(false);
  }

  selectLesson(lesson: CourseLesson): void {
    this.currentLesson.set(lesson);
  }

  async markComplete(lesson: CourseLesson): Promise<void> {
    const course = this.course();
    if (!course) return;
    await this.cursosService.markLessonComplete(course.id, lesson.id);
    const updated = new Set(this.completedIds());
    updated.add(lesson.id);
    this.completedIds.set(updated);
  }

  isCompleted(lessonId: string): boolean {
    return this.completedIds().has(lessonId);
  }

  getEmbedUrl(url: string | null): string {
    if (!url) return '';
    const id = this.cursosService.extractYoutubeId(url);
    return id ? `https://www.youtube.com/embed/${id}?autoplay=1` : '';
  }

  getProgress(): number {
    const c = this.course();
    if (!c) return 0;
    const total = c.modules?.reduce((s, m) => s + (m.lessons?.length ?? 0), 0) ?? 0;
    if (!total) return 0;
    return Math.round((this.completedIds().size / total) * 100);
  }

  getTotalLessons(): number {
    return this.course()?.modules?.reduce((s, m) => s + (m.lessons?.length ?? 0), 0) ?? 0;
  }
}
