import { Component, signal, Input, Output, EventEmitter, OnInit, OnDestroy, effect, inject, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CurrencyService } from '../../core/services/currency.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

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
        
        <div class="relative bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-gray-700">
          <div class="bg-gradient-to-r from-cyan-600 to-blue-600 p-4 flex items-center justify-between">
            <div class="flex items-center space-x-3">
              @if (ad().imageUrl) {
                <img [src]="ad().imageUrl" alt="Logo" class="w-8 h-8 rounded-lg object-cover">
              } @else {
                <span class="material-symbols-outlined text-white">ads_click</span>
              }
              <h3 class="text-white font-bold text-lg">Ver Anuncio</h3>
            </div>
            <button (click)="onClose()" class="text-white/80 hover:text-white transition-colors">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <div class="p-4 border-b border-gray-700">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center space-x-2">
                <span class="text-sm text-gray-400">{{ ad().advertiserName }}</span>
                <span class="px-2 py-0.5 rounded-full text-xs font-bold" [ngClass]="getAdTypeClass()">
                  {{ getAdTypeLabel() }}
                </span>
              </div>
              @if (countdown() > 0) {
                <div class="bg-black/80 rounded-lg px-3 py-1 flex items-center gap-2">
                  <span class="text-cyan-400 text-sm font-bold">{{ countdown() }}s</span>
                </div>
              }
            </div>
            <h4 class="text-white font-bold text-xl">{{ ad().title }}</h4>
          </div>

          <div class="relative aspect-video bg-black">
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
              <div class="absolute top-2 right-2 bg-black/80 rounded-lg p-3 flex flex-col items-center min-w-[80px]">
                <div class="text-2xl font-black text-white">{{ countdown() }}s</div>
                <div class="w-16 h-1.5 bg-gray-700 rounded-full mt-1 overflow-hidden">
                  <div 
                    class="h-full bg-cyan-500 transition-all duration-1000"
                    [style.width.%]="((60 - countdown()) / 60) * 100"
                  ></div>
                </div>
              </div>
            }
            
            @if (countdown() > 0) {
              <div class="absolute bottom-4 left-4 bg-black/70 px-3 py-1 rounded-full">
                <span class="text-white text-sm">Debes ver el anuncio completo</span>
              </div>
            }
          </div>

          <div class="p-4 bg-gray-800">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center space-x-2">
                <span class="text-gray-400 text-sm">
                  <span class="material-symbols-outlined text-cyan-500 align-middle">info</span>
                  Recompensa por ver:
                </span>
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
              <div class="text-2xl font-black text-green-400">
                <span>$</span>{{ rewardDisplay() }}
              </div>
            </div>

            @if (countdown() === 0 && !captchaCompleted()) {
              <div class="space-y-4">
                <div class="bg-gray-700 rounded-lg p-4">
                  <p class="text-white text-sm mb-2">Verificación de humano</p>
                  <div class="flex items-center space-x-4 mb-4">
                    <div class="bg-gray-600 px-4 py-2 rounded-lg">
                      <span class="text-white text-xl font-bold">{{ num1 }} + {{ num2 }} = ?</span>
                    </div>
                    <input 
                      type="number" 
                      [(ngModel)]="captchaAnswer"
                      placeholder="?"
                      class="w-20 px-3 py-2 bg-gray-800 text-white text-center text-xl font-bold rounded-lg border border-gray-600 focus:border-cyan-500 outline-none"
                    />
                  </div>
                  <button 
                    (click)="verifyCaptcha()"
                    [disabled]="!captchaAnswer || isVerifying()"
                    class="w-full py-3 rounded-lg font-bold transition-colors"
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
              <div class="space-y-4">
                <div class="bg-green-500/20 border border-green-500 rounded-lg p-4 text-center">
                  <span class="material-symbols-outlined text-green-400 text-4xl mb-2">check_circle</span>
                  <p class="text-green-400 font-bold text-lg">¡Recompensa enviada!</p>
                  <p class="text-gray-400 text-sm">100% a tu wallet • $10 COP a donaciones</p>
                </div>
                <button 
                  (click)="onClose()"
                  class="w-full py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg transition-colors"
                >
                  Continuar
                </button>
              </div>
            }

            @if (countdown() > 0) {
              <button 
                disabled
                class="w-full py-3 bg-gray-600 text-gray-400 font-bold rounded-lg cursor-not-allowed"
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
  
  // Computed that reacts to currency changes
  protected rewardDisplay = computed(() => {
    const rewardCOP = this.ad().rewardCOP || 1;
    // Show the raw COP value directly without conversion
    return `${rewardCOP.toLocaleString('es-CO')} COP`;
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
    if (this.captchaAnswer === null) return;
    
    this.isVerifying.set(true);
    this.captchaError.set(null);
    
    setTimeout(() => {
      if (this.captchaAnswer === this.num1 + this.num2) {
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
    const rewardCOP = this.ad().rewardCOP || 1;
    return `${rewardCOP.toLocaleString('es-CO')} COP`;
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
