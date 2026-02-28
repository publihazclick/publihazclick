import { Component, inject, OnInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { ProfileService } from '../../../../core/services/profile.service';

@Component({
  selector: 'app-social-profile-redirect',
  standalone: true,
  template: `<div class="flex items-center justify-center py-24"><div class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>`,
})
export class SocialProfileRedirectComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly profileService = inject(ProfileService);
  private readonly platformId = inject(PLATFORM_ID);
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // El layout padre ya carga el perfil; esperamos a que el signal tenga valor
    const tryRedirect = () => {
      const profile = this.profileService.profile();
      if (profile?.id) {
        this.clearInterval();
        this.router.navigate(['/social', profile.username], { replaceUrl: true });
      }
    };

    // Intentar inmediatamente
    tryRedirect();

    // Si aún no está listo, reintentar cada 200ms (máx 3s)
    if (!this.profileService.profile()?.id) {
      let elapsed = 0;
      this.checkInterval = setInterval(() => {
        elapsed += 200;
        tryRedirect();
        if (elapsed >= 3000) {
          this.clearInterval();
          this.router.navigate(['/social/directory'], { replaceUrl: true });
        }
      }, 200);
    }
  }

  ngOnDestroy(): void {
    this.clearInterval();
  }

  private clearInterval(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}
