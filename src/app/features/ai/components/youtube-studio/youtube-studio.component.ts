import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
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
  readonly duration = signal('1:00 minuto');
  videoFormat = '16:9 (Horizontal) - Recomendado';
  scriptContent = '';

  readonly durationsLargo = [
    '1:00 minuto', '1:30 minutos', '2:00 minutos', '2:30 minutos',
    '3:00 minutos', '3:30 minutos', '4:00 minutos', '4:30 minutos',
    '5:00 minutos', '5:30 minutos', '6:00 minutos', '6:30 minutos',
    '7:00 minutos', '7:30 minutos', '8:00 minutos', '8:30 minutos',
    '9:00 minutos', '9:30 minutos', '10:00 minutos', '10:30 minutos',
    '11:00 minutos', '11:30 minutos', '12:00 minutos', '12:30 minutos',
    '13:00 minutos', '13:30 minutos', '14:00 minutos', '14:30 minutos',
    '15:00 minutos',
  ];
  readonly durationsShorts = [
    '15 segundos', '20 segundos', '30 segundos', '45 segundos', '60 segundos',
  ];

  readonly durations = computed(() =>
    this.contentType() === 'largo' ? this.durationsLargo : this.durationsShorts
  );
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
    this.duration.set(type === 'largo' ? '1:00 minuto' : '15 segundos');
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
