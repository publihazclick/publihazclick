import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { XzoomService } from '../../core/services/xzoom.service';
import type { XzoomHost } from '../../core/models/xzoom.model';

declare const ePayco: any;

@Component({
  selector: 'app-xzoom-host-landing',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="host-landing">
      <div class="bg"></div>

      <nav class="top-nav">
        <a routerLink="/xzoom" class="brand">
          <span class="material-symbols-outlined">live_tv</span>
          <span class="brand-text">XZOOM <em>EN VIVO</em></span>
        </a>
        @if (currentUserEmail()) {
          <span class="user-chip">
            <span class="material-symbols-outlined">person</span>
            {{ currentUserEmail() }}
          </span>
        } @else {
          <a routerLink="/xzoom/auth" class="user-chip as-link">
            <span class="material-symbols-outlined">login</span>
            Ya tengo cuenta
          </a>
        }
      </nav>

      @if (loading()) {
        <div class="state">
          <p>Cargando invitación…</p>
        </div>
      }

      @if (!loading() && !host()) {
        <div class="state error">
          <span class="material-symbols-outlined">sentiment_dissatisfied</span>
          <h2>Anfitrión no encontrado</h2>
          <p>El link que recibiste no corresponde a ninguna sala activa.</p>
          <a routerLink="/xzoom" class="btn-primary">Ir al directorio</a>
        </div>
      }

      @if (!loading() && host(); as h) {
        <section class="pitch">
          <div class="pitch-head">
            <div class="avatar">
              @if (h.avatar_url) {
                <img [src]="h.avatar_url" [alt]="h.display_name" />
              } @else {
                <span class="material-symbols-outlined">person</span>
              }
            </div>
            <div class="pitch-meta">
              <span class="eyebrow">Invitación privada</span>
              <h1>{{ h.display_name }} te invita a su sala XZOOM</h1>
              @if (h.category) {
                <span class="category">{{ h.category }}</span>
              }
            </div>
          </div>

          <!-- Pitch video del anfitrión -->
          <div class="video-wrap">
            <div class="video-frame">
              @if (pitchVideoEmbedUrl()) {
                <iframe
                  [src]="pitchVideoEmbedUrl()!"
                  [title]="'Presentación de ' + h.display_name"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowfullscreen>
                </iframe>
              } @else if (pitchVideoDirect()) {
                <video [src]="pitchVideoDirect()!" controls playsinline></video>
              } @else {
                <div class="no-video">
                  <span class="material-symbols-outlined">movie</span>
                  <p>{{ h.display_name }} todavía no subió su video de presentación.</p>
                </div>
              }
            </div>
          </div>

          @if (h.bio) {
            <div class="bio-block">
              <h3>Sobre {{ h.display_name }}</h3>
              <p>{{ h.bio }}</p>
            </div>
          }

          <div class="subscribe-card" id="suscribirme">
            <div class="price-row">
              <div>
                <span class="price-label">Suscripción mensual</span>
                <strong class="price">{{ formatCOP(h.subscriber_price_cop) }}</strong>
                <span class="price-sub">/ mes · cancela cuando quieras</span>
              </div>
              <span class="material-symbols-outlined badge">workspace_premium</span>
            </div>

            <ul class="perks">
              <li>
                <span class="material-symbols-outlined">check_circle</span>
                Acceso a todas las transmisiones en vivo
              </li>
              <li>
                <span class="material-symbols-outlined">check_circle</span>
                Grabaciones disponibles cuando quieras
              </li>
              <li>
                <span class="material-symbols-outlined">check_circle</span>
                Chat en vivo con el anfitrión y la comunidad
              </li>
              <li>
                <span class="material-symbols-outlined">check_circle</span>
                Calidad HD en la nube de LiveKit
              </li>
            </ul>

            @if (!isLoggedIn()) {
              <form [formGroup]="form" (ngSubmit)="onSubscribe()" class="guest-form">
                <p class="form-intro">
                  Dinos tu nombre y correo — al confirmar el pago te enviaremos un
                  email para activar tu cuenta y setear tu contraseña.
                </p>

                <label class="field">
                  <span class="label">Nombre completo</span>
                  <div class="input-wrap">
                    <span class="material-symbols-outlined">person</span>
                    <input
                      type="text"
                      formControlName="fullName"
                      placeholder="María Pérez"
                      autocomplete="name" />
                  </div>
                </label>

                <label class="field">
                  <span class="label">Correo electrónico</span>
                  <div class="input-wrap">
                    <span class="material-symbols-outlined">mail</span>
                    <input
                      type="email"
                      formControlName="email"
                      placeholder="tucorreo@ejemplo.com"
                      autocomplete="email" />
                  </div>
                </label>

                @if (errorMsg()) {
                  <div class="error-box">
                    <span class="material-symbols-outlined">error</span>
                    {{ errorMsg() }}
                  </div>
                }

                <button
                  type="submit"
                  class="btn-subscribe"
                  [disabled]="processing() || form.invalid">
                  @if (processing()) {
                    Procesando pago…
                  } @else {
                    Pagar y suscribirme
                    <span class="material-symbols-outlined">arrow_forward</span>
                  }
                </button>
              </form>
            } @else {
              @if (errorMsg()) {
                <div class="error-box">
                  <span class="material-symbols-outlined">error</span>
                  {{ errorMsg() }}
                </div>
              }
              <button
                type="button"
                class="btn-subscribe"
                (click)="onSubscribeAsUser()"
                [disabled]="processing()">
                @if (processing()) {
                  Procesando pago…
                } @else {
                  Suscribirme ahora
                  <span class="material-symbols-outlined">arrow_forward</span>
                }
              </button>
            }

            <p class="secure">
              <span class="material-symbols-outlined">lock</span>
              Pago 100% seguro procesado por ePayco
            </p>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      background: #050505;
      color: #fff;
      min-height: 100vh;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .host-landing { position: relative; padding: 24px 20px 80px; }
    .bg {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 15% 0%, rgba(255,59,48,0.3), transparent 55%),
        radial-gradient(circle at 90% 90%, rgba(255,107,107,0.18), transparent 60%),
        #050505;
      z-index: 0;
    }
    .top-nav {
      position: relative;
      z-index: 2;
      max-width: 960px;
      margin: 0 auto 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 900;
      letter-spacing: 1px;
      text-decoration: none;
      color: #fff;
    }
    .brand .material-symbols-outlined {
      font-size: 28px;
      color: #ff3b30;
      filter: drop-shadow(0 0 12px rgba(255,59,48,0.6));
    }
    .brand-text em {
      font-style: normal;
      background: linear-gradient(90deg, #ff3b30, #ff6b6b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .user-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 100px;
      font-size: 12px;
      color: #a1a1aa;
      text-decoration: none;
    }
    .user-chip.as-link:hover {
      background: rgba(255,59,48,0.12);
      border-color: #ff3b30;
      color: #fff;
    }
    .user-chip .material-symbols-outlined { font-size: 15px; }

    .state {
      position: relative;
      z-index: 2;
      max-width: 500px;
      margin: 80px auto 0;
      padding: 40px 28px;
      text-align: center;
      color: #a1a1aa;
    }
    .state.error .material-symbols-outlined {
      font-size: 56px;
      color: #ff6b6b;
    }
    .state.error h2 {
      font-size: 22px;
      margin: 12px 0 6px;
      color: #fff;
    }
    .state.error p { margin: 0 0 24px; }

    .pitch {
      position: relative;
      z-index: 2;
      max-width: 960px;
      margin: 0 auto;
    }

    .pitch-head {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 32px;
    }
    .avatar {
      width: 76px;
      height: 76px;
      border-radius: 50%;
      background: linear-gradient(135deg, #ff3b30, #ff6b6b);
      padding: 3px;
      flex-shrink: 0;
      box-shadow: 0 15px 40px -10px rgba(255,59,48,0.6);
    }
    .avatar img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
    }
    .avatar .material-symbols-outlined {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0a;
      font-size: 40px;
      color: #ff6b6b;
    }
    .pitch-meta .eyebrow {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #ff6b6b;
      margin-bottom: 8px;
    }
    .pitch-meta h1 {
      font-family: 'Montserrat', 'Inter', sans-serif;
      font-size: clamp(24px, 4vw, 40px);
      font-weight: 900;
      line-height: 1.1;
      letter-spacing: -0.5px;
      margin: 0 0 8px;
    }
    .pitch-meta .category {
      display: inline-block;
      font-size: 11px;
      padding: 4px 12px;
      background: rgba(255,59,48,0.12);
      border: 1px solid rgba(255,59,48,0.3);
      border-radius: 100px;
      color: #ffb3ae;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-weight: 700;
    }

    .video-wrap {
      padding: 4px;
      border-radius: 24px;
      background: linear-gradient(135deg, #ff3b30, #ff6b6b, rgba(255,59,48,0.2));
      box-shadow: 0 30px 80px -20px rgba(255,59,48,0.4);
      margin-bottom: 40px;
    }
    .video-frame {
      position: relative;
      border-radius: 20px;
      overflow: hidden;
      background: #000;
      aspect-ratio: 16 / 9;
    }
    .video-frame iframe, .video-frame video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: none;
    }
    .no-video {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: #52525b;
      text-align: center;
      padding: 24px;
    }
    .no-video .material-symbols-outlined { font-size: 64px; color: #3f3f46; }
    .no-video p { margin: 0; font-size: 14px; }

    .bio-block {
      padding: 28px 32px;
      background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      margin-bottom: 32px;
    }
    .bio-block h3 {
      font-size: 15px;
      font-weight: 800;
      margin: 0 0 10px;
      color: #ff6b6b;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .bio-block p {
      margin: 0;
      color: #d4d4d8;
      line-height: 1.7;
      font-size: 15px;
      white-space: pre-line;
    }

    .subscribe-card {
      padding: 36px 32px;
      background: linear-gradient(180deg, rgba(255,59,48,0.1), rgba(255,255,255,0.02));
      border: 1px solid rgba(255,59,48,0.35);
      border-radius: 24px;
      box-shadow: 0 30px 80px -20px rgba(255,59,48,0.3);
    }
    .price-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 24px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .price-label {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #a1a1aa;
      margin-bottom: 4px;
      font-weight: 700;
    }
    .price {
      display: block;
      font-family: 'Montserrat', 'Inter', sans-serif;
      font-size: 40px;
      font-weight: 900;
      background: linear-gradient(90deg, #ff3b30, #ff6b6b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: -1px;
      line-height: 1;
      margin: 4px 0;
    }
    .price-sub { font-size: 12px; color: #71717a; }
    .badge {
      font-size: 48px;
      color: #ff6b6b;
      filter: drop-shadow(0 0 20px rgba(255,59,48,0.5));
    }

    .perks {
      list-style: none;
      padding: 0;
      margin: 0 0 28px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .perks li {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      color: #d4d4d8;
    }
    .perks .material-symbols-outlined { color: #4ade80; font-size: 20px; }

    .guest-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 24px;
      background: rgba(0,0,0,0.35);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      margin-bottom: 20px;
    }
    .form-intro {
      margin: 0 0 6px;
      font-size: 13px;
      color: #a1a1aa;
      line-height: 1.55;
    }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field .label {
      font-size: 11px;
      font-weight: 700;
      color: #d4d4d8;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    .input-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      transition: all 0.2s;
    }
    .input-wrap:focus-within {
      border-color: #ff3b30;
      background: rgba(255,59,48,0.05);
      box-shadow: 0 0 0 4px rgba(255,59,48,0.12);
    }
    .input-wrap .material-symbols-outlined { font-size: 19px; color: #71717a; }
    .input-wrap input {
      flex: 1;
      padding: 13px 0;
      background: transparent;
      border: none;
      outline: none;
      color: #fff;
      font-size: 14px;
      font-family: inherit;
    }
    .input-wrap input::placeholder { color: #52525b; }

    .error-box {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 12px;
      background: rgba(239,68,68,0.12);
      border: 1px solid rgba(239,68,68,0.35);
      color: #fecaca;
      font-size: 13px;
      line-height: 1.5;
      margin-bottom: 16px;
    }
    .error-box .material-symbols-outlined { color: #f87171; font-size: 18px; }

    .btn-subscribe, .btn-primary {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 18px 22px;
      background: linear-gradient(135deg, #ff3b30, #ff6b6b);
      color: #fff;
      border: none;
      border-radius: 100px;
      font-weight: 800;
      font-size: 14px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      cursor: pointer;
      box-shadow: 0 15px 40px -10px rgba(255,59,48,0.6);
      transition: all 0.2s;
      text-decoration: none;
    }
    .btn-subscribe:hover:not(:disabled), .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 20px 50px -10px rgba(255,59,48,0.8);
    }
    .btn-subscribe:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn-subscribe .material-symbols-outlined { font-size: 18px; }

    .secure {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin: 16px 0 0;
      font-size: 12px;
      color: #71717a;
    }
    .secure .material-symbols-outlined { font-size: 14px; }

    @media (max-width: 640px) {
      .pitch-head { flex-direction: column; text-align: center; gap: 14px; }
      .price-row { flex-direction: column-reverse; align-items: center; text-align: center; gap: 16px; }
      .subscribe-card, .bio-block { padding: 28px 22px; }
    }
  `],
})
export class XzoomHostLandingComponent implements OnInit {
  private readonly xzoom = inject(XzoomService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly fb = inject(FormBuilder);

  readonly host = signal<XzoomHost | null>(null);
  readonly loading = signal(true);
  readonly processing = signal(false);
  readonly errorMsg = signal<string | null>(null);

  readonly isLoggedIn = computed(() => !!this.auth.getCurrentUser());
  readonly currentUserEmail = computed(() => this.auth.getCurrentUser()?.email ?? null);

  readonly form: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
  });

  readonly pitchVideoEmbedUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.host()?.pitch_video_url;
    if (!url) return null;
    const embed = this.toEmbedUrl(url);
    return embed ? this.sanitizer.bypassSecurityTrustResourceUrl(embed) : null;
  });

  readonly pitchVideoDirect = computed<string | null>(() => {
    const url = this.host()?.pitch_video_url;
    if (!url) return null;
    return /\.(mp4|webm|ogg)(\?|$)/i.test(url) ? url : null;
  });

  async ngOnInit(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!slug) {
      this.loading.set(false);
      return;
    }

    try {
      const h = await this.xzoom.getHostBySlug(slug);
      this.host.set(h);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'No pudimos cargar al anfitrión.');
    } finally {
      this.loading.set(false);
    }
  }

  async onSubscribe(): Promise<void> {
    const h = this.host();
    if (!h || this.processing() || this.form.invalid) return;
    this.errorMsg.set(null);
    this.processing.set(true);
    try {
      const { fullName, email } = this.form.value;
      const params = await this.xzoom.createPublicSubscriptionCheckout({
        hostSlug: h.slug,
        email: (email as string).trim().toLowerCase(),
        fullName: (fullName as string).trim(),
      });
      this.openEpaycoCheckout(params);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'No pudimos iniciar el pago.');
    } finally {
      this.processing.set(false);
    }
  }

  async onSubscribeAsUser(): Promise<void> {
    const h = this.host();
    if (!h || this.processing()) return;
    this.errorMsg.set(null);
    this.processing.set(true);
    try {
      const params = await this.xzoom.createViewerSubscriptionCheckout(h.id);
      this.openEpaycoCheckout(params);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'No pudimos iniciar el pago.');
    } finally {
      this.processing.set(false);
    }
  }

  private openEpaycoCheckout(params: any): void {
    if (typeof ePayco === 'undefined') {
      this.errorMsg.set('Checkout ePayco no cargado. Recarga la página e intenta de nuevo.');
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

  private toEmbedUrl(url: string): string | null {
    try {
      const u = new URL(url);
      if (u.pathname.startsWith('/embed/')) return url;
      if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
        return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
      }
      if (u.hostname === 'youtu.be') {
        return `https://www.youtube.com/embed${u.pathname}`;
      }
      if (u.hostname.includes('vimeo.com')) {
        const id = u.pathname.replace(/\//g, '');
        if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
      }
      if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return null;
      return url;
    } catch {
      return null;
    }
  }

  formatCOP(v: number | null | undefined): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(v ?? 0);
  }
}
