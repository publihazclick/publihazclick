import { Component, ChangeDetectionStrategy, OnInit, signal, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ProfileService } from '../../../../core/services/profile.service';

@Component({
  selector: 'app-ai-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './ai-layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiLayoutComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly profile = this.profileService.profile;
  readonly sidebarCollapsed = signal(
    isPlatformBrowser(this.platformId) && window.innerWidth < 1024
  );
  readonly profileMenuOpen = signal(false);

  ngOnInit(): void {
    this.profileService.getCurrentProfile().catch(() => {});
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen.update(v => !v);
  }

  closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }

  goBackToDashboard(): void {
    const role = this.profile()?.role;
    if (role === 'admin' || role === 'dev') {
      this.router.navigate(['/admin']);
    } else {
      this.router.navigate(['/advertiser']);
    }
  }

  getInitials(): string {
    const p = this.profile();
    if (!p) return '?';
    const name = p.full_name || p.username || '';
    return name
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  logout(): void {
    this.authService.logout().subscribe();
  }
}
