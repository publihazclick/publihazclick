import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TestimonialsService, PaymentTestimonial } from '../../core/services/testimonials.service';

// Indicadores de nombre femenino (minúsculas, se busca como substring del username)
const FEMALE = ['andrea','tatiana','yessica','paola','leidy','xiomara','nathaly',
  'karen','mafe','dani','caro','nata','vale','mary','laura','yessi','sofi',
  'isabelita','cami','natalia','yurany','karent','yadira','marisol','lorena','vanessa'];

// Indicadores de nombre masculino
const MALE = ['luis','brayan','jonatan','steeven','dairo','wilmar','jhon','elkin',
  'camilo','pipe','santi','fer','ale','sebas','juanchi','andres','carlos',
  'miguelito','tato','kike','jota','bladimir','ferney','duvan','kleiver',
  'sneider','robinson','robinsón'];

@Component({
  selector: 'app-payment-testimonials',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './payment-testimonials.component.html',
})
export class PaymentTestimonialsComponent implements OnInit {
  private readonly svc = inject(TestimonialsService);

  readonly items        = signal<PaymentTestimonial[]>([]);
  readonly loading      = signal(true);
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

  /**
   * ~30% de los perfiles no muestran foto (solo iniciales) para mayor realismo.
   * La decisión es determinista basada en el ID.
   */
  showAvatar(item: PaymentTestimonial): boolean {
    const n = parseInt(item.id.replace(/-/g, '').slice(8, 12), 16);
    return (n % 10) >= 3; // 70% muestran foto, 30% solo iniciales
  }

  /**
   * Devuelve la URL de foto según el género detectado en el nombre de usuario.
   * randomuser.me/portraits garantiza fotos claramente femeninas o masculinas.
   */
  avatarUrl(item: PaymentTestimonial): string {
    const n    = parseInt(item.id.replace(/-/g, '').slice(0, 8), 16);
    const idx  = (n % 70) + 1; // 1-70
    const lower = item.username.toLowerCase();

    if (FEMALE.some(f => lower.includes(f))) {
      return `https://randomuser.me/api/portraits/women/${idx}.jpg`;
    }
    if (MALE.some(m => lower.includes(m))) {
      return `https://randomuser.me/api/portraits/men/${idx}.jpg`;
    }
    // Handles ambiguos: usa pravatar (mezcla natural)
    return `https://i.pravatar.cc/80?img=${idx}`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }
}
