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

  async ngOnInit(): Promise<void> {
    this.courses.set(await this.cursosService.getMyPurchasedCourses() as PurchasedCourse[]);
    this.loading.set(false);
  }

  formatCOP(v: number): string { return this.cursosService.formatCOP(v); }
}
