import {
  Component,
  signal,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  inject,
  input,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CurrencyService } from '../../core/services/currency.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { UserTrackingService } from '../../core/services/user-tracking.service';
import { environment } from '../../../environments/environment';

export interface PtcAd {
  id: string;
  title: string;
  description: string;
  advertiserName: string;
  advertiserType: 'company' | 'person';
  imageUrl: string;
  videoUrl: string;
  destinationUrl: string;
  adType: 'mega' | 'standard_400' | 'standard_600' | 'mini';
  rewardCOP: number;
  duration: number;
}

@Component({
  selector: 'app-ptc-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
        <div class="absolute inset-0 bg-black/90 backdrop-blur-md" (click)="onClose()"></div>

        <div
          class="relative w-full max-w-lg sm:max-w-xl flex flex-col overflow-hidden rounded-2xl border shadow-2xl"
          [class]="getModalBorderClass()"
          style="max-height: 92vh"
        >
          <!-- Glow -->
          <div class="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px" [class]="getGlowClass()"></div>

          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-3 shrink-0 bg-zinc-950">
            <div class="flex items-center gap-3">
              <img src="/logo.webp" alt="PublihazClik" class="h-7 w-auto">
              <div class="h-4 w-px bg-white/10"></div>
              <span class="text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest" [class]="getAdTypeBadgeClass()">
                {{ getAdTypeLabel() }}
              </span>
            </div>
            <button (click)="onClose()" class="p-1.5 text-slate-600 hover:text-white hover:bg-white/10 rounded-lg transition-all">
              <span class="material-symbols-outlined" style="font-size:18px">close</span>
            </button>
          </div>

          <!-- Barra de progreso -->
          @if (countdown() > 0) {
            <div class="w-full h-1 bg-zinc-900 shrink-0">
              <div
                class="h-full transition-all duration-1000 ease-linear rounded-r-full"
                [class]="getProgressBarColor()"
                [style.width.%]="progressPercent()"
              ></div>
            </div>
          } @else {
            <div class="w-full h-1 shrink-0" [class]="getGlowClass()"></div>
          }

          <!-- Video / Imagen -->
          @if (isFacebookReel()) {
            <!-- Facebook Reel (vertical) -->
            <div class="w-full bg-black shrink-0 flex justify-center" style="height:52vh">
              <div class="relative h-full" style="aspect-ratio:9/16">
                <iframe
                  [src]="getFacebookEmbedUrl()"
                  frameborder="0"
                  allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                  allowfullscreen
                  scrolling="no"
                  class="absolute inset-0 w-full h-full"
                  style="overflow:hidden"
                ></iframe>
              </div>
            </div>
          } @else if (isFacebookVideo()) {
            <!-- Facebook video horizontal -->
            <div class="relative w-full bg-black shrink-0" style="padding-bottom:56.25%">
              <iframe
                [src]="getFacebookEmbedUrl()"
                frameborder="0"
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                allowfullscreen
                scrolling="no"
                class="absolute inset-0 w-full h-full"
                style="overflow:hidden"
              ></iframe>
            </div>
          } @else if (isTikTokVideo()) {
            <!-- TikTok (vertical, sin autoplay) -->
            <div class="w-full bg-black shrink-0 flex justify-center" style="height:52vh">
              <div class="relative h-full" style="aspect-ratio:9/16">
                <iframe
                  [src]="getVideoUrl()"
                  frameborder="0"
                  allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
                  allowfullscreen
                  scrolling="no"
                  class="absolute inset-0 w-full h-full"
                  style="overflow:hidden"
                ></iframe>
              </div>
            </div>
          } @else if (isVerticalVideo()) {
            <!-- Vertical: YouTube Shorts (autoplay) -->
            <div class="w-full bg-black shrink-0 flex justify-center" style="height:52vh">
              <div class="relative h-full" style="aspect-ratio:9/16">
                <iframe
                  [src]="getVideoUrl()"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; fullscreen"
                  allowfullscreen
                  class="absolute inset-0 w-full h-full"
                ></iframe>
                <!-- Overlay: bloquea controles -->
                <div class="absolute inset-0 z-10" style="cursor:default"></div>
              </div>
            </div>
          } @else {
            <!-- Horizontal: YouTube regular o imagen -->
            <div class="relative w-full bg-black shrink-0" style="aspect-ratio:16/9;max-height:42vh">
              @if (ad().videoUrl) {
                <iframe
                  [src]="getVideoUrl()"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; fullscreen"
                  allowfullscreen
                  class="absolute inset-0 w-full h-full"
                ></iframe>
                <!-- Overlay: bloquea controles -->
                <div class="absolute inset-0 z-10" style="cursor:default"></div>
              } @else if (ad().imageUrl) {
                <img [src]="ad().imageUrl" [alt]="ad().title" class="w-full h-full object-cover">
              } @else {
                <div class="w-full h-full flex items-center justify-center bg-zinc-950">
                  <span class="material-symbols-outlined text-slate-800 text-7xl">campaign</span>
                </div>
              }
            </div>
          }

          <!-- Alerta de pestaña inactiva -->
          @if (tabWasInactive()) {
            <div class="px-4 py-2 bg-rose-500/10 border-t border-rose-500/20 shrink-0">
              <p class="text-rose-400 text-xs font-bold flex items-center gap-1.5">
                <span class="material-symbols-outlined" style="font-size:14px">warning</span>
                Saliste de la pestaña. El temporizador se reinició.
              </p>
            </div>
          }

          <!-- Info -->
          <div class="px-4 py-3 bg-zinc-950 shrink-0 border-t border-white/5">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-white font-black text-sm sm:text-base leading-tight truncate">{{ ad().title }}</span>
                </div>
                <p class="text-slate-400 text-xs mt-1 line-clamp-2">{{ ad().description }}</p>
              </div>
              <div class="text-right shrink-0">
                <div class="text-[10px] text-slate-600 uppercase font-bold tracking-wider">Recompensa</div>
                <div class="text-emerald-400 font-black text-base sm:text-lg leading-tight">{{ rewardDisplay() }}</div>
              </div>
            </div>

            <!-- Botón Más información -->
            @if (ad().destinationUrl) {
              <a
                [href]="ad().destinationUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center justify-center gap-2 mt-3 w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white hover:bg-primary/10 hover:border-primary/20 hover:text-primary font-bold transition-all"
              >
                <span class="material-symbols-outlined" style="font-size:18px">info</span>
                Más información
              </a>
            }
          </div>

          <!-- Zona de interacción -->
          <div class="px-4 pb-4 pt-3 bg-zinc-950 overflow-y-auto">
            @if (alreadyViewed() && !captchaCompleted()) {
              <div class="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 text-center">
                <span class="material-symbols-outlined text-amber-400 text-2xl mb-2 block">visibility_off</span>
                <p class="text-amber-400 font-black text-sm">Anuncio ya visto</p>
                <p class="text-slate-600 text-xs mt-1">Ya interactuaste con este anuncio</p>
                <button (click)="onClose()" class="mt-3 px-6 py-2 bg-white/5 hover:bg-white/10 text-slate-400 font-bold rounded-xl text-xs uppercase tracking-wider">
                  Cerrar
                </button>
              </div>
            } @else if (waitingForFbPlay() && !captchaCompleted()) {
              <!-- Esperando play en video (Facebook / TikTok) -->
              <div class="bg-blue-500/5 border border-blue-500/15 rounded-xl p-4 text-center">
                <span class="material-symbols-outlined text-blue-400 text-3xl mb-2 block">play_circle</span>
                <p class="text-blue-300 font-black text-sm">Reproduce el video para iniciar</p>
                <p class="text-slate-500 text-xs mt-1">El contador comenzará cuando se reproduzca el video</p>
              </div>
            } @else if (!captchaCompleted()) {
              <!-- Contador circular -->
              <div class="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-center">
                <div class="w-16 h-16 mx-auto mb-3 relative">
                  <svg class="w-full h-full -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="2" class="text-white/5" />
                    <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="2.5"
                      class="text-primary" stroke-linecap="round"
                      [attr.stroke-dasharray]="175.93"
                      [attr.stroke-dashoffset]="175.93 - (175.93 * progressPercent() / 100)"
                    />
                  </svg>
                  <span class="absolute inset-0 flex items-center justify-center text-primary font-black text-lg tabular-nums">{{ countdown() }}</span>
                </div>
                <p class="text-slate-500 text-xs font-medium">Permanece en esta pestaña para desbloquear la recompensa</p>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- ═══ MODAL CAPTCHA GEOMÉTRICO ═══ -->
      @if (showCaptchaModal()) {
        <div class="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
          <div class="relative bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-xs shadow-2xl overflow-hidden">

            <div class="px-5 pt-5 pb-3 text-center">
              <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <span class="material-symbols-outlined text-primary text-2xl">verified</span>
              </div>
              <h3 class="text-white font-black text-base">Toca el {{ targetShapeName() }}</h3>
              <p class="text-slate-500 text-xs mt-1">Selecciona la figura correcta</p>
            </div>

            <div class="px-5 pb-5">
              <!-- 4 figuras como botones -->
              <div class="grid grid-cols-2 gap-3 mb-4">
                @for (shape of shapeOptions(); track shape.id) {
                  <button
                    (click)="selectShape(shape.id)"
                    class="aspect-square rounded-2xl flex items-center justify-center transition-all border-2 active:scale-90"
                    [class]="selectedShapeId() === shape.id
                      ? (shape.id === targetShapeId()
                        ? 'border-emerald-400 bg-emerald-500/10 scale-95'
                        : 'border-rose-400 bg-rose-500/10 scale-95')
                      : 'border-white/5 bg-zinc-900 hover:bg-white/5 hover:border-white/10'"
                  >
                    <svg viewBox="0 0 80 80" class="w-14 h-14 sm:w-16 sm:h-16">
                      @switch (shape.id) {
                        @case ('circle') {
                          <circle cx="40" cy="40" r="30" [attr.fill]="shape.color" opacity="0.9"/>
                        }
                        @case ('square') {
                          <rect x="12" y="12" width="56" height="56" rx="4" [attr.fill]="shape.color" opacity="0.9"/>
                        }
                        @case ('triangle') {
                          <polygon points="40,8 74,68 6,68" [attr.fill]="shape.color" opacity="0.9"/>
                        }
                        @case ('star') {
                          <polygon points="40,6 49,30 75,30 54,46 62,72 40,56 18,72 26,46 5,30 31,30" [attr.fill]="shape.color" opacity="0.9"/>
                        }
                        @case ('diamond') {
                          <polygon points="40,6 74,40 40,74 6,40" [attr.fill]="shape.color" opacity="0.9"/>
                        }
                        @case ('heart') {
                          <path d="M40,70 C20,50 4,36 4,24 C4,14 12,6 22,6 C30,6 36,10 40,18 C44,10 50,6 58,6 C68,6 76,14 76,24 C76,36 60,50 40,70Z" [attr.fill]="shape.color" opacity="0.9"/>
                        }
                      }
                    </svg>
                  </button>
                }
              </div>

              @if (captchaError()) {
                <p class="text-rose-400 text-xs text-center mb-3 flex items-center justify-center gap-1">
                  <span class="material-symbols-outlined" style="font-size:12px">error</span>
                  {{ captchaError() }}
                </p>
              }

              <button
                (click)="verifyCaptcha()"
                [disabled]="!selectedShapeId() || isVerifying()"
                class="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                [class]="selectedShapeId()
                  ? 'bg-primary hover:bg-primary/90 text-black shadow-lg shadow-primary/20'
                  : 'bg-white/5 text-slate-600 cursor-not-allowed'"
              >
                @if (isVerifying()) {
                  <span class="material-symbols-outlined animate-spin text-base">sync</span>
                  Verificando...
                } @else {
                  <span class="material-symbols-outlined text-base">redeem</span>
                  Reclamar {{ rewardDisplay() }}
                }
              </button>
            </div>
          </div>
        </div>
      }
    }

    <!-- Modal de recompensa -->
    @if (showRewardToast()) {
      <div class="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fadeIn">
        <div class="absolute inset-0 bg-black/90 backdrop-blur-md"></div>

        <div class="relative w-full max-w-sm bg-zinc-900 border border-emerald-500/20 rounded-3xl shadow-2xl shadow-emerald-500/10 overflow-hidden animate-scaleIn">
          <!-- Glow top -->
          <div class="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"></div>

          <div class="px-6 pt-8 pb-6 text-center">
            <!-- Icono grande -->
            <div class="w-20 h-20 mx-auto mb-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <span class="material-symbols-outlined text-emerald-400" style="font-size:44px">celebration</span>
            </div>

            <p class="text-white font-black text-lg mb-1">¡Felicitaciones!</p>

            <!-- Monto -->
            <p class="text-emerald-400 font-black text-3xl mb-2 flex items-center justify-center gap-2">
              +{{ toastRewardAmount() }}
              <span class="material-symbols-outlined text-emerald-400" style="font-size:28px">check_circle</span>
            </p>

            <!-- Mensaje de acreditación -->
            <div class="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-4 mb-5">
              <p class="text-slate-200 text-sm leading-relaxed">
                El valor de la recompensa <span class="text-emerald-400 font-black">será acreditado a tu billetera</span>.
                Sigue viendo anuncios para <span class="text-white font-bold">aumentar tu saldo</span>.
              </p>
            </div>

            <!-- Resumen -->
            <div class="grid grid-cols-2 gap-3 mb-5">
              <div class="bg-white/[0.03] border border-white/5 rounded-xl p-3 text-center">
                <span class="material-symbols-outlined text-primary mb-1" style="font-size:20px">account_balance_wallet</span>
                <p class="text-[10px] text-slate-500 uppercase font-bold">Billetera</p>
                <p class="text-white font-black text-sm">{{ toastRewardAmount() }}</p>
              </div>
              <div class="bg-white/[0.03] border border-white/5 rounded-xl p-3 text-center">
                <span class="material-symbols-outlined text-amber-400 mb-1" style="font-size:20px">ads_click</span>
                <p class="text-[10px] text-slate-500 uppercase font-bold">Anuncio</p>
                <p class="text-white font-black text-sm truncate">{{ ad().title }}</p>
              </div>
            </div>
          </div>

          <!-- Botón continuar -->
          <button
            (click)="closeRewardModal()"
            class="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm uppercase tracking-wider transition-all"
          >
            ¡Seguir ganando!
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.9); }
      to   { opacity: 1; transform: scale(1); }
    }
    .animate-fadeIn {
      animation: fadeIn 0.25s ease-out forwards;
    }
    .animate-scaleIn {
      animation: scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    /* Fuerza que el iframe de Facebook ocupe todo el contenedor */
    :host ::ng-deep .fb-video,
    :host ::ng-deep .fb-video span,
    :host ::ng-deep .fb-video > span > iframe {
      width: 100% !important;
      height: 100% !important;
    }
    :host ::ng-deep iframe {
      border: 0;
    }
  `],
})
export class PtcModalComponent implements OnInit, OnDestroy {
  ad = input.required<PtcAd>();
  isOpen = input<boolean>(true);
  @Output() close = new EventEmitter<void>();
  @Output() rewardClaimed = new EventEmitter<{ walletAmount: number; donationAmount: number; taskId: string; durationMs: number }>();

  protected currencyService = inject(CurrencyService);
  private sanitizer = inject(DomSanitizer);
  private userTracking = inject(UserTrackingService);

  protected alreadyViewed = signal(false);
  protected tabWasInactive = signal(false);
  protected waitingForFbPlay = signal(false);

  protected whatsappReferralUrl = `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent('Hola! Quiero solicitar mi link de referido para empezar a ganar en Publihazclick')}`;


  protected rewardDisplay = computed(() => {
    const rewardCOP = this.ad().rewardCOP || 0;
    const selectedCurrency = this.currencyService.selectedCurrency();
    if (selectedCurrency.code === 'COP') {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(rewardCOP);
    }
    return this.currencyService.formatFromCOP(rewardCOP, 2);
  });

  protected progressPercent = computed(() => {
    const duration = this.ad().duration || 60;
    return ((duration - this.countdown()) / duration) * 100;
  });

  protected countdown = signal(60);
  protected captchaCompleted = signal(false);
  protected captchaError = signal<string | null>(null);
  protected isVerifying = signal(false);

  // Toast de recompensa
  protected showRewardToast = signal(false);
  protected toastRewardAmount = signal('');

  // Modal captcha geométrico
  protected showCaptchaModal = signal(false);
  protected targetShapeId = signal('');
  protected targetShapeName = signal('');
  protected shapeOptions = signal<{ id: string; color: string }[]>([]);
  protected selectedShapeId = signal<string | null>(null);

  private readonly SHAPES: { id: string; name: string; color: string }[] = [
    { id: 'circle', name: 'Círculo', color: '#00E5FF' },
    { id: 'square', name: 'Cuadrado', color: '#FF007F' },
    { id: 'triangle', name: 'Triángulo', color: '#FBBF24' },
    { id: 'star', name: 'Estrella', color: '#A855F7' },
    { id: 'diamond', name: 'Rombo', color: '#10B981' },
    { id: 'heart', name: 'Corazón', color: '#F43F5E' },
  ];

  private countdownInterval: any;
  private fbFocusInterval: any;
  private countdownStartTime: number = 0;
  private cachedVideoUrl: SafeResourceUrl | null = null;
  private cachedVideoUrlSource: string | null = null;
  private visibilityHandler = this.onVisibilityChange.bind(this);

  protected isFacebookVideo = computed(() => {
    const url = this.ad().videoUrl;
    return !!(url && (url.includes('facebook.com') || url.includes('fb.watch')));
  });

  protected isFacebookReel = computed(() => {
    const url = this.ad().videoUrl;
    return !!(url && url.includes('facebook.com/reel/'));
  });

  protected isTikTokVideo = computed(() => {
    const url = this.ad().videoUrl;
    return !!(url && url.includes('tiktok.com'));
  });

  protected isVerticalVideo = computed(() => {
    const url = this.ad().videoUrl;
    if (!url) return false;
    return url.includes('youtube.com/shorts/');
  });

  /** Videos que no hacen autoplay y requieren que el usuario dé play manualmente. */
  protected requiresManualPlay = computed(() => this.isFacebookVideo() || this.isTikTokVideo());

  ngOnInit(): void {
    this.countdown.set(this.ad().duration || 60);
    this.alreadyViewed.set(!this.userTracking.canClaimReward(this.ad().id));

    document.addEventListener('visibilitychange', this.visibilityHandler);

    if (this.requiresManualPlay()) {
      // Facebook / TikTok no hacen autoplay: esperar a que el usuario dé play
      this.waitingForFbPlay.set(true);
      this.startFbFocusDetection();
    } else {
      // YouTube: autoplay, contador inicia de inmediato
      this.startCountdown();
    }
  }

  ngOnDestroy(): void {
    this.stopCountdown();
    this.stopFbFocusDetection();
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }

  // ── Visibilidad de pestaña ──────────────────────────────────────────────

  private onVisibilityChange(): void {
    if (this.waitingForFbPlay()) return;

    if (document.hidden && this.countdown() > 0 && !this.captchaCompleted() && !this.alreadyViewed()) {
      this.stopCountdown();
      this.countdown.set(this.ad().duration || 60);
      this.tabWasInactive.set(true);
      this.showCaptchaModal.set(false);
    } else if (!document.hidden && this.tabWasInactive()) {
      setTimeout(() => {
        this.tabWasInactive.set(false);
        this.startCountdown();
      }, 1500);
    }
  }

  // ── Detección de play en Facebook ─────────────────────────────────────

  /** Detecta cuando el usuario hace clic dentro del iframe (play) monitoreando el foco. */
  private startFbFocusDetection(): void {
    this.fbFocusInterval = setInterval(() => {
      if (document.activeElement?.tagName === 'IFRAME' && this.waitingForFbPlay()) {
        this.waitingForFbPlay.set(false);
        this.stopFbFocusDetection();
        this.startCountdown();
      }
    }, 300);
  }

  private stopFbFocusDetection(): void {
    if (this.fbFocusInterval) {
      clearInterval(this.fbFocusInterval);
      this.fbFocusInterval = null;
    }
  }

  // ── Countdown ───────────────────────────────────────────────────────────

  private startCountdown(): void {
    this.stopCountdown();
    this.captchaCompleted.set(false);
    this.captchaError.set(null);
    this.selectedShapeId.set(null);
    this.showCaptchaModal.set(false);
    this.countdown.set(this.ad().duration || 60);
    this.countdownStartTime = Date.now();

    this.countdownInterval = setInterval(() => {
      this.countdown.update((v) => {
        if (v <= 1) {
          this.stopCountdown();
          this.openCaptchaModal();
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  // ── Captcha ─────────────────────────────────────────────────────────────

  private openCaptchaModal(): void {
    this.generateCaptcha();
    this.showCaptchaModal.set(true);
  }

  private generateCaptcha(): void {
    // Mezclar las figuras y tomar 4
    const shuffled = [...this.SHAPES].sort(() => Math.random() - 0.5);
    const pick = shuffled.slice(0, 4);

    // Elegir la correcta al azar
    const target = pick[Math.floor(Math.random() * pick.length)];
    this.targetShapeId.set(target.id);
    this.targetShapeName.set(target.name);
    this.shapeOptions.set(pick.map(s => ({ id: s.id, color: s.color })));
    this.selectedShapeId.set(null);
    this.captchaError.set(null);
  }

  selectShape(id: string): void {
    this.selectedShapeId.set(id);
    this.captchaError.set(null);
  }

  verifyCaptcha(): void {
    if (this.alreadyViewed()) return;
    const selected = this.selectedShapeId();
    if (!selected) return;

    this.isVerifying.set(true);
    this.captchaError.set(null);

    setTimeout(() => {
      if (selected === this.targetShapeId()) {
        this.userTracking.recordAdView(this.ad().id);
        this.alreadyViewed.set(true);
        this.captchaCompleted.set(true);
        this.showCaptchaModal.set(false);

        const rewardCOP = this.ad().rewardCOP || 1;
        const durationMs = this.countdownStartTime > 0 ? Date.now() - this.countdownStartTime : 0;
        this.rewardClaimed.emit({ walletAmount: rewardCOP, donationAmount: 0, taskId: this.ad().id, durationMs });

        // Mostrar modal de recompensa demo
        this.showRewardToast.set(true);
        this.toastRewardAmount.set(this.rewardDisplay());
      } else {
        this.captchaError.set('Figura incorrecta, intenta de nuevo');
        this.selectedShapeId.set(null);
        this.generateCaptcha();
      }
      this.isVerifying.set(false);
    }, 400);
  }

  // ── Cerrar ──────────────────────────────────────────────────────────────

  closeRewardModal(): void {
    this.showRewardToast.set(false);
    this.onClose();
  }

  onClose(): void {
    this.stopCountdown();
    this.close.emit();
  }

  // ── Facebook ─────────────────────────────────────────────────────────────

  private cachedFbUrl: SafeResourceUrl | null = null;
  private cachedFbSource: string | null = null;

  /** URL del plugin de Facebook — cacheada para evitar recargas del iframe. */
  getFacebookEmbedUrl(): SafeResourceUrl {
    const url = this.ad().videoUrl;
    if (this.cachedFbUrl && this.cachedFbSource === url) return this.cachedFbUrl;
    const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&width=0`;
    this.cachedFbUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
    this.cachedFbSource = url;
    return this.cachedFbUrl;
  }

  // ── Video (YouTube / TikTok) ─────────────────────────────────────────────

  getVideoUrl(): SafeResourceUrl | null {
    const url = this.ad().videoUrl;
    if (!url) return null;
    if (this.cachedVideoUrl && this.cachedVideoUrlSource === url) return this.cachedVideoUrl;

    let embedUrl = '';

    if (url.includes('facebook.com') || url.includes('fb.watch')) {
      // Facebook se maneja con getFacebookEmbedUrl() y su propio bloque en el template
      return null;
    } else if (url.includes('tiktok.com')) {
      // TikTok: https://www.tiktok.com/@user/video/1234567890123456789
      const match = url.match(/\/video\/(\d+)/);
      if (!match) return null;
      embedUrl = `https://www.tiktok.com/embed/v2/${match[1]}?autoplay=1&music_info=0&description=0`;
    } else if (url.includes('youtube.com/shorts/')) {
      // YouTube Shorts (vertical): sin controles, autoplay, con sonido, loop
      const match = url.match(/shorts\/([a-zA-Z0-9_-]{11})/);
      if (!match) return null;
      embedUrl = `https://www.youtube.com/embed/${match[1]}?autoplay=1&mute=0&controls=0&rel=0&loop=1&playlist=${match[1]}&modestbranding=1&fs=0&iv_load_policy=3&disablekb=1`;
    } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
      // YouTube regular: sin controles, autoplay, con sonido
      const match = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
      if (!match) return null;
      embedUrl = `https://www.youtube.com/embed/${match[1]}?autoplay=1&mute=0&controls=0&rel=0&modestbranding=1&fs=0&iv_load_policy=3&disablekb=1`;
    } else if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      // ID bare de YouTube (legacy)
      embedUrl = `https://www.youtube.com/embed/${url}?autoplay=1&mute=0&controls=0&rel=0&modestbranding=1&fs=0&disablekb=1`;
    } else {
      return null;
    }

    this.cachedVideoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
    this.cachedVideoUrlSource = url;
    return this.cachedVideoUrl;
  }

  // ── Helpers de estilo ───────────────────────────────────────────────────

  getAdTypeLabel(): string {
    const labels: Record<string, string> = {
      mega: 'Mega Anuncio', standard_600: 'Anuncio 600',
      standard_400: 'Anuncio 400', mini: 'Mini Anuncio',
    };
    return labels[this.ad().adType] || 'PTC';
  }

  getAdTypeBadgeClass(): string {
    const c: Record<string, string> = {
      mega: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
      standard_600: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20',
      standard_400: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
      mini: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
    };
    return c[this.ad().adType] || 'bg-white/10 text-slate-300 border border-white/10';
  }

  getModalBorderClass(): string {
    const c: Record<string, string> = {
      mega: 'bg-zinc-950 border-purple-500/20 shadow-purple-500/10',
      standard_600: 'bg-zinc-950 border-cyan-500/20 shadow-cyan-500/10',
      standard_400: 'bg-zinc-950 border-blue-500/20 shadow-blue-500/10',
      mini: 'bg-zinc-950 border-emerald-500/20 shadow-emerald-500/10',
    };
    return c[this.ad().adType] || 'bg-zinc-950 border-white/10';
  }

  getGlowClass(): string {
    const c: Record<string, string> = {
      mega: 'bg-gradient-to-r from-transparent via-purple-500/50 to-transparent',
      standard_600: 'bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent',
      standard_400: 'bg-gradient-to-r from-transparent via-blue-500/50 to-transparent',
      mini: 'bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent',
    };
    return c[this.ad().adType] || 'bg-gradient-to-r from-transparent via-white/20 to-transparent';
  }

  getProgressBarColor(): string {
    const p = this.progressPercent();
    if (p < 50) return 'bg-primary';
    if (p < 80) return 'bg-amber-400';
    return 'bg-emerald-400';
  }
}
