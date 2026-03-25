import { Component, inject, signal, OnInit, ChangeDetectionStrategy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CursosService } from '../../../../core/services/cursos.service';
import type { CourseAffiliate } from '../../../../core/models/cursos.model';

@Component({
  selector: 'app-cursos-afiliados',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './cursos-afiliados.component.html',
})
export class CursosAfiliadosComponent implements OnInit {
  private readonly cursosService = inject(CursosService);
  private readonly platformId    = inject(PLATFORM_ID);

  readonly affiliates = signal<CourseAffiliate[]>([]);
  readonly loading    = signal(true);
  readonly copied     = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.affiliates.set(await this.cursosService.getMyAffiliateLinks());
    this.loading.set(false);
  }

  getAffLink(aff: CourseAffiliate): string {
    if (!isPlatformBrowser(this.platformId)) return '';
    const slug = aff.course?.slug ?? '';
    return `${window.location.origin}/advertiser/cursos/ver/${slug}?aff=${aff.aff_code}`;
  }

  copyLink(aff: CourseAffiliate): void {
    if (!isPlatformBrowser(this.platformId)) return;
    navigator.clipboard.writeText(this.getAffLink(aff)).then(() => {
      this.copied.set(aff.id);
      setTimeout(() => this.copied.set(null), 2000);
    });
  }

  formatCOP(v: number): string { return this.cursosService.formatCOP(v); }
}
