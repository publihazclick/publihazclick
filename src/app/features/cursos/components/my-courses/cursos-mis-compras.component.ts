import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CursosService } from '../../../../core/services/cursos.service';
import type { Course } from '../../../../core/models/cursos.model';

interface PurchasedCourse extends Course {
  progress_pct: number;
}

@Component({
  selector: 'app-cursos-mis-compras',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './cursos-mis-compras.component.html',
})
export class CursosMisComprasComponent implements OnInit {
  private readonly cursosService = inject(CursosService);

  readonly courses = signal<PurchasedCourse[]>([]);
  readonly loading = signal(true);
  readonly myRatings: Record<string, { rating: string; reviews: string }> = {};

  async ngOnInit(): Promise<void> {
    this.courses.set(await this.cursosService.getMyPurchasedCourses() as PurchasedCourse[]);
    this.loading.set(false);
    this.assignRatings();
  }

  private assignRatings(): void {
    const ratings = ['4.8', '4.9', '4.7', '5.0', '4.6', '4.5'];
    const reviews = ['3.420', '2.780', '4.150', '3.060', '2.510', '3.890', '4.270', '3.340', '2.950', '3.710'];
    this.courses().forEach((c, i) => {
      this.myRatings[c.id] = {
        rating: ratings[i % ratings.length],
        reviews: reviews[i % reviews.length],
      };
    });
  }

  formatCOP(v: number): string { return this.cursosService.formatCOP(v); }
}
