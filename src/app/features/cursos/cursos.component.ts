import { Component, inject, signal, PLATFORM_ID, ChangeDetectionStrategy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ProfileService } from '../../core/services/profile.service';

@Component({
  selector: 'app-cursos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="space-y-0 bg-gray-50 -mx-4 lg:-mx-8 -mt-4 lg:-mt-6 px-4 lg:px-8 pt-4 lg:pt-6 pb-8 min-h-screen rounded-2xl">
      <!-- Top bar -->
      <div class="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-6 shadow-sm">
        <div class="flex items-center justify-between py-2">
          <!-- Hamburger + titulo + wallet (todas las resoluciones) -->
          <div class="flex flex-col w-full gap-2">
            <div class="flex items-center justify-between">
              <!-- Billetera (izquierda) -->
              <div class="flex items-center gap-3">
                @if (!isLanding()) {
                  <button (click)="walletModal.set(true)"
                          class="flex items-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all shadow-sm">
                    <span class="material-symbols-outlined text-emerald-500" style="font-size:20px">account_balance_wallet</span>
                    <div class="text-left">
                      <p class="text-[9px] text-emerald-500 font-semibold leading-none">Billetera de Retiro</p>
                      <p class="text-sm font-black text-emerald-600 leading-tight">$0</p>
                    </div>
                  </button>
                }
                <div class="academy-logo-sm" aria-label="Academy Pro 180">
                  <svg viewBox="0 0 520 80" xmlns="http://www.w3.org/2000/svg" class="h-7 w-auto">
                    <defs>
                      <linearGradient id="acLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#06b6d4"/>
                        <stop offset="50%" stop-color="#3b82f6"/>
                        <stop offset="100%" stop-color="#8b5cf6"/>
                      </linearGradient>
                      <linearGradient id="ac180Grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="#f59e0b"/>
                        <stop offset="100%" stop-color="#ef4444"/>
                      </linearGradient>
                      <linearGradient id="acShieldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#06b6d4"/>
                        <stop offset="100%" stop-color="#3b82f6"/>
                      </linearGradient>
                      <filter id="acGlow">
                        <feGaussianBlur stdDeviation="2" result="blur"/>
                        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                      </filter>
                    </defs>
                    <!-- Shield icon -->
                    <g transform="translate(2,4)">
                      <path d="M36,2 L66,16 L66,40 C66,58 52,70 36,76 C20,70 6,58 6,40 L6,16 Z"
                            fill="url(#acShieldGrad)" opacity="0.15" stroke="url(#acShieldGrad)" stroke-width="2"/>
                      <path d="M36,14 L26,26 L28,42 L36,50 L44,42 L46,26 Z" fill="none"
                            stroke="url(#acLogoGrad)" stroke-width="2.5" stroke-linejoin="round"/>
                      <circle cx="36" cy="32" r="5" fill="url(#acLogoGrad)"/>
                      <path d="M28,56 L36,62 L44,56" fill="none" stroke="url(#acLogoGrad)" stroke-width="2" stroke-linecap="round"/>
                    </g>
                    <!-- ACADEMY text -->
                    <text x="80" y="36" font-family="'Inter','Montserrat',system-ui,sans-serif"
                          font-size="28" font-weight="900" letter-spacing="3" fill="url(#acLogoGrad)">ACADEMY</text>
                    <!-- PRO text -->
                    <text x="275" y="36" font-family="'Inter','Montserrat',system-ui,sans-serif"
                          font-size="28" font-weight="900" letter-spacing="2" fill="#64748b">PRO</text>
                    <!-- 180 badge -->
                    <rect x="345" y="10" width="88" height="34" rx="8" fill="url(#ac180Grad)" filter="url(#acGlow)"/>
                    <text x="389" y="34" font-family="'Inter','Montserrat',system-ui,sans-serif"
                          font-size="22" font-weight="900" letter-spacing="2" fill="#fff" text-anchor="middle">180</text>
                    <!-- Tagline -->
                    <text x="80" y="62" font-family="'Inter','Montserrat',system-ui,sans-serif"
                          font-size="11" font-weight="600" letter-spacing="4" fill="#94a3b8">TRANSFORMA TU FUTURO</text>
                    <!-- Decorative line -->
                    <line x1="80" y1="44" x2="430" y2="44" stroke="url(#acLogoGrad)" stroke-width="1" opacity="0.2"/>
                  </svg>
                </div>
                <span class="hidden md:inline text-sm font-black text-gray-800 ml-2">· Hola, {{ profile()?.full_name || profile()?.username || 'Usuario' }}</span>
              </div>
              <!-- Menú hamburguesa (derecha) -->
              <div class="flex flex-col items-center gap-1">
                <button (click)="menuOpen.set(!menuOpen())"
                        class="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition-all">
                  <span class="material-symbols-outlined" style="font-size:22px">
                    {{ menuOpen() ? 'close' : 'menu' }}
                  </span>
                </button>
                @if (profile()?.has_active_package || profile()?.current_package_id) {
                  <div class="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-full">
                    <span class="material-symbols-outlined text-emerald-500" style="font-size:10px">verified</span>
                    <span class="text-[8px] text-emerald-600 font-black uppercase tracking-wider leading-none">Cuenta Activa</span>
                  </div>
                }
              </div>
            </div>
            @if (!isLanding()) {
              <p class="text-sm font-black text-gray-800 text-center truncate md:hidden">Hola, {{ profile()?.full_name || profile()?.username || '' }}</p>
            }
          </div>
        </div>
      </div>

      <!-- Menu sidebar overlay (todas las resoluciones) -->
      @if (menuOpen()) {
        <div class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" (click)="menuOpen.set(false)"></div>
        <div class="fixed top-0 left-0 z-50 w-72 h-full bg-white shadow-2xl animate-slide-in">
          <!-- Menu header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div class="academy-logo-sidebar" aria-label="Academy Pro 180">
              <svg viewBox="0 0 520 80" xmlns="http://www.w3.org/2000/svg" class="h-8 w-auto">
                <defs>
                  <linearGradient id="acLogoGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#06b6d4"/>
                    <stop offset="50%" stop-color="#3b82f6"/>
                    <stop offset="100%" stop-color="#8b5cf6"/>
                  </linearGradient>
                  <linearGradient id="ac180Grad2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#f59e0b"/>
                    <stop offset="100%" stop-color="#ef4444"/>
                  </linearGradient>
                  <linearGradient id="acShieldGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="#06b6d4"/>
                    <stop offset="100%" stop-color="#3b82f6"/>
                  </linearGradient>
                </defs>
                <g transform="translate(2,4)">
                  <path d="M36,2 L66,16 L66,40 C66,58 52,70 36,76 C20,70 6,58 6,40 L6,16 Z"
                        fill="url(#acShieldGrad2)" opacity="0.15" stroke="url(#acShieldGrad2)" stroke-width="2"/>
                  <path d="M36,14 L26,26 L28,42 L36,50 L44,42 L46,26 Z" fill="none"
                        stroke="url(#acLogoGrad2)" stroke-width="2.5" stroke-linejoin="round"/>
                  <circle cx="36" cy="32" r="5" fill="url(#acLogoGrad2)"/>
                  <path d="M28,56 L36,62 L44,56" fill="none" stroke="url(#acLogoGrad2)" stroke-width="2" stroke-linecap="round"/>
                </g>
                <text x="80" y="36" font-family="'Inter','Montserrat',system-ui,sans-serif"
                      font-size="28" font-weight="900" letter-spacing="3" fill="url(#acLogoGrad2)">ACADEMY</text>
                <text x="275" y="36" font-family="'Inter','Montserrat',system-ui,sans-serif"
                      font-size="28" font-weight="900" letter-spacing="2" fill="#64748b">PRO</text>
                <rect x="345" y="10" width="88" height="34" rx="8" fill="url(#ac180Grad2)"/>
                <text x="389" y="34" font-family="'Inter','Montserrat',system-ui,sans-serif"
                      font-size="22" font-weight="900" letter-spacing="2" fill="#fff" text-anchor="middle">180</text>
                <text x="80" y="62" font-family="'Inter','Montserrat',system-ui,sans-serif"
                      font-size="11" font-weight="600" letter-spacing="4" fill="#94a3b8">TRANSFORMA TU FUTURO</text>
                <line x1="80" y1="44" x2="430" y2="44" stroke="url(#acLogoGrad2)" stroke-width="1" opacity="0.2"/>
              </svg>
            </div>
            <button (click)="menuOpen.set(false)"
                    class="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 transition-all">
              <span class="material-symbols-outlined" style="font-size:20px">close</span>
            </button>
          </div>
          <!-- Menu items -->
          <nav class="flex flex-col py-2">
            <a routerLink="gratis" routerLinkActive="bg-emerald-50 text-emerald-600 border-l-emerald-500"
               (click)="menuOpen.set(false)"
               class="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-600 hover:bg-emerald-50 hover:text-emerald-600 border-l-4 border-transparent transition-all">
              <span class="material-symbols-outlined" style="font-size:20px">auto_stories</span>
              Cursos Gratis
            </a>
            <a routerLink="explorar" routerLinkActive="bg-sky-50 text-sky-600 border-l-sky-500"
               (click)="menuOpen.set(false)"
               class="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-600 hover:bg-sky-50 hover:text-sky-600 border-l-4 border-transparent transition-all">
              <span class="material-symbols-outlined" style="font-size:20px">explore</span>
              Explorar
            </a>
            <a routerLink="mis-cursos" routerLinkActive="bg-sky-50 text-sky-600 border-l-sky-500"
               (click)="menuOpen.set(false)"
               class="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-600 hover:bg-sky-50 hover:text-sky-600 border-l-4 border-transparent transition-all">
              <span class="material-symbols-outlined" style="font-size:20px">play_circle</span>
              Mis Cursos
            </a>
            <a routerLink="vender" routerLinkActive="bg-sky-50 text-sky-600 border-l-sky-500"
               (click)="menuOpen.set(false)"
               class="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-600 hover:bg-sky-50 hover:text-sky-600 border-l-4 border-transparent transition-all">
              <span class="material-symbols-outlined" style="font-size:20px">upload</span>
              Vender Curso
            </a>
            <a routerLink="ganancias" routerLinkActive="bg-sky-50 text-sky-600 border-l-sky-500"
               (click)="menuOpen.set(false)"
               class="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-600 hover:bg-sky-50 hover:text-sky-600 border-l-4 border-transparent transition-all">
              <span class="material-symbols-outlined" style="font-size:20px">trending_up</span>
              Ganancias
            </a>
            <button (click)="menuOpen.set(false); referralModal.set(true)"
               class="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-600 hover:bg-amber-50 hover:text-amber-600 border-l-4 border-transparent transition-all w-full text-left">
              <span class="material-symbols-outlined" style="font-size:20px">card_giftcard</span>
              Recomienda y Gana
            </button>
            <a routerLink="landing" routerLinkActive="bg-violet-50 text-violet-600 border-l-violet-500"
               (click)="menuOpen.set(false)"
               class="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-600 hover:bg-violet-50 hover:text-violet-600 border-l-4 border-transparent transition-all">
              <span class="material-symbols-outlined" style="font-size:20px">web</span>
              Landing Cursos
            </a>
            <a routerLink="pagos" routerLinkActive="bg-sky-50 text-sky-600 border-l-sky-500"
               (click)="menuOpen.set(false)"
               class="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-600 hover:bg-sky-50 hover:text-sky-600 border-l-4 border-transparent transition-all">
              <span class="material-symbols-outlined" style="font-size:20px">payments</span>
              Configuración de Pagos
            </a>
            @if (isAdmin()) {
              <a routerLink="admin" routerLinkActive="bg-sky-50 text-sky-600 border-l-sky-500"
                 (click)="menuOpen.set(false)"
                 class="flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-gray-600 hover:bg-sky-50 hover:text-sky-600 border-l-4 border-transparent transition-all">
                <span class="material-symbols-outlined" style="font-size:20px">admin_panel_settings</span>
                Admin
              </a>
            }
          </nav>
        </div>
      }

      <!-- Wallet modal -->
      @if (walletModal()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
             (click)="walletModal.set(false)">
          <div class="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-gray-100"
               (click)="$event.stopPropagation()">
            <!-- Header -->
            <div class="bg-emerald-50 px-6 py-5 border-b border-emerald-100">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
                    <span class="material-symbols-outlined text-white" style="font-size:22px">account_balance_wallet</span>
                  </div>
                  <div>
                    <p class="text-xs text-emerald-600 font-semibold">Billetera de Retiro</p>
                    <p class="text-2xl font-black text-emerald-700">$0</p>
                  </div>
                </div>
                <button (click)="walletModal.set(false)"
                        class="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-600 transition-all">
                  <span class="material-symbols-outlined" style="font-size:20px">close</span>
                </button>
              </div>
            </div>
            <!-- Body -->
            <div class="px-6 py-5 space-y-4">
              <div class="flex items-start gap-3">
                <span class="material-symbols-outlined text-amber-500 mt-0.5" style="font-size:22px">info</span>
                <p class="text-sm text-gray-600 leading-relaxed">
                  Este será el dinero que retiras cada vez que alguien que venga por tu link de recomendación compre alguno de nuestros cursos pagados. Recibes el <strong class="text-emerald-600">20% de comisión</strong> sobre el valor de cada curso vendido. Recuerda, debes tener tu cuenta activa en Publihazclick para poder generar estos ingresos.
                </p>
              </div>
              <div class="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <div class="flex items-center gap-2 mb-2">
                  <span class="material-symbols-outlined text-sky-500" style="font-size:18px">rocket_launch</span>
                  <span class="text-xs font-bold text-gray-700">¿Cómo funciona?</span>
                </div>
                <ul class="text-xs text-gray-500 space-y-1.5 ml-6">
                  <li class="flex items-start gap-2">
                    <span class="text-emerald-500 font-bold">1.</span>
                    Comparte tu link de recomendación
                  </li>
                  <li class="flex items-start gap-2">
                    <span class="text-emerald-500 font-bold">2.</span>
                    Un usuario compra un curso pagado
                  </li>
                  <li class="flex items-start gap-2">
                    <span class="text-emerald-500 font-bold">3.</span>
                    Recibes tu comisión en esta billetera
                  </li>
                  <li class="flex items-start gap-2">
                    <span class="text-emerald-500 font-bold">4.</span>
                    Retira tu dinero cuando quieras
                  </li>
                </ul>
              </div>
            </div>
            <!-- Footer -->
            <div class="px-6 py-4 border-t border-gray-100">
              <button (click)="walletModal.set(false)"
                      class="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm transition-all shadow-md">
                Entendido
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Referral modal -->
      @if (referralModal()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
             (click)="referralModal.set(false)">
          <div class="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-gray-100"
               (click)="$event.stopPropagation()">
            <!-- Header -->
            <div class="bg-amber-50 px-6 py-5 border-b border-amber-100">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
                    <span class="material-symbols-outlined text-white" style="font-size:22px">card_giftcard</span>
                  </div>
                  <div>
                    <p class="text-base font-black text-amber-700">Recomienda y Gana</p>
                    <p class="text-xs text-amber-600">Comparte tu link y gana comisiones</p>
                  </div>
                </div>
                <button (click)="referralModal.set(false)"
                        class="p-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-600 transition-all">
                  <span class="material-symbols-outlined" style="font-size:20px">close</span>
                </button>
              </div>
            </div>
            <!-- Body -->
            <div class="px-6 py-5 space-y-4">
              <p class="text-sm text-gray-600 leading-relaxed">
                Comparte tu link de recomendación con amigos, familiares o en tus redes sociales. Cada vez que alguien se registre a través de tu link y compre un curso pagado, recibirás el <strong class="text-amber-600">20% de comisión</strong> sobre el valor del curso directamente en tu billetera de cursos.
              </p>
              <!-- Referral link -->
              <div>
                <label class="text-xs font-bold text-gray-500 mb-1.5 block">Tu link de recomendación</label>
                <div class="flex gap-2">
                  <div class="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 font-mono truncate">
                    {{ getReferralLink() }}
                  </div>
                  <button (click)="copyReferralLink()"
                          class="px-4 py-3 rounded-xl text-sm font-bold transition-all"
                          [class]="copied()
                            ? 'bg-emerald-500 text-white'
                            : 'bg-amber-500 hover:bg-amber-600 text-white'">
                    <span class="material-symbols-outlined" style="font-size:18px">
                      {{ copied() ? 'check' : 'content_copy' }}
                    </span>
                  </button>
                </div>
              </div>
              <!-- Share buttons -->
              <div>
                <label class="text-xs font-bold text-gray-500 mb-1.5 block">Compartir en</label>
                <div class="flex gap-2">
                  <a [href]="'https://wa.me/?text=Mira%20estos%20cursos%20en%20Publihazclick%20' + encodeLink()" target="_blank"
                     class="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-bold transition-all">
                    WhatsApp
                  </a>
                  <a [href]="'https://t.me/share/url?url=' + encodeLink() + '&text=Mira%20estos%20cursos%20en%20Publihazclick'" target="_blank"
                     class="flex-1 flex items-center justify-center gap-2 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-bold transition-all">
                    Telegram
                  </a>
                  <a [href]="'https://www.facebook.com/sharer/sharer.php?u=' + encodeLink()" target="_blank"
                     class="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all">
                    Facebook
                  </a>
                </div>
              </div>
            </div>
            <!-- Footer -->
            <div class="px-6 py-4 border-t border-gray-100">
              <button (click)="referralModal.set(false)"
                      class="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm transition-all shadow-md">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      }

      <router-outlet />
    </div>
  `,
  styles: [`
    @keyframes slide-in {
      from { transform: translateX(-100%); }
      to   { transform: translateX(0); }
    }
    .animate-slide-in {
      animation: slide-in 0.2s ease-out;
    }
    .academy-logo-sm svg {
      height: 28px;
      width: auto;
      flex-shrink: 0;
    }
    .academy-logo-sidebar svg {
      height: 32px;
      width: auto;
    }
    @media (max-width: 380px) {
      .academy-logo-sm svg {
        height: 22px;
      }
    }
  `],
})
export class CursosComponent {
  private readonly profileService = inject(ProfileService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  readonly profile = this.profileService.profile;
  readonly menuOpen = signal(false);
  readonly walletModal = signal(false);
  readonly referralModal = signal(false);
  readonly copied = signal(false);

  isAdmin(): boolean {
    return ['admin', 'dev'].includes(this.profile()?.role ?? '');
  }

  isLanding(): boolean {
    return this.router.url.includes('/cursos/landing');
  }

  getReferralLink(): string {
    if (!isPlatformBrowser(this.platformId)) return '';
    const code = this.profile()?.referral_code ?? '';
    return `${window.location.origin}/ref/${code}?to=/cursos`;
  }

  encodeLink(): string {
    return encodeURIComponent(this.getReferralLink());
  }

  async copyReferralLink(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      await navigator.clipboard.writeText(this.getReferralLink());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch { /* ignore */ }
  }
}
