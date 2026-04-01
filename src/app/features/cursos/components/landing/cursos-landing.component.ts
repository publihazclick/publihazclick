import { Component, inject, signal, PLATFORM_ID, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ProfileService } from '../../../../core/services/profile.service';
import { PlatformSettingsService } from '../../../../core/services/platform-settings.service';

@Component({
  selector: 'app-cursos-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cursos-landing.component.html',
})
export class CursosLandingComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly settings = inject(PlatformSettingsService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly profile = this.profileService.profile;
  readonly heroVideoUrl = signal<SafeResourceUrl | null>(null);

  async ngOnInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const url = await this.settings.getSetting('hero_video_url');
    const embed = this.toEmbedUrl(url);
    if (embed) this.heroVideoUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(embed));
  }

  getRegisterLink(): string {
    if (!isPlatformBrowser(this.platformId)) return '/register';
    // Si el usuario está logueado, usar su código de referido
    const profileCode = this.profile()?.referral_code ?? '';
    // Si no, usar el código guardado en localStorage (de quien compartió el link)
    const savedCode = localStorage.getItem('phc_referral_code') ?? '';
    const code = profileCode || savedCode;
    if (code) return `/register?ref=${code}`;
    return '/register';
  }

  private toEmbedUrl(url: string): string | null {
    if (!url) return null;
    const watch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watch) return `https://www.youtube.com/embed/${watch[1]}`;
    const short = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (short) return `https://www.youtube.com/embed/${short[1]}`;
    const embed = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embed) return `https://www.youtube.com/embed/${embed[1]}`;
    return null;
  }
}
