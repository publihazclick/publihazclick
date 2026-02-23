import { Component, signal, Input, Output, EventEmitter, OnInit, OnDestroy, effect, inject, input, computed } from '@angular/core';
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
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" (click)="onClose()"></div>
        
        <div class="relative bg-gray-900 rounded-2xl w-full max-w-lg sm:max-w-2xl lg:max-w-3xl h-[90vh] sm:h-[85vh] lg:h-[80vh] shadow-2xl border border-gray-700 flex flex-col">
          <div class="bg-gradient-to-r from-cyan-600 to-blue-600 p-3 sm:p-4 lg:p-5 flex items-center justify-between shrink-0">
            <div class="flex items-center space-x-3">
              <img src="/logo.webp" alt="PublihazClik" class="h-12 sm:h-14 lg:h-16 w-auto">
            </div>
            <button (click)="onClose()" class="text-white/80 hover:text-white transition-colors">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <div class="p-3 sm:p-4 border-b border-gray-700 shrink-0">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center space-x-2">
                <span class="text-sm sm:text-base text-gray-400">{{ ad().advertiserName }}</span>
                <span class="px-2 py-0.5 rounded-full text-xs sm:text-sm font-bold" [ngClass]="getAdTypeClass()">
                  {{ getAdTypeLabel() }}
                </span>
              </div>
              @if (countdown() > 0) {
                <div class="bg-black/80 rounded-lg px-3 py-1 flex items-center gap-2">
                  <span class="text-cyan-400 text-sm font-bold">{{ countdown() }}s</span>
                </div>
              }
            </div>
            <h4 class="text-white font-bold text-lg sm:text-xl lg:text-2xl">{{ ad().title }}</h4>
          </div>

          <div class="relative aspect-video bg-black w-full h-40 sm:h-48 lg:h-56 shrink-0">
            @if (ad().youtubeVideoId) {
              <iframe 
                [src]="getVideoUrl()"
                title="YouTube video player"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowfullscreen
                class="w-full h-full"
              ></iframe>
            }
            
            @if (countdown() > 0) {
              <div class="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 bg-black/70 px-3 py-1 rounded-full">
                <span class="text-white text-xs sm:text-sm">Ver completo</span>
              </div>
            }
          </div>

          <div class="p-3 sm:p-4 bg-gray-800 mt-auto overflow-y-auto">
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
              <div class="flex items-center space-x-2">
                <span class="text-gray-400 text-sm sm:text-base">
                  <span class="material-symbols-outlined text-cyan-500 align-middle">info</span>
                  Recompensa por ver:
                </span>
                <span class="text-xl sm:text-2xl lg:text-3xl font-black text-green-400">
                  {{ rewardDisplay() }}
                </span>
              </div>
              <a 
                [href]="getYoutubeLink()" 
                target="_blank" 
                rel="noopener noreferrer"
                class="text-cyan-400 hover:text-cyan-300 text-sm flex items-center space-x-1 transition-colors"
              >
                <span>Ver más</span>
                <span class="material-symbols-outlined text-sm">open_in_new</span>
              </a>
            </div>

            @if (alreadyViewed()) {
              <div class="bg-yellow-500/20 border border-yellow-500 rounded-lg p-4 text-center">
                <span class="material-symbols-outlined text-yellow-400 text-3xl sm:text-4xl mb-2">warning</span>
                <p class="text-yellow-400 font-bold text-lg sm:text-xl">¡Anuncio ya visto!</p>
                <p class="text-gray-400 text-sm mt-2">Ya has visto este anuncio anteriormente.</p>
                <p class="text-gray-500 text-xs mt-1">IP: {{ ipAddress() }}</p>
                <button 
                  (click)="onClose()"
                  class="w-full mt-4 py-2 sm:py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded-lg transition-colors text-sm sm:text-base"
                >
                  Cerrar
                </button>
              </div>
            } @else if (countdown() === 0 && !captchaCompleted()) {
              <div class="space-y-3">
                <div class="bg-gray-700 rounded-lg p-3 sm:p-4">
                  <p class="text-white text-sm sm:text-base mb-2">Verificación de humano</p>
                  <div class="flex items-center space-x-3 sm:space-x-4 mb-3 sm:mb-4">
                    <div class="bg-gray-600 px-3 sm:px-4 py-2 rounded-lg">
                      <span class="text-white text-base sm:text-xl font-bold">{{ num1 }} + {{ num2 }} = ?</span>
                    </div>
                    <input 
                      type="number" 
                      [(ngModel)]="captchaAnswer"
                      placeholder="?"
                      class="w-16 sm:w-20 px-3 py-2 bg-gray-800 text-white text-center text-lg sm:text-xl font-bold rounded-lg border border-gray-600 focus:border-cyan-500 outline-none"
                    />
                  </div>
                  <button 
                    (click)="verifyCaptcha()"
                    [disabled]="!captchaAnswer || isVerifying()"
                    class="w-full py-2 sm:py-3 rounded-lg font-bold text-sm sm:text-base transition-colors"
                    [ngClass]="captchaAnswer ? 'bg-cyan-500 hover:bg-cyan-400 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'"
                  >
                    {{ isVerifying() ? 'Verificando...' : 'Confirmar' }}
                  </button>
                </div>
                @if (captchaError()) {
                  <div class="text-red-400 text-sm text-center">
                    {{ captchaError() }}
                  </div>
                }
              </div>
            }

            @if (captchaCompleted()) {
              <div class="space-y-3">
                <div class="bg-green-500/20 border border-green-500 rounded-lg p-3 sm:p-4 text-center">
                  <span class="material-symbols-outlined text-green-400 text-3xl sm:text-4xl mb-2">check_circle</span>
                  <p class="text-green-400 font-bold text-lg sm:text-xl">¡Recompensa enviada!</p>
                  <p class="text-gray-400 text-sm">100% wallet • $10 COP a donaciones</p>
                </div>
                <button 
                  (click)="onClose()"
                  class="w-full py-2 sm:py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg transition-colors text-sm sm:text-base"
                >
                  Continuar
                </button>
              </div>
            }

            @if (countdown() > 0) {
              <button 
                disabled
                class="w-full py-2 sm:py-3 bg-gray-600 text-gray-400 font-bold rounded-lg cursor-not-allowed text-sm sm:text-base"
              >
                Esperando... ({{ countdown() }}s)
              </button>
            }
          </div>
        </div>
      </div>
    }
  `
})
export class PtcModalComponent implements OnInit, OnDestroy {
  ad = input.required<PtcAd>();
  isOpen = input<boolean>(true);
  @Output() close = new EventEmitter<void>();
  @Output() rewardClaimed = new EventEmitter<{ walletAmount: number; donationAmount: number }>();

  protected currencyService = inject(CurrencyService);
  private sanitizer = inject(DomSanitizer);
  private userTracking = inject(UserTrackingService);
  
  // Signal para verificar si el usuario ya vio este anuncio
  protected alreadyViewed = signal(false);
  protected ipAddress = signal('');
  
  // Computed that reacts to currency changes - converts from COP to selected currency
  protected rewardDisplay = computed(() => {
    const rewardCOP = this.ad().rewardCOP || 0;
    
    // Si la moneda seleccionada es COP, mostrar directamente
    const selectedCurrency = this.currencyService.selectedCurrency();
    if (selectedCurrency.code === 'COP') {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(rewardCOP);
    }
    
    // Para otras monedas, usar el servicio de conversión
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
    // Obtener IP del usuario
    this.ipAddress.set(this.userTracking.getIp());
    
    // Verificar si ya vio este anuncio
    this.alreadyViewed.set(!this.userTracking.canClaimReward(this.ad().id));
    
    this.generateCaptcha();
    // Start countdown when modal opens
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
      this.countdown.update(v => {
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
    // Verificar si el usuario ya vio este anuncio
    if (this.alreadyViewed()) {
      this.captchaError.set('Ya has visto este anuncio anteriormente. Intenta con otro.');
      return;
    }
    
    if (this.captchaAnswer === null) return;
    
    this.isVerifying.set(true);
    this.captchaError.set(null);
    
    setTimeout(() => {
      if (this.captchaAnswer === this.num1 + this.num2) {
        // Registrar la vista del anuncio antes de dar la recompensa
        this.userTracking.recordAdView(this.ad().id);
        this.alreadyViewed.set(true);
        
        this.captchaCompleted.set(true);
        
        const rewardCOP = this.ad().rewardCOP || 1;
        const walletAmount = rewardCOP; // 100% to wallet
        const donationAmount = 10; // 10 pesos COP to donations
        
        this.rewardClaimed.emit({
          walletAmount,
          donationAmount
        });
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

  getYoutubeLink(): string {
    const videoId = this.ad().youtubeVideoId;
    if (!videoId) return '#';
    return `https://www.youtube.com/watch?v=${videoId}`;
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

  getRewardDisplay(): string {
    const rewardCOP = this.ad().rewardCOP || 0;
    
    // Si la moneda seleccionada es COP, mostrar directamente
    const selectedCurrency = this.currencyService.selectedCurrency();
    if (selectedCurrency.code === 'COP') {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(rewardCOP);
    }
    
    // Para otras monedas, usar el servicio de conversión
    return this.currencyService.formatFromCOP(rewardCOP, 2);
  }

  getAdTypeLabel(): string {
    const type = this.ad().adType;
    switch (type) {
      case 'mega': return 'Mega Anuncio';
      case 'standard_400': return 'Anuncio 400';
      case 'standard_600': return 'Anuncio 600';
      case 'mini': return 'Mini Anuncio';
      default: return 'PTC';
    }
  }

  getAdTypeClass(): string {
    const type = this.ad().adType;
    switch (type) {
      case 'mega': return 'bg-purple-100 text-purple-600';
      case 'standard_400': return 'bg-blue-100 text-blue-600';
      case 'standard_600': return 'bg-green-100 text-green-600';
      case 'mini': return 'bg-cyan-100 text-cyan-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  }
}
