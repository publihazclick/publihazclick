import { Component, OnInit, OnDestroy, signal, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { SocialService } from '../../../../core/services/social.service';
import { FloatingChatComponent } from '../floating-chat/floating-chat.component';

@Component({
  selector: 'app-social-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FloatingChatComponent],
  templateUrl: './social-layout.component.html',
})
export class SocialLayoutComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly socialService = inject(SocialService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly profile = this.profileService.profile;

  readonly sidebarCollapsed = signal(
    isPlatformBrowser(this.platformId) && window.innerWidth < 1024
  );
  readonly profileMenuOpen = signal(false);

  pendingRequests = signal(0);
  unreadMessages = signal(0);

  private pollInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.profileService.getCurrentProfile().catch(() => {});
    this.loadBadges();
    if (isPlatformBrowser(this.platformId)) {
      this.pollInterval = setInterval(() => this.loadBadges(), 15000);
    }
  }

  ngOnDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private async loadBadges(): Promise<void> {
    try {
      const [pending, unread] = await Promise.all([
        this.socialService.getPendingCount(),
        this.socialService.getUnreadMessagesCount(),
      ]);
      this.pendingRequests.set(pending);
      this.unreadMessages.set(unread);
    } catch {}
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

  logout(): void {
    this.authService.logout().subscribe();
  }

  getInitials(): string {
    const p = this.profile();
    if (!p) return '?';
    const name = p.full_name || p.username || '';
    return name.slice(0, 2).toUpperCase();
  }
}
