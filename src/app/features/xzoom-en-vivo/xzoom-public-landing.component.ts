import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

// Video explicativo de la plataforma. Reemplazar por el embed real cuando esté listo.
const PLATFORM_EXPLAINER_VIDEO_URL = 'https://www.youtube.com/embed/dQw4w9WgXcQ';

@Component({
  selector: 'app-xzoom-public-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="xzoom-landing">
      <!-- ────────────────────────── HERO ────────────────────────── -->
      <header class="hero">
        <div class="hero-bg"></div>
        <nav class="top-nav">
          <div class="brand">
            <span class="material-symbols-outlined">live_tv</span>
            <span class="brand-text">XZOOM <em>EN VIVO</em></span>
          </div>
          @if (isLoggedIn()) {
            <a routerLink="/xzoom/panel" class="nav-cta">
              <span class="material-symbols-outlined">dashboard</span>
              Mi panel
            </a>
          } @else {
            <a routerLink="/xzoom/auth" class="nav-cta">Entrar</a>
          }
        </nav>

        <div class="hero-inner">
          <span class="pill">
            <span class="dot"></span>
            Transmisiones en vivo · HD · Baja latencia
          </span>
          <h1>
            Conecta en <span class="gradient">tiempo real</span><br />
            con los creadores que te <span class="gradient">inspiran</span>
          </h1>
          <p class="tagline">
            XZOOM EN VIVO es la plataforma premium de transmisiones privadas.
            Suscríbete a tus anfitriones favoritos, accede a sesiones en vivo y mira
            todas las grabaciones cuando quieras. O crea tu cuenta como anfitrión y
            produce contenido de valor para que tus seguidores adquieran suscripción
            y vean tus transmisiones en vivo o tus grabaciones.
          </p>
          <div class="hero-actions">
            <a routerLink="/xzoom/auth" class="btn-primary">
              Empieza ahora
              <span class="material-symbols-outlined">arrow_forward</span>
            </a>
            <a href="#que-es" class="btn-ghost">¿Cómo funciona?</a>
          </div>

          <div class="hero-stats">
            <div>
              <strong>HD</strong>
              <span>Calidad profesional</span>
            </div>
            <div>
              <strong>&lt; 1s</strong>
              <span>Latencia ultra baja</span>
            </div>
            <div>
              <strong>100%</strong>
              <span>En la nube</span>
            </div>
          </div>
        </div>
      </header>

      <!-- ────────────────── VIDEO EXPLICATIVO ────────────────── -->
      <section id="que-es" class="video-section">
        <div class="section-head">
          <span class="eyebrow">Qué es XZOOM EN VIVO</span>
          <h2>Mira el video y descubre cómo funciona</h2>
          <p>
            En menos de 2 minutos entenderás por qué XZOOM EN VIVO es la forma más
            sencilla de transmitir, aprender y ganar en vivo.
          </p>
        </div>

        <div class="video-wrap">
          <div class="video-frame">
            <iframe
              [src]="explainerVideoUrl"
              title="¿Qué es XZOOM EN VIVO?"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen>
            </iframe>
          </div>
        </div>

        <div class="cta-below-video">
          <a routerLink="/xzoom/auth" class="btn-primary-big">
            Crear mi cuenta o iniciar sesión
            <span class="material-symbols-outlined">login</span>
          </a>
          <p class="cta-sub">Un solo formulario. Registro e ingreso en segundos.</p>
        </div>
      </section>

      <!-- ────────────────── INFO PLATAFORMA ────────────────── -->
      <section class="info-section">
        <div class="info-grid">
          <article class="info-card">
            <span class="material-symbols-outlined icon">rocket_launch</span>
            <h3>Plataforma todo en uno</h3>
            <p>
              Transmite, cobra y gestiona a tus suscriptores desde un solo lugar.
              Sin instalar OBS, sin configuraciones complicadas.
            </p>
          </article>
          <article class="info-card">
            <span class="material-symbols-outlined icon">auto_awesome</span>
            <h3>WebRTC de última generación</h3>
            <p>
              Impulsado por la tecnología más robusta del mercado. Pantalla compartida,
              chat en vivo, participantes simultáneos y calidad HD garantizada.
            </p>
          </article>
          <article class="info-card">
            <span class="material-symbols-outlined icon">shield_person</span>
            <h3>Acceso privado por suscripción</h3>
            <p>
              Tu contenido solo lo ven quienes pagan. Cada anfitrión define su
              precio mensual y recibe el 85% del ingreso directo a su wallet.
            </p>
          </article>
          <article class="info-card">
            <span class="material-symbols-outlined icon">cloud_done</span>
            <h3>Grabaciones automáticas</h3>
            <p>
              Cada transmisión queda archivada en la nube. Los suscriptores
              pueden verla después, cuando mejor les convenga.
            </p>
          </article>
          <article class="info-card">
            <span class="material-symbols-outlined icon">groups</span>
            <h3>Para anfitriones y participantes</h3>
            <p>
              Si quieres transmitir, activa tu canal. Si quieres aprender o
              entretenerte, suscríbete al creador que prefieras.
            </p>
          </article>
          <article class="info-card">
            <span class="material-symbols-outlined icon">paid</span>
            <h3>Pagos en línea</h3>
            <p>
              Cobros a nivel mundial. Pagos seguros, transparentes y con
              liquidación directa a tu balance de XZOOM EN VIVO.
            </p>
          </article>
        </div>
      </section>

      <!-- ────────────────── CÓMO FUNCIONA ────────────────── -->
      <section class="how-section">
        <div class="section-head">
          <span class="eyebrow">En 3 pasos</span>
          <h2>Así de simple</h2>
        </div>
        <div class="steps">
          <div class="step">
            <div class="step-num">1</div>
            <h3>Crea tu cuenta</h3>
            <p>Regístrate con tu correo en menos de 30 segundos. Sin códigos, sin fricción.</p>
          </div>
          <div class="step">
            <div class="step-num">2</div>
            <h3>Pide el link</h3>
            <p>
              Contacta a tu mentor (anfitrión) y dile que te envíe el link de su
              panel de suscripción.
            </p>
          </div>
          <div class="step">
            <div class="step-num">3</div>
            <h3>Disfruta en vivo</h3>
            <p>Entra a las transmisiones en tiempo real o mira las grabaciones cuando quieras.</p>
          </div>
        </div>
      </section>

      <!-- ────────────────── CTA FINAL ────────────────── -->
      <section class="final-cta">
        <h2>Listo para entrar al futuro de las transmisiones</h2>
        <p>Crea tu cuenta XZOOM EN VIVO en 30 segundos.</p>
        <a routerLink="/xzoom/auth" class="btn-primary-big">
          Entrar a XZOOM EN VIVO
          <span class="material-symbols-outlined">arrow_forward</span>
        </a>
      </section>

      <footer class="xzoom-footer">
        <div class="brand">
          <span class="material-symbols-outlined">live_tv</span>
          <span class="brand-text">XZOOM <em>EN VIVO</em></span>
        </div>
        <p>© 2026 PubliHazClick · XZOOM EN VIVO · Todos los derechos reservados</p>
      </footer>
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
    .xzoom-landing { overflow-x: hidden; }

    /* ───────── Hero ───────── */
    .hero {
      position: relative;
      padding: 0 0 100px;
      overflow: hidden;
    }
    .hero-bg {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 20% 20%, rgba(255,59,48,0.35), transparent 50%),
        radial-gradient(circle at 80% 10%, rgba(255,107,107,0.22), transparent 55%),
        radial-gradient(circle at 50% 90%, rgba(255,59,48,0.18), transparent 60%),
        #050505;
      z-index: 0;
    }
    .hero-bg::after {
      content: '';
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 60px 60px;
      mask-image: radial-gradient(circle at center, black, transparent 70%);
    }
    .top-nav {
      position: relative;
      z-index: 2;
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px 24px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 900;
      letter-spacing: 1px;
    }
    .brand .material-symbols-outlined {
      font-size: 28px;
      color: #ff3b30;
      filter: drop-shadow(0 0 12px rgba(255,59,48,0.6));
    }
    .brand-text { font-size: 18px; }
    .brand-text em {
      font-style: normal;
      background: linear-gradient(90deg, #ff3b30, #ff6b6b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .nav-cta {
      padding: 10px 22px;
      border-radius: 100px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      color: #fff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      transition: all 0.2s;
    }
    .nav-cta:hover {
      background: rgba(255,59,48,0.15);
      border-color: #ff3b30;
    }

    .hero-inner {
      position: relative;
      z-index: 2;
      max-width: 960px;
      margin: 0 auto;
      padding: 100px 24px 0;
      text-align: center;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 18px;
      border-radius: 100px;
      background: rgba(255,59,48,0.12);
      border: 1px solid rgba(255,59,48,0.35);
      color: #ffb3ae;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 28px;
    }
    .pill .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ff3b30;
      box-shadow: 0 0 0 0 rgba(255,59,48,0.6);
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(255,59,48,0.6); }
      70% { box-shadow: 0 0 0 10px rgba(255,59,48,0); }
      100% { box-shadow: 0 0 0 0 rgba(255,59,48,0); }
    }
    h1 {
      font-family: 'Montserrat', 'Inter', sans-serif;
      font-size: clamp(36px, 7vw, 74px);
      font-weight: 900;
      line-height: 1.05;
      margin: 0 0 24px;
      letter-spacing: -1.5px;
    }
    .gradient {
      background: linear-gradient(90deg, #ff3b30, #ff6b6b, #ffb86c);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .tagline {
      max-width: 680px;
      margin: 0 auto 36px;
      color: #a1a1aa;
      font-size: 17px;
      line-height: 1.65;
    }
    .hero-actions {
      display: flex;
      gap: 14px;
      justify-content: center;
      flex-wrap: wrap;
      margin-bottom: 64px;
    }
    .btn-primary, .btn-ghost, .btn-subscribe, .btn-primary-big {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: 100px;
      font-weight: 800;
      text-decoration: none;
      letter-spacing: 0.3px;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-primary {
      padding: 16px 32px;
      background: linear-gradient(135deg, #ff3b30, #ff6b6b);
      color: #fff;
      font-size: 14px;
      box-shadow: 0 10px 40px -10px rgba(255,59,48,0.6);
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 15px 50px -10px rgba(255,59,48,0.8);
    }
    .btn-primary .material-symbols-outlined { font-size: 18px; }
    .btn-ghost {
      padding: 16px 32px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.15);
      color: #fff;
      font-size: 14px;
    }
    .btn-ghost:hover { background: rgba(255,255,255,0.1); }
    .btn-primary-big {
      padding: 20px 44px;
      background: linear-gradient(135deg, #ff3b30, #ff6b6b);
      color: #fff;
      font-size: 16px;
      text-transform: uppercase;
      letter-spacing: 1px;
      box-shadow: 0 15px 50px -10px rgba(255,59,48,0.7);
    }
    .btn-primary-big:hover {
      transform: translateY(-3px);
      box-shadow: 0 20px 60px -10px rgba(255,59,48,0.9);
    }
    .btn-primary-big .material-symbols-outlined { font-size: 20px; }

    .hero-stats {
      display: flex;
      gap: 48px;
      justify-content: center;
      flex-wrap: wrap;
      padding-top: 32px;
      border-top: 1px solid rgba(255,255,255,0.08);
    }
    .hero-stats > div { text-align: center; }
    .hero-stats strong {
      display: block;
      font-size: 32px;
      font-weight: 900;
      background: linear-gradient(90deg, #ff3b30, #ff6b6b);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .hero-stats span {
      font-size: 12px;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    /* ───────── Secciones compartidas ───────── */
    .section-head {
      text-align: center;
      max-width: 680px;
      margin: 0 auto 48px;
    }
    .eyebrow {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #ff6b6b;
      margin-bottom: 14px;
    }
    .section-head h2 {
      font-family: 'Montserrat', 'Inter', sans-serif;
      font-size: clamp(28px, 4.5vw, 44px);
      font-weight: 900;
      margin: 0 0 16px;
      letter-spacing: -0.5px;
    }
    .section-head p {
      color: #a1a1aa;
      font-size: 16px;
      line-height: 1.6;
      margin: 0;
    }

    /* ───────── Video section ───────── */
    .video-section {
      max-width: 1100px;
      margin: 0 auto;
      padding: 100px 24px;
    }
    .video-wrap {
      position: relative;
      padding: 4px;
      border-radius: 24px;
      background: linear-gradient(135deg, #ff3b30, #ff6b6b, rgba(255,59,48,0.2));
      box-shadow: 0 30px 80px -20px rgba(255,59,48,0.4);
    }
    .video-frame {
      position: relative;
      border-radius: 20px;
      overflow: hidden;
      background: #000;
      aspect-ratio: 16 / 9;
    }
    .video-frame iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: none;
    }
    .cta-below-video {
      text-align: center;
      margin-top: 56px;
    }
    .cta-sub {
      margin-top: 16px;
      color: #71717a;
      font-size: 13px;
    }

    /* ───────── Info cards ───────── */
    .info-section {
      max-width: 1200px;
      margin: 0 auto;
      padding: 80px 24px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }
    .info-card {
      position: relative;
      padding: 36px 28px;
      background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      transition: all 0.25s;
    }
    .info-card:hover {
      transform: translateY(-4px);
      border-color: rgba(255,59,48,0.4);
      background: linear-gradient(180deg, rgba(255,59,48,0.08), rgba(255,255,255,0.01));
    }
    .info-card .icon {
      font-size: 38px;
      color: #ff6b6b;
      margin-bottom: 16px;
      filter: drop-shadow(0 0 18px rgba(255,59,48,0.5));
    }
    .info-card h3 {
      font-size: 19px;
      font-weight: 800;
      margin: 0 0 10px;
      color: #fff;
    }
    .info-card p {
      font-size: 14px;
      color: #a1a1aa;
      line-height: 1.6;
      margin: 0;
    }

    /* ───────── Cómo funciona (pasos) ───────── */
    .how-section {
      max-width: 1100px;
      margin: 0 auto;
      padding: 80px 24px;
    }
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 24px;
    }
    .step {
      position: relative;
      padding: 40px 28px;
      background: #0a0a0a;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 20px;
      text-align: center;
    }
    .step-num {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #ff3b30, #ff6b6b);
      color: #fff;
      font-size: 22px;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      box-shadow: 0 15px 40px -10px rgba(255,59,48,0.6);
    }
    .step h3 {
      font-size: 18px;
      font-weight: 800;
      margin: 0 0 10px;
    }
    .step p {
      font-size: 14px;
      color: #a1a1aa;
      line-height: 1.6;
      margin: 0;
    }

    /* ───────── CTA final ───────── */
    .final-cta {
      max-width: 800px;
      margin: 40px auto 80px;
      padding: 70px 28px;
      text-align: center;
      background: radial-gradient(circle at center, rgba(255,59,48,0.18), transparent 70%);
      border-radius: 28px;
      border: 1px solid rgba(255,59,48,0.25);
    }
    .final-cta h2 {
      font-family: 'Montserrat', 'Inter', sans-serif;
      font-size: clamp(26px, 4vw, 40px);
      font-weight: 900;
      margin: 0 0 14px;
      letter-spacing: -0.5px;
    }
    .final-cta p {
      color: #a1a1aa;
      font-size: 16px;
      margin: 0 0 30px;
    }

    /* ───────── Footer ───────── */
    .xzoom-footer {
      padding: 40px 24px 60px;
      text-align: center;
      color: #52525b;
      font-size: 12px;
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    .xzoom-footer .brand {
      justify-content: center;
      margin-bottom: 14px;
    }
    .xzoom-footer p { margin: 0; }

    /* ───────── Responsive ───────── */
    @media (max-width: 640px) {
      .hero-inner { padding-top: 60px; }
      .hero-stats { gap: 28px; }
      .hero-stats strong { font-size: 26px; }
      .video-section, .info-section, .how-section {
        padding: 60px 20px;
      }
      .final-cta { margin: 20px 16px 60px; padding: 50px 22px; }
    }
  `],
})
export class XzoomPublicLandingComponent {
  private readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly explainerVideoUrl: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
    PLATFORM_EXPLAINER_VIDEO_URL,
  );

  readonly isLoggedIn = computed(() => !!this.auth.getCurrentUser());
}
