import { Component, inject, signal, OnInit, ChangeDetectionStrategy, computed } from '@angular/core';
import { CursosService } from '../../../../core/services/cursos.service';
import type { CoursePurchase } from '../../../../core/models/cursos.model';

@Component({
  selector: 'app-cursos-ganancias',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './cursos-ganancias.component.html',
})
export class CursosGananciasComponent implements OnInit {
  private readonly cursosService = inject(CursosService);

  readonly sales   = signal<CoursePurchase[]>([]);
  readonly loading = signal(true);

  readonly totalEarned = computed(() =>
    this.sales().filter(s => s.status === 'completed').reduce((sum, s) => sum + s.creator_cut, 0)
  );
  readonly totalSales = computed(() =>
    this.sales().filter(s => s.status === 'completed').length
  );
  readonly pendingSales = computed(() =>
    this.sales().filter(s => s.status === 'pending').length
  );

  async ngOnInit(): Promise<void> {
    this.sales.set(await this.cursosService.getMyCreatorSales());
    this.loading.set(false);
  }

  formatCOP(v: number): string { return this.cursosService.formatCOP(v); }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
