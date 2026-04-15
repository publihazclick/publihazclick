import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { XzoomService } from '../../core/services/xzoom.service';
import type { XzoomHost } from '../../core/models/xzoom.model';

declare const ePayco: any;

@Component({
  selector: 'app-xzoom-public-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="xzoom-landing">
      <header class="xzoom-hero">
        <div class="hero-inner">
          <span class="material-symbols-outlined hero-icon">live_tv</span>
          <h1>XZOOM EN VIVO</h1>
          <p class="tagline">Transmisiones en vivo de creadores independientes. Suscríbete a tus anfitriones favoritos y accede a sesiones en vivo + grabaciones.</p>
          <div class="hero-actions">
            <a routerLink="/register" class="btn-primary">Crear cuenta gratis</a>
            <a routerLink="/login" class="btn-ghost">Ya tengo cuenta</a>
          </div>
        </div>
      </header>

      <section class="xzoom-directory">
        <h2>Anfitriones activos</h2>

        @if (loading()) {
          <p class="muted">Cargando anfitriones…</p>
        }

        @if (!loading() && hosts().length === 0) {
          <p class="muted">Todavía no hay anfitriones activos. ¡Sé el primero! <a routerLink="/register">Regístrate</a> y activa tu plan de anfitrión.</p>
        }

        <div class="host-grid">
          @for (h of hosts(); track h.id) {
            <article class="host-card">
              @if (h.cover_url) {
                <img class="cover" [src]="h.cover_url" [alt]="h.display_name" />
              } @else {
                <div class="cover placeholder">
                  <span class="material-symbols-outlined">videocam</span>
                </div>
              }
              <div class="host-body">
                <h3>{{ h.display_name }}</h3>
                @if (h.category) {
                  <span class="category">{{ h.category }}</span>
                }
                @if (h.bio) {
                  <p class="bio">{{ h.bio }}</p>
                }
                <div class="host-price">
                  <strong>{{ formatCOP(h.subscriber_price_cop) }}</strong>
                  <span>/ mes</span>
                </div>
                <button class="btn-subscribe" (click)="subscribe(h)" [disabled]="processing() === h.id">
                  @if (processing() === h.id) {
                    Procesando…
                  } @else {
                    Suscribirme
                  }
                </button>
              </div>
            </article>
          }
        </div>
      </section>

      <section class="xzoom-features">
        <h2>¿Cómo funciona?</h2>
        <div class="features-grid">
          <div class="feature">
            <span class="material-symbols-outlined">person_add</span>
            <h3>1. Crea tu cuenta</h3>
            <p>Regístrate gratis en Publihazclick y explora XZOOM EN VIVO.</p>
          </div>
          <div class="feature">
            <span class="material-symbols-outlined">paid</span>
            <h3>2. Suscríbete a un anfitrión</h3>
            <p>Paga mensualmente al creador que prefieras con ePayco.</p>
          </div>
          <div class="feature">
            <span class="material-symbols-outlined">videocam</span>
            <h3>3. Ve en vivo o por grabación</h3>
            <p>Entra a las transmisiones en tiempo real o revísalas cuando quieras.</p>
          </div>
          <div class="feature">
            <span class="material-symbols-outlined">stream</span>
            <h3>¿Quieres ser anfitrión?</h3>
            <p>Activa el plan de anfitrión y empieza a transmitir con tu propia sala.</p>
          </div>
        </div>
      </section>

      <footer class="xzoom-footer">
        <p>© 2026 PubliHazClick · XZOOM EN VIVO</p>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; background: #000; color: #fff; min-height: 100vh; }
    .xzoom-landing { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
    .xzoom-hero {
      padding: 80px 20px 60px;
      text-align: center;
      background: radial-gradient(circle at top, rgba(255,59,48,0.25), transparent 60%);
    }
    .hero-icon { font-size: 56px; color: #ff3b30; }
    .xzoom-hero h1 {
      font-size: clamp(36px, 6vw, 64px);
      font-weight: 900;
      letter-spacing: 2px;
      margin: 16px 0 12px;
      background: linear-gradient(90deg, #ff3b30, #ff6b6b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .tagline { max-width: 680px; margin: 0 auto 28px; color: #94a3b8; font-size: 16px; line-height: 1.6; }
    .hero-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn-primary, .btn-ghost, .btn-subscribe {
      padding: 14px 28px;
      border-radius: 100px;
      font-weight: 800;
      text-decoration: none;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-size: 13px;
      cursor: pointer;
      border: none;
      display: inline-block;
    }
    .btn-primary { background: linear-gradient(135deg, #ff3b30, #ff6b6b); color: #fff; }
    .btn-ghost { background: transparent; border: 1px solid #ff3b30; color: #ff3b30; }
    .btn-subscribe {
      width: 100%;
      margin-top: 12px;
      background: linear-gradient(135deg, #ff3b30, #ff6b6b);
      color: #fff;
    }
    .btn-subscribe:disabled { opacity: 0.6; cursor: not-allowed; }
    .xzoom-directory { padding: 60px 0; }
    .xzoom-directory h2, .xzoom-features h2 {
      font-size: 28px;
      font-weight: 900;
      margin: 0 0 28px;
      text-align: center;
    }
    .muted { text-align: center; color: #64748b; }
    .muted a { color: #ff3b30; }
    .host-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
    }
    .host-card {
      background: #0a0a0a;
      border: 1px solid rgba(255,59,48,0.15);
      border-radius: 16px;
      overflow: hidden;
      transition: transform 0.15s, border-color 0.15s;
    }
    .host-card:hover {
      transform: translateY(-4px);
      border-color: #ff3b30;
    }
    .cover {
      width: 100%;
      height: 160px;
      object-fit: cover;
      display: block;
    }
    .cover.placeholder {
      background: linear-gradient(135deg, #1a0a0a, #0a0a0a);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ff3b30;
    }
    .cover.placeholder .material-symbols-outlined { font-size: 60px; }
    .host-body { padding: 18px 20px 22px; }
    .host-body h3 { margin: 0 0 4px; font-size: 18px; font-weight: 800; }
    .category {
      display: inline-block;
      font-size: 10px;
      color: #ff3b30;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .bio {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.5;
      margin: 0 0 12px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .host-price strong { color: #ff3b30; font-size: 22px; }
    .host-price span { color: #64748b; font-size: 13px; }
    .xzoom-features { padding: 60px 0; }
    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 20px;
    }
    .feature {
      background: #0a0a0a;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 28px 24px;
      text-align: center;
    }
    .feature .material-symbols-outlined { font-size: 40px; color: #ff3b30; }
    .feature h3 { font-size: 15px; font-weight: 800; margin: 12px 0 8px; }
    .feature p { font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 0; }
    .xzoom-footer {
      text-align: center;
      padding: 40px 20px;
      color: #475569;
      font-size: 12px;
    }
  `],
})
export class XzoomPublicLandingComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly xzoom = inject(XzoomService);
  private readonly router = inject(Router);

  readonly hosts = signal<XzoomHost[]>([]);
  readonly loading = signal(true);
  readonly processing = signal<string | null>(null);
  readonly errorMsg = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const list = await this.xzoom.listActiveHosts();
      this.hosts.set(list);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error cargando anfitriones');
    } finally {
      this.loading.set(false);
    }
  }

  async subscribe(host: XzoomHost): Promise<void> {
    const user = this.auth.getCurrentUser();
    if (!user) {
      // Guardar intención de suscribirse y redirigir a login
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('xzoom_intent_subscribe', host.id);
      }
      this.router.navigate(['/login'], { queryParams: { redirect: '/xzoom' } });
      return;
    }

    this.processing.set(host.id);
    try {
      const params = await this.xzoom.createViewerSubscriptionCheckout(host.id);
      this.openEpaycoCheckout(params);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error iniciando el pago');
      alert(err?.message ?? 'Error iniciando el pago');
    } finally {
      this.processing.set(null);
    }
  }

  private openEpaycoCheckout(params: any): void {
    if (typeof ePayco === 'undefined') {
      alert('Checkout ePayco no cargado. Recarga la página e intenta de nuevo.');
      return;
    }
    const handler = ePayco.checkout.configure({
      key: params.publicKey,
      test: params.test,
    });
    handler.open({
      name: params.name,
      description: params.description,
      invoice: params.invoice,
      currency: params.currency,
      amount: params.amount,
      tax_base: params.tax_base,
      tax: params.tax,
      country: params.country,
      lang: params.lang,
      external: 'false',
      email_billing: params.email_billing,
      name_billing: params.name_billing,
      extra1: params.extra1,
      extra2: params.extra2,
      extra3: params.extra3,
      confirmation: params.confirmation,
      response: params.response,
    });
  }

  formatCOP(v: number | null | undefined): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(v ?? 0);
  }
}
