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
import { FormsModule } from '@angular/forms';
import { CurrencyService } from '../../core/services/currency.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { UserTrackingService } from '../../core/services/user-tracking.service';

export interface PtcAd {
  id: string;
  title: string;
  advertiserName: string;
  advertiserType: 'company' | 'person';
  imageUrl: string;
  youtubeVideoId: string;
  destinationUrl: string;
  adType: 'mega' | 'standard_400' | 'standard_600' | 'mini';
  rewardCOP: number;
  duration: number;
}

@Component({
  selector: 'app-ptc-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (isOpen()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
        <div class="absolute inset-0 bg-black/85 backdrop-blur-sm" (click)="onClose()"></div>

        <div class="relative bg-zinc-950 rounded-2xl w-full max-w-lg sm:max-w-xl shadow-2xl border border-white/10 flex flex-col overflow-hidden"
          style="max-height: 92vh">

          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0 bg-white/[0.03]">
            <div class="flex items-center gap-3">
              <img src="/logo.webp" alt="PublihazClik" class="h-8 w-auto">
              <div class="h-5 w-px bg-white/10"></div>
              <span class="text-xs font-black px-2 py-0.5 rounded uppercase tracking-wider" [class]="getAdTypeBadgeClass()">
                {{ getAdTypeLabel() }}
              </span>
            </div>
            <button (click)="onClose()" class="p-1.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-all">
              <span class="material-symbols-outlined" style="font-size:20px">close</span>
            </button>
          </div>

          <!-- Title row -->
          <div class="px-4 py-3 border-b border-white/5 shrink-0">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <h4 class="text-white font-black text-base sm:text-lg leading-tight">{{ ad().title }}</h4>
                <p class="text-slate-500 text-xs mt-0.5">por {{ ad().advertiserName }}</p>
              </div>
              @if (countdown() > 0) {
                <div class="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-xl shrink-0">
                  <span class="material-symbols-outlined text-primary" style="font-size:14px">timer</span>
                  <span class="text-primary text-sm font-black">{{ countdown() }}s</span>
                </div>
              } @else if (!captchaCompleted() && !alreadyViewed()) {
                <div class="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl shrink-0">
                  <span class="material-symbols-outlined text-emerald-400" style="font-size:14px">check_circle</span>
                  <span class="text-emerald-400 text-xs font-bold">Listo</span>
                </div>
              }
            </div>
          </div>

          <!-- Video area -->
          <div class="relative w-full bg-black shrink-0" style="aspect-ratio: 16/9; max-height: 40vh">
            @if (ad().youtubeVideoId) {
              <iframe
                [src]="getVideoUrl()"
                title="YouTube video player"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowfullscreen
                class="w-full h-full"
              ></iframe>
            } @else if (ad().imageUrl) {
              <img [src]="ad().imageUrl" [alt]="ad().title" class="w-full h-full object-cover">
            } @else {
              <div class="w-full h-full flex items-center justify-center bg-zinc-900">
                <span class="material-symbols-outlined text-slate-700 text-6xl">campaign</span>
              </div>
            }
            @if (countdown() > 0 && ad().youtubeVideoId) {
              <div class="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-lg pointer-events-none">
                <span class="material-symbols-outlined text-white/60" style="font-size:12px">visibility</span>
                <span class="text-white/60 text-[10px] font-medium">Mira el video completo</span>
              </div>
            }
          </div>

          <!-- Reward bar -->
          <div class="px-4 py-3 border-t border-white/5 flex items-center justify-between shrink-0 bg-white/[0.02]">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">monetization_on</span>
              <span class="text-slate-400 text-xs">Recompensa:</span>
              <span class="text-emerald-400 font-black text-lg">{{ rewardDisplay() }}</span>
            </div>
            @if (ad().destinationUrl) {
              <a
                [href]="ad().destinationUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-bold transition-colors"
              >
                Ver más
                <span class="material-symbols-outlined" style="font-size:14px">open_in_new</span>
              </a>
            }
          </div>

          <!-- Bottom: interaction area -->
          <div class="px-4 pb-4 pt-3 overflow-y-auto">
            @if (alreadyViewed()) {
              <div class="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                <span class="material-symbols-outlined text-amber-400 text-3xl mb-2 block">warning</span>
                <p class="text-amber-400 font-bold">¡Anuncio ya visto!</p>
                <p class="text-slate-500 text-xs mt-1">Ya has visto este anuncio anteriormente.</p>
                <button
                  (click)="onClose()"
                  class="w-full mt-3 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl transition-colors text-sm"
                >
                  Cerrar
                </button>
              </div>
            } @else if (captchaCompleted()) {
              <div class="space-y-3">
                <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                  <span class="material-symbols-outlined text-emerald-400 text-3xl mb-2 block">check_circle</span>
                  <p class="text-emerald-400 font-black text-base">¡Recompensa acreditada!</p>
                  <p class="text-slate-500 text-xs mt-1">{{ rewardDisplay() }} han sido agregados a tu wallet</p>
                </div>
                <button
                  (click)="onClose()"
                  class="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-xl transition-colors text-sm"
                >
                  Continuar
                </button>
              </div>
            } @else if (countdown() === 0) {
              <!-- Captcha -->
              <div class="space-y-3">
                <div class="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p class="text-white text-sm font-bold mb-3 flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary" style="font-size:16px">security</span>
                    Verificación rápida
                  </p>
                  <div class="flex items-center gap-3 mb-3">
                    <div class="bg-zinc-900 border border-white/10 px-4 py-2.5 rounded-xl">
                      <span class="text-white text-lg font-black">{{ num1 }} + {{ num2 }} = ?</span>
                    </div>
                    <input
                      type="number"
                      [(ngModel)]="captchaAnswer"
                      placeholder="?"
                      class="w-20 px-3 py-2.5 bg-zinc-900 text-white text-center text-lg font-black rounded-xl border border-white/10 focus:border-primary/50 outline-none"
                    />
                  </div>
                  <button
                    (click)="verifyCaptcha()"
                    [disabled]="!captchaAnswer || isVerifying()"
                    class="w-full py-2.5 rounded-xl font-black text-sm transition-colors"
                    [class]="captchaAnswer ? 'bg-primary hover:bg-primary/90 text-black' : 'bg-white/5 text-slate-600 cursor-not-allowed'"
                  >
                    {{ isVerifying() ? 'Verificando...' : 'Confirmar y reclamar recompensa' }}
                  </button>
                  @if (captchaError()) {
                    <p class="text-rose-400 text-xs text-center mt-2">{{ captchaError() }}</p>
                  }
                </div>
              </div>
            } @else {
              <!-- Waiting -->
              <button
                disabled
                class="w-full py-2.5 bg-white/5 text-slate-600 font-bold rounded-xl cursor-not-allowed text-sm flex items-center justify-center gap-2"
              >
                <span class="material-symbols-outlined text-slate-600" style="font-size:16px">timer</span>
                Esperando... ({{ countdown() }}s)
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class PtcModalComponent implements OnInit, OnDestroy {
  ad = input.required<PtcAd>();
  isOpen = input<boolean>(true);
  @Output() close = new EventEmitter<void>();
  @Output() rewardClaimed = new EventEmitter<{ walletAmount: number; donationAmount: number }>();

  protected currencyService = inject(CurrencyService);
  private sanitizer = inject(DomSanitizer);
  private userTracking = inject(UserTrackingService);

  protected alreadyViewed = signal(false);
  protected ipAddress = signal('');

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

  protected countdown = signal(60);
  protected captchaCompleted = signal(false);
  protected captchaAnswer: number | null = null;
  protected captchaError = signal<string | null>(null);
  protected isVerifying = signal(false);

  protected num1 = 0;
  protected num2 = 0;

  private countdownInterval: any;
  private videoUrl: SafeResourceUrl | null = null;

  ngOnInit(): void {
    this.ipAddress.set(this.userTracking.getIp());
    this.alreadyViewed.set(!this.userTracking.canClaimReward(this.ad().id));
    this.generateCaptcha();
    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.clearInterval();
  }

  private clearInterval(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
  }

  startCountdown(): void {
    this.clearInterval();
    this.countdown.set(60);
    this.captchaCompleted.set(false);
    this.captchaAnswer = null;
    this.captchaError.set(null);
    this.generateCaptcha();

    this.countdownInterval = setInterval(() => {
      this.countdown.update((v) => {
        if (v <= 1) {
          this.clearInterval();
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }

  generateCaptcha(): void {
    this.num1 = Math.floor(Math.random() * 10) + 1;
    this.num2 = Math.floor(Math.random() * 10) + 1;
  }

  verifyCaptcha(): void {
    if (this.alreadyViewed()) {
      this.captchaError.set('Ya has visto este anuncio anteriormente.');
      return;
    }
    if (this.captchaAnswer === null) return;

    this.isVerifying.set(true);
    this.captchaError.set(null);

    setTimeout(() => {
      if (this.captchaAnswer === this.num1 + this.num2) {
        this.userTracking.recordAdView(this.ad().id);
        this.alreadyViewed.set(true);
        this.captchaCompleted.set(true);

        const rewardCOP = this.ad().rewardCOP || 1;
        this.rewardClaimed.emit({ walletAmount: rewardCOP, donationAmount: 10 });
      } else {
        this.captchaError.set('Respuesta incorrecta. Intenta de nuevo.');
        this.captchaAnswer = null;
        this.generateCaptcha();
      }
      this.isVerifying.set(false);
    }, 500);
  }

  onClose(): void {
    this.clearInterval();
    this.close.emit();
  }

  getVideoUrl(): SafeResourceUrl | null {
    const videoId = this.ad().youtubeVideoId;
    if (!videoId) return null;

    if (!this.videoUrl) {
      const url = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
      this.videoUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }
    return this.videoUrl;
  }

  getAdTypeLabel(): string {
    switch (this.ad().adType) {
      case 'mega': return 'Mega Anuncio';
      case 'standard_400': return 'Anuncio 400';
      case 'standard_600': return 'Anuncio 600';
      case 'mini': return 'Mini Anuncio';
      default: return 'PTC';
    }
  }

  getAdTypeBadgeClass(): string {
    switch (this.ad().adType) {
      case 'mega': return 'bg-purple-500/15 text-purple-400 border border-purple-500/20';
      case 'standard_600': return 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20';
      case 'standard_400': return 'bg-blue-500/15 text-blue-400 border border-blue-500/20';
      case 'mini': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
      default: return 'bg-white/10 text-slate-300 border border-white/10';
    }
  }
}
