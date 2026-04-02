import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CursosService } from '../../../../core/services/cursos.service';
import { COURSE_CATEGORIES, COURSE_LEVEL_LABELS, type Course, type CourseLevel } from '../../../../core/models/cursos.model';

@Component({
  selector: 'app-cursos-marketplace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule],
  templateUrl: './cursos-marketplace.component.html',
})
export class CursosMarketplaceComponent implements OnInit {
  private readonly cursosService = inject(CursosService);

  readonly courses    = signal<Course[]>([]);
  readonly loading    = signal(true);
  readonly search     = signal('');
  readonly category   = signal('');
  readonly level      = signal('');

  readonly categories = COURSE_CATEGORIES;
  readonly levelLabels = COURSE_LEVEL_LABELS;
  readonly levels: CourseLevel[] = ['beginner', 'intermediate', 'advanced'];

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.courses.set(await this.cursosService.getActiveCourses({
      category: this.category() || undefined,
      level:    this.level() || undefined,
      search:   this.search() || undefined,
    }));
    this.loading.set(false);
    this.assignRatings();
  }

  formatCOP(v: number): string { return this.cursosService.formatCOP(v); }

  readonly courseRatings: Record<string, { rating: string; reviews: string }> = {};

  private assignRatings(): void {
    const ratings = ['4.5', '4.6', '4.7', '4.8', '4.9', '5.0'];
    const reviews = ['2.540', '2.870', '3.150', '3.420', '3.780', '4.100', '4.290', '2.650', '3.010', '3.560'];
    this.courses().forEach((c, i) => {
      this.courseRatings[c.id] = {
        rating: ratings[i % ratings.length],
        reviews: reviews[i % reviews.length],
      };
    });
  }

  onSearch(v: string): void { this.search.set(v); this.load(); }
  onCategory(v: string): void { this.category.set(v); this.load(); }
  onLevel(v: string): void { this.level.set(v); this.load(); }
  clearFilters(): void { this.search.set(''); this.category.set(''); this.level.set(''); this.load(); }
}
