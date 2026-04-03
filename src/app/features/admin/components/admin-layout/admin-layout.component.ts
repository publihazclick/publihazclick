import { Component, signal, Inject, PLATFORM_ID, OnInit, OnDestroy, inject, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { AdminDashboardService } from '../../../../core/services/admin-dashboard.service';
import { AdminPackageService } from '../../../../core/services/admin-package.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { AdminReferralModalComponent } from '../admin-referral-modal/admin-referral-modal.component';
import { getSupabaseClient } from '../../../../core/supabase.client';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, AdminReferralModalComponent],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent implements OnInit, OnDestroy {
  isDarkMode = typeof window !== 'undefined'
    ? (localStorage.getItem('theme') ?? 'dark') === 'dark'
    : true;
  serverLoad = 42;
  private readonly dashboardService = inject(AdminDashboardService);
  private readonly packageService = inject(AdminPackageService);
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
  // Conteo de pagos pendientes
  protected readonly pendingPaymentsCount = signal(0);
  // Conteo de usuarios de alto riesgo (fraude)
  protected readonly highRiskFraudCount = signal(0);

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
    if (isPlatformBrowser(this.platformId)) {
      if (this.isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      document.addEventListener('touchstart', this.handleTouchStart, { passive: true });
      document.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    }
    this.loadPendingCount();
    this.loadPendingPaymentsCount();
    this.loadHighRiskFraudCount();
    this.profileService.getCurrentProfile();
  }

  private async loadPendingCount(): Promise<void> {
    try {
      const pending = await this.dashboardService.getPendingItems();
      this.pendingModerationCount.set(pending.length);
    } catch (error) {
      // Failed to load pending count
    }
  }

  private async loadPendingPaymentsCount(): Promise<void> {
    try {
      const count = await this.packageService.getPendingPaymentsCount();
      this.pendingPaymentsCount.set(count);
    } catch {
      // silencioso
    }
  }

  private async loadHighRiskFraudCount(): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      const { count } = await supabase
        .from('fraud_scores')
        .select('id', { count: 'exact', head: true })
        .in('risk_level', ['high', 'critical']);
      this.highRiskFraudCount.set(count ?? 0);
    } catch {
      // silencioso
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

  private touchStartX = 0;

  private readonly handleTouchStart = (e: TouchEvent): void => {
    this.touchStartX = e.touches[0].clientX;
  };

  private readonly handleTouchEnd = (e: TouchEvent): void => {
    if (window.innerWidth >= 1024) return;
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    if (dx > 60 && this.sidebarCollapsed()) this.sidebarCollapsed.set(false);
    if (dx < -60 && !this.sidebarCollapsed()) this.sidebarCollapsed.set(true);
  };

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.removeEventListener('touchstart', this.handleTouchStart);
      document.removeEventListener('touchend', this.handleTouchEnd);
    }
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }

  logout(): void {
    this.authService.logout().subscribe();
  }

  openReferralModal(): void {
    this.referralModal?.open();
  }
}
