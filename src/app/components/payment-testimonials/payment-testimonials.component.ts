import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TestimonialsService, PaymentTestimonial } from '../../core/services/testimonials.service';

// Fotos de avatar reales (pravatar.cc — 70 fotos disponibles, índice 1-70)
// Asignamos de forma determinista según el id de la imagen para que sea siempre la misma.
const AVATAR_COUNT = 70;

@Component({
  selector: 'app-payment-testimonials',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './payment-testimonials.component.html',
})
export class PaymentTestimonialsComponent implements OnInit {
  private readonly svc = inject(TestimonialsService);

  readonly items   = signal<PaymentTestimonial[]>([]);
  readonly loading = signal(true);

  /** Cuántas tarjetas se muestran actualmente */
  readonly visibleCount = signal(8);

  readonly visibleItems = computed(() => this.items().slice(0, this.visibleCount()));
  readonly hasMore      = computed(() => this.visibleCount() < this.items().length);

  async ngOnInit(): Promise<void> {
    try {
      const list = await this.svc.getActive();
      this.items.set(list);
    } catch {
      // Si falla, la sección simplemente no aparece
    } finally {
      this.loading.set(false);
    }
  }

  loadMore(): void {
    this.visibleCount.update(n => n + 8);
  }

  /** URL de avatar determinista basada en el id del registro */
  avatarUrl(item: PaymentTestimonial): string {
    // Convertimos los primeros 8 chars del UUID a número y mapeamos al rango 1-70
    const n = parseInt(item.id.replace(/-/g, '').slice(0, 8), 16);
    const idx = (n % AVATAR_COUNT) + 1;
    return `https://i.pravatar.cc/80?img=${idx}`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }
}
