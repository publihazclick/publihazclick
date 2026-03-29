import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { AiWalletService } from '../../../../core/services/ai-wallet.service';

@Component({
  selector: 'app-youtube-studio',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './youtube-studio.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YoutubeStudioComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly walletService = inject(AiWalletService);

  readonly profile = this.profileService.profile;
  readonly walletBalance = this.walletService.balance;

  // Tabs
  readonly activeTab = signal<'creacion' | 'analiticas' | 'seo' | 'miniaturas' | 'playlists'>('creacion');

  // Tipo de contenido
  readonly contentType = signal<'largo' | 'shorts'>('largo');

  // Monetización toggles
  readonly youtubeAds = signal(true);
  readonly affiliateMarketing = signal(false);
  readonly memberships = signal(false);
  readonly superChat = signal(false);

  // Formulario
  videoTopic = '';
  duration = '5:00 minutos';
  videoFormat = '16:9 (Horizontal) - Recomendado';
  scriptContent = '';

  readonly durations = ['1:00 minuto', '3:00 minutos', '5:00 minutos', '8:00 minutos', '10:00 minutos', '15:00 minutos'];
  readonly formats = ['16:9 (Horizontal) - Recomendado', '9:16 (Vertical)', '1:1 (Cuadrado)'];

  // Estilo visual
  readonly visualStyles = ['Talking Head', 'B-Roll', 'Screencast', 'Animado', 'Documental', 'Vlog'];
  readonly selectedStyle = signal<string | null>(null);

  // Estados
  readonly generatingIdeas = signal(false);
  readonly generatingScript = signal(false);
  readonly generatingVideo = signal(false);

  async ngOnInit(): Promise<void> {
    await this.walletService.loadWallet();
  }

  selectContentType(type: 'largo' | 'shorts'): void {
    this.contentType.set(type);
  }

  toggleAds(): void { this.youtubeAds.update(v => !v); }
  toggleAffiliate(): void { this.affiliateMarketing.update(v => !v); }
  toggleMemberships(): void { this.memberships.update(v => !v); }
  toggleSuperChat(): void { this.superChat.update(v => !v); }

  selectStyle(style: string): void {
    this.selectedStyle.set(style);
  }

  async generateIdeas(): Promise<void> {
    this.generatingIdeas.set(true);
    setTimeout(() => {
      this.videoTopic = this.videoTopic || 'Tutorial de cocina saludable para principiantes';
      this.generatingIdeas.set(false);
    }, 1500);
  }

  async generateScript(): Promise<void> {
    this.generatingScript.set(true);
    setTimeout(() => {
      this.scriptContent = `Hook: "¿Sabías que puedes preparar comidas saludables en menos de 15 minutos?"\n\nIntro: Presentación del tema y lo que aprenderán.\n\nDesarrollo:\n- Ingredientes necesarios\n- Paso 1: Preparación\n- Paso 2: Cocción\n- Paso 3: Emplatado\n\nCierre: Resumen + Call to action (suscribirse, comentar, compartir)`;
      this.generatingScript.set(false);
    }, 2000);
  }

  async generateNewScript(): Promise<void> {
    this.scriptContent = '';
    await this.generateScript();
  }

  async generateVideo(): Promise<void> {
    this.generatingVideo.set(true);
    setTimeout(() => {
      this.generatingVideo.set(false);
    }, 3000);
  }

  getUserName(): string {
    const p = this.profile();
    return p?.full_name?.split(' ')[0] || p?.username || 'Usuario';
  }

  formatBalance(): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP',
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(this.walletBalance());
  }
}
