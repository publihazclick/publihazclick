import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TestimonialsService, PaymentTestimonial } from '../../core/services/testimonials.service';

@Component({
  selector: 'app-payment-testimonials',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './payment-testimonials.component.html',
})
export class PaymentTestimonialsComponent implements OnInit {
  private readonly svc = inject(TestimonialsService);
  readonly items = signal<PaymentTestimonial[]>([]);
  readonly loading = signal(true);

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

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }
}
