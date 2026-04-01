import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SafePipe } from '../../../../shared/pipes/safe.pipe';
import { YouTubeCursosService } from '../../../../core/services/udemy.service';
import {
  COURSE_SEARCH_CATEGORIES,
  COURSE_SORT_OPTIONS,
  COURSE_DURATION_OPTIONS,
  type FreeCourse,
} from '../../../../core/models/udemy.model';

@Component({
  selector: 'app-cursos-gratis',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, SafePipe],
  templateUrl: './cursos-gratis.component.html',
})
export class CursosGratisComponent implements OnInit {
  readonly ytService = inject(YouTubeCursosService);

  readonly search = signal('');
  readonly category = signal('');
  readonly ordering = signal('relevance');
  readonly duration = signal('any');
  readonly selectedCourse = signal<FreeCourse | null>(null);
  readonly showComparison = signal(true);

  readonly categories = COURSE_SEARCH_CATEGORIES;
  readonly sortOptions = COURSE_SORT_OPTIONS;
  readonly sortKeys = Object.keys(COURSE_SORT_OPTIONS);
  readonly durationOptions = COURSE_DURATION_OPTIONS;
  readonly durationKeys = Object.keys(COURSE_DURATION_OPTIONS);

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(pageToken?: string): Promise<void> {
    await this.ytService.searchCourses({
      query: this.search() || undefined,
      category: this.category() || undefined,
      order: this.ordering(),
      duration: this.duration(),
      pageToken,
    });
  }

  onSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.load(), 500);
  }

  onCategory(value: string): void {
    this.category.set(value);
    this.load();
  }

  onSort(value: string): void {
    this.ordering.set(value);
    this.load();
  }

  onDuration(value: string): void {
    this.duration.set(value);
    this.load();
  }

  clearFilters(): void {
    this.search.set('');
    this.category.set('');
    this.ordering.set('relevance');
    this.duration.set('any');
    this.load();
  }

  openPlayer(course: FreeCourse): void {
    this.selectedCourse.set(course);
  }

  closePlayer(): void {
    this.selectedCourse.set(null);
  }

  nextPage(): void {
    const token = this.ytService.nextPageToken();
    if (token) this.load(token);
  }

  prevPage(): void {
    const token = this.ytService.prevPageToken();
    if (token) this.load(token);
  }

  get hasFilters(): boolean {
    return !!(this.search() || this.category() || this.ordering() !== 'relevance' || this.duration() !== 'any');
  }
}
