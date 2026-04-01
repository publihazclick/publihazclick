import { Component, inject, PLATFORM_ID, ChangeDetectionStrategy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ProfileService } from '../../../../core/services/profile.service';

@Component({
  selector: 'app-cursos-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cursos-landing.component.html',
})
export class CursosLandingComponent {
  private readonly profileService = inject(ProfileService);
  private readonly platformId = inject(PLATFORM_ID);
  readonly profile = this.profileService.profile;

  getReferralLink(): string {
    if (!isPlatformBrowser(this.platformId)) return '/register';
    const code = this.profile()?.referral_code ?? '';
    if (!code) return '/register';
    return `${window.location.origin}/ref/${code}`;
  }
}
