import { Component, signal, OnInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProfileService } from '../../../../core/services/profile.service';

@Component({
  selector: 'app-ai-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './ai-layout.component.html',
})
export class AiLayoutComponent implements OnInit, OnDestroy {
  private readonly profileService = inject(ProfileService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly sidebarCollapsed = signal(
    isPlatformBrowser(this.platformId) && window.innerWidth < 1024
  );

  readonly profile = this.profileService.profile;

  async ngOnInit(): Promise<void> {
    let p = this.profileService.profile();
    if (!p) {
      p = await this.profileService.getCurrentProfile();
    }
    const userId = p?.id;
    if (userId && isPlatformBrowser(this.platformId)) {
      this.profileService.startRealtimeProfileWatch(userId);
    }
  }

  ngOnDestroy(): void {
    this.profileService.stopRealtimeProfileWatch();
  }

  toggleSidebarCollapse(): void {
    this.sidebarCollapsed.update((v) => !v);
  }
}
