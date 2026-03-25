import { Component, inject, signal, OnInit, ChangeDetectionStrategy, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { CursosService } from '../../../../core/services/cursos.service';
import { COURSE_LEVEL_LABELS, type Course, type CourseModule } from '../../../../core/models/cursos.model';

type PayStep = 'idle' | 'loading' | 'opening' | 'success' | 'error';

@Component({
  selector: 'app-cursos-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './cursos-viewer.component.html',
})
export class CursosViewerComponent implements OnInit {
  private readonly route         = inject(ActivatedRoute);
  private readonly cursosService = inject(CursosService);
  private readonly platformId    = inject(PLATFORM_ID);

  readonly course        = signal<(Course & { modules: CourseModule[] }) | null>(null);
  readonly loading       = signal(true);
  readonly purchased     = signal(false);
  readonly payStep       = signal<PayStep>('idle');
  readonly payError      = signal<string | null>(null);
  readonly levelLabels   = COURSE_LEVEL_LABELS;
  readonly myAffCode     = signal<string | null>(null);
  readonly joiningAff    = signal(false);
  readonly affCopied     = signal(false);

  private affCode: string | null = null;

  async ngOnInit(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug')!;
    this.affCode = this.route.snapshot.queryParamMap.get('aff');

    // Store aff code in session
    if (isPlatformBrowser(this.platformId) && this.affCode) {
      sessionStorage.setItem(`curso_aff_${slug}`, this.affCode);
    }

    // Check ?compra=ok
    const compra = this.route.snapshot.queryParamMap.get('compra');
    if (compra === 'ok') this.payStep.set('success');

    const [courseData] = await Promise.all([
      this.cursosService.getCourseBySlug(slug),
    ]);

    this.course.set(courseData);

    if (courseData) {
      const [bought, existingAff] = await Promise.all([
        this.cursosService.hasPurchased(courseData.id),
        this.cursosService.getMyAffiliateForCourse(courseData.id),
      ]);
      this.purchased.set(bought);
      if (existingAff) this.myAffCode.set(existingAff.aff_code);

      // Retrieve stored aff code if not in URL
      if (isPlatformBrowser(this.platformId) && !this.affCode) {
        this.affCode = sessionStorage.getItem(`curso_aff_${slug}`);
      }
    }

    this.loading.set(false);
  }

  async buy(): Promise<void> {
    const course = this.course();
    if (!course) return;
    if (!isPlatformBrowser(this.platformId)) return;

    this.payStep.set('loading');
    this.payError.set(null);

    try {
      const params = await this.cursosService.createCursoPayment(course.id, this.affCode ?? undefined);
      this.payStep.set('opening');
      await this.cursosService.openEpaycoCheckout(params);
    } catch (e: any) {
      this.payError.set(e?.message ?? 'Error al iniciar el pago');
      this.payStep.set('error');
    }
  }

  getTotalLessons(): number {
    return this.course()?.modules?.reduce((s, m) => s + (m.lessons?.length ?? 0), 0) ?? 0;
  }

  async joinAffiliate(): Promise<void> {
    const course = this.course();
    if (!course) return;
    this.joiningAff.set(true);
    try {
      const aff = await this.cursosService.joinAsAffiliate(course.id);
      this.myAffCode.set(aff.aff_code);
    } catch { /* ignore */ }
    this.joiningAff.set(false);
  }

  getAffLink(): string {
    const course = this.course();
    const code = this.myAffCode();
    if (!course || !code || !isPlatformBrowser(this.platformId)) return '';
    return `${window.location.origin}${window.location.pathname}?aff=${code}`;
  }

  copyAffLink(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    navigator.clipboard.writeText(this.getAffLink()).then(() => {
      this.affCopied.set(true);
      setTimeout(() => this.affCopied.set(false), 2000);
    });
  }

  formatCOP(v: number): string { return this.cursosService.formatCOP(v); }
  getYoutubeId(url: string): string { return this.cursosService.extractYoutubeId(url); }

  getYoutubeEmbedUrl(url: string): string {
    const id = this.cursosService.extractYoutubeId(url);
    return id ? `https://www.youtube.com/embed/${id}` : '';
  }

  formatDuration(seconds: number): string {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`;
  }
}
