import { Component, signal, Inject, PLATFORM_ID, OnInit, inject, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { AdminDashboardService } from '../../../../core/services/admin-dashboard.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { AdminReferralModalComponent } from '../admin-referral-modal/admin-referral-modal.component';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, AdminReferralModalComponent],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent implements OnInit {
  isDarkMode = true;
  serverLoad = 42;
  private readonly dashboardService = inject(AdminDashboardService);
  readonly profileService = inject(ProfileService);
  readonly profile = this.profileService.profile;

  @ViewChild('referralModal') referralModal!: AdminReferralModalComponent;
  
  // Estado del sidebar (mobile)
  protected readonly sidebarOpen = signal(false);
  // Estado colapsado del sidebar (tablet/desktop)
  protected readonly sidebarCollapsed = signal(false);
  // Estado de si es navegador (para SSR)
  protected readonly isBrowser = signal(false);
  // Conteo de moderación
  protected readonly pendingModerationCount = signal(0);

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    @Inject(PLATFORM_ID) private readonly platformId: Object
  ) {
    this.isBrowser.set(isPlatformBrowser(this.platformId));
    // Sidebar siempre colapsado en móvil/tablet
    if (this.isBrowser() && window.innerWidth < 1024) {
      this.sidebarCollapsed.set(true);
    }
  }

  ngOnInit(): void {
    this.loadPendingCount();
    this.profileService.getCurrentProfile();
  }

  private async loadPendingCount(): Promise<void> {
    try {
      const pending = await this.dashboardService.getPendingItems();
      this.pendingModerationCount.set(pending.length);
    } catch (error) {
      console.error('Error loading pending count:', error);
    }
  }

  // Detectar si es dispositivo móvil
  protected isMobile(): boolean {
    if (!this.isBrowser()) {
      return false; // En SSR, asumir no móvil
    }
    return window.innerWidth < 768;
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  toggleSidebarCollapse(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    document.documentElement.classList.toggle('dark');
  }

  logout(): void {
    this.authService.logout().subscribe();
  }

  openReferralModal(): void {
    this.referralModal?.open();
  }
}
