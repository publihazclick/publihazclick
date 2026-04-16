import { Component, inject, signal, computed, OnInit, OnDestroy, Injector, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminPtcTaskService } from '../../../../core/services/admin-ptc-task.service';
import { AdminBannerService } from '../../../../core/services/admin-banner.service';
import { AdminPackageService } from '../../../../core/services/admin-package.service';
import { StorageService } from '../../../../core/services/storage.service';
import { traducirError } from '../../../../core/services/error-translator';
import { CurrencyService } from '../../../../core/services/currency.service';
import { UserTrackingService } from '../../../../core/services/user-tracking.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { SupabaseSessionService } from '../../../../core/services/supabase-session.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PtcModalComponent, PtcAd, RewardStatus } from '../../../../components/ptc-modal/ptc-modal.component';
import type { PtcAdType, Package } from '../../../../core/models/admin.model';

interface PtcAdCard {
  id: string;
  companyName: string;
  description: string;
  advertiserType: 'company' | 'person';
  imageUrl: string;
  videoUrl: string;
  destinationUrl: string;
  adType: PtcAdType;
  rewardCOP: number;
  dailyLimit: number;
  totalClicks: number;
  status: string;
}

@Component({
  selector: 'app-user-ads',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PtcModalComponent],
  templateUrl: './ads.component.html',
})
export class UserAdsComponent implements OnInit, OnDestroy {
  private readonly ptcService = inject(AdminPtcTaskService);
  private readonly bannerService = inject(AdminBannerService);
  private readonly packageService = inject(AdminPackageService);
  private readonly storageService = inject(StorageService);
  protected readonly currencyService = inject(CurrencyService);
  protected readonly userTracking = inject(UserTrackingService);
  private readonly profileService = inject(ProfileService);
  private readonly sessionService = inject(SupabaseSessionService);
  private readonly authService = inject(AuthService);
  private readonly injector = inject(Injector);

  readonly profile = this.profileService.profile;
  readonly isAdvertiser = signal(false);

  readonly ads = signal<PtcAdCard[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly successToast = signal<string | null>(null);

  /** Límites de anuncios del usuario (desde BD) */
  readonly adLimits = signal<Record<string, any> | null>(null);

  // Ad view modal
  readonly isModalOpen = signal(false);
  readonly selectedAd = signal<PtcAd | null>(null);
  readonly rewardStatus = signal<RewardStatus>('idle');
  readonly rewardDisplayAmount = signal('');
  readonly rewardErrorMessage = signal<string | null>(null);
  readonly rewardErrorRetryable = signal(true);
  private pendingRewardTaskId: string | null = null;
  private pendingRewardDuration = 0;
  private destroyed = false;
  private adsInitialized = false;

  // Create PTC modal
  readonly showPtcModal = signal(false);
  readonly savingPtc = signal(false);
  readonly uploadingPtc = signal(false);
  readonly ptcModalError = signal<string | null>(null);
  ptcFormData = { title: '', description: '', url: '', youtube_url: '', image_url: '' };

  // Create Banner modal
  readonly showBannerModal = signal(false);
  readonly savingBanner = signal(false);
  readonly uploadingBanner = signal(false);
  readonly bannerModalError = signal<string | null>(null);
  bannerFormData = { name: '', description: '', url: '', image_url: '' };

  private readonly adTypeRewards: Record<string, number> = {
    mega: 2000,
    mega_2000: 2000,
    mega_5000: 5000,
    mega_10000: 10000,
    mega_20000: 20000,
    mega_50000: 50000,
    mega_100000: 100000,
    standard_400: 400,
    mini: 83.33,
  };

  // Mega grants V2 disponibles
  readonly megaV2Grants = signal<{ ad_type: string; available: number; reward_per_ad: number; earliest_expiry: string }[]>([]);

  // ── Renovación de paquete expirado ────────────────────────────────────────
  readonly availablePackages = signal<Package[]>([]);
  readonly renewLoading = signal(false);
  readonly renewSuccess = signal(false);
  readonly renewError = signal<string | null>(null);

  /** true cuando el usuario autenticado NO tiene paquete activo (expiró o nunca tuvo) */
  readonly packageExpired = computed(() => {
    const p = this.profile();
    if (!p) return false;
    return !p.has_active_package;
  });

  /** Gate: paquete activo pero aún no ha creado anuncio PTC + banner del periodo */
  readonly adCreationGate = computed(() => {
    const l = this.adLimits();
    if (!l) return null;
    if (!l['gate_active']) return null;
    return {
      hasPtcAd: !!l['has_ptc_ad'],
      hasBannerAd: !!l['has_banner_ad'],
    };
  });

  /** Saldo disponible del usuario */
  readonly userBalance = computed(() => this.profile()?.real_balance ?? 0);

  /** Precio COP del paquete más barato */
  getPackagePriceCOP(pkg: Package): number {
    return (pkg as any).price_cop ?? Math.round(pkg.price * 4200);
  }

  canAffordPackage(pkg: Package): boolean {
    return this.userBalance() >= this.getPackagePriceCOP(pkg);
  }

  formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP',
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(amount);
  }

  async renewWithBalance(pkg: Package): Promise<void> {
    this.renewLoading.set(true);
    this.renewError.set(null);
    this.renewSuccess.set(false);

    const result = await this.packageService.renewWithBalance(pkg.id);

    this.renewLoading.set(false);
    if (result.success) {
      this.renewSuccess.set(true);
      // Recargar perfil para reflejar nuevo estado
      const profile = await this.profileService.getCurrentProfile();
      // Forzar re-evaluación: el perfil ahora tiene has_active_package = true
      // y role = 'advertiser', lo cual quitará el overlay y cargará los anuncios
      this.adsInitialized = false;
    } else {
      this.renewError.set(result.error ?? 'Error al renovar');
      setTimeout(() => this.renewError.set(null), 5000);
    }
  }

  ngOnInit(): void {
    // El perfil puede no estar cargado aún si el usuario llegó directo a esta URL.
    // Usamos un efecto reactivo para inicializar cuando el signal de perfil esté disponible.
    effect(() => {
      const p = this.profile();
      const role = p?.role;
      if (role == null || this.adsInitialized) return;
      this.adsInitialized = true;
      const isAdv = role === 'advertiser' || role === 'admin' || role === 'dev';
      this.isAdvertiser.set(isAdv);
      if (isAdv) {
        this.loadAds();
      } else {
        this.loading.set(false);
        // Cargar paquetes disponibles para mostrar opciones de renovación
        this.loadPackagesForRenewal();
      }
    }, { injector: this.injector });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  async loadAds(): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const { getSupabaseClient } = await import('../../../../core/supabase.client');
      const supabase = getSupabaseClient();

      // 1. Obtener límites del usuario desde la BD
      const userId = this.profile()?.id;
      if (userId) {
        const { data: limits } = await supabase.rpc('get_user_ad_limits', { p_user_id: userId });
        this.adLimits.set(limits);
      }

      // 2. Cargar todos los anuncios activos
      const result = await this.ptcService.getPtcTasks(
        { status: 'active', location: 'app' },
        { page: 1, pageSize: 200 }
      );

      const allAds = (result.data || []).map(task => ({
        id: task.id,
        companyName: task.title,
        description: task.description || '',
        advertiserType: 'company' as const,
        imageUrl: task.image_url || '',
        videoUrl: task.youtube_url || '',
        destinationUrl: task.url || '',
        adType: task.ad_type || 'mini',
        rewardCOP: this.adTypeRewards[task.ad_type || 'mini'] ?? task.reward ?? 0,
        dailyLimit: task.daily_limit || 0,
        totalClicks: task.total_clicks || 0,
        status: task.status,
      }));

      // 3. Cargar clicks de hoy y mega del mes para excluir ads ya vistos
      const todayClicked = new Set<string>();
      const megaMonthClicked = new Set<string>();
      if (userId) {
        const [{ data: todayData }, { data: megaData }] = await Promise.all([
          supabase.rpc('get_my_today_clicks'),
          supabase.rpc('get_my_month_mega_clicks'),
        ]);
        if (todayData && Array.isArray(todayData)) {
          for (const r of todayData) todayClicked.add(r.task_id);
        }
        if (megaData && Array.isArray(megaData)) {
          for (const r of megaData) megaMonthClicked.add(r.task_id);
        }
      }

      // 4. Filtrar: solo mostrar la cantidad exacta que le corresponde al usuario
      const limits = this.adLimits();
      if (limits && limits['has_package']) {
        const filtered: PtcAdCard[] = [];
        const byType: Record<string, PtcAdCard[]> = {};
        for (const ad of allAds) {
          if (!byType[ad.adType]) byType[ad.adType] = [];
          byType[ad.adType].push(ad);
        }

        // Mezclar aleatoriamente cada tipo para variedad
        for (const type of Object.keys(byType)) {
          byType[type].sort(() => Math.random() - 0.5);
        }

        // standard_400: remaining diario, excluir ya clickeados hoy
        const std400Remaining = limits['standard_400']?.remaining ?? 0;
        filtered.push(...(byType['standard_400'] || []).filter(a => !todayClicked.has(a.id)).slice(0, std400Remaining));

        // mini: remaining diario, excluir ya clickeados hoy
        const miniRemaining = limits['mini']?.remaining ?? 0;
        filtered.push(...(byType['mini'] || []).filter(a => !todayClicked.has(a.id)).slice(0, miniRemaining));

        // mega V1: remaining mensual, excluir ya clickeados este mes
        const megaRemaining = limits['mega']?.remaining ?? 0;
        filtered.push(...(byType['mega'] || []).filter(a => !megaMonthClicked.has(a.id)).slice(0, megaRemaining));

        // mega V2: cargar grants disponibles y agregar como ads clickeables
        if (userId) {
          const { data: grants } = await supabase.rpc('get_available_mega_grants', { p_user_id: userId });
          if (grants && Array.isArray(grants)) {
            this.megaV2Grants.set(grants);
            for (const grant of grants) {
              // Buscar un ptc_task del tipo correspondiente para usarlo como contenido
              const megaTask = allAds.find(a => a.adType === grant.ad_type);
              if (megaTask) {
                for (let i = 0; i < grant.available; i++) {
                  filtered.push({
                    ...megaTask,
                    id: megaTask.id,
                    rewardCOP: grant.reward_per_ad,
                    adType: grant.ad_type as PtcAdType,
                  });
                }
              }
            }
          }
        }

        this.ads.set(filtered);
      } else {
        // Sin paquete activo: no mostrar nada
        this.ads.set([]);
      }

      // 4. Sincronizar anuncios vistos hoy
      await this.userTracking.loadTodayClicksFromDb(supabase);
    } catch {
      this.error.set('Error al cargar los anuncios');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPackagesForRenewal(): Promise<void> {
    try {
      const packages = await this.packageService.getPackages();
      this.availablePackages.set(packages);
    } catch { /* silencioso */ }
  }

  getAdsByType(type: PtcAdType): PtcAdCard[] {
    return this.ads().filter(ad => ad.adType === type);
  }

  getRewardDisplay(rewardCOP: number): string {
    return this.currencyService.formatFromCOP(rewardCOP, 2);
  }

  isAdViewed(adId: string): boolean {
    return this.userTracking.hasViewedAd(adId);
  }

  truncate(text: string, max: number): string {
    if (!text) return '';
    return text.length > max ? text.substring(0, max) + '...' : text;
  }

  openAdModal(ad: PtcAdCard): void {
    if (this.userTracking.hasViewedAd(ad.id)) return;
    this.selectedAd.set({
      id: ad.id,
      title: ad.companyName,
      description: ad.description,
      advertiserName: ad.companyName,
      advertiserType: ad.advertiserType,
      imageUrl: ad.imageUrl,
      videoUrl: ad.videoUrl,
      destinationUrl: ad.destinationUrl,
      adType: ad.adType,
      rewardCOP: ad.rewardCOP,
      duration: ad.adType === 'mini' ? 30 : 60,
    });
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.selectedAd.set(null);
    this.rewardStatus.set('idle');
    this.pendingRewardTaskId = null;
  }

  onRewardClaimed(event: { walletAmount: number; donationAmount: number; taskId: string; durationMs: number }): void {
    this.pendingRewardTaskId = event.taskId;
    this.pendingRewardDuration = event.durationMs;
    this.rewardDisplayAmount.set(this.getRewardDisplay(event.walletAmount));
    this.isModalOpen.set(false);
    this.rewardStatus.set('crediting');
    this.creditRewardToDb(event.taskId, event.durationMs);
  }

  closeRewardOverlay(): void {
    this.rewardStatus.set('idle');
    this.isModalOpen.set(false);
    this.selectedAd.set(null);
    this.pendingRewardTaskId = null;
  }

  onRetryReward(): void {
    if (this.pendingRewardTaskId) {
      this.rewardStatus.set('crediting');
      this.creditRewardToDb(this.pendingRewardTaskId, this.pendingRewardDuration);
    }
  }

  private async creditRewardToDb(taskId: string, durationMs?: number): Promise<void> {
    try {
      // Obtener user ID con fallback robusto (el signal puede no estar listo tras login)
      let userId = this.authService.getCurrentUser()?.id;
      if (!userId) {
        const { getSupabaseClient } = await import('../../../../core/supabase.client');
        const { data: { user } } = await getSupabaseClient().auth.getUser();
        userId = user?.id;
      }
      if (!userId) {
        this.error.set('No se pudo acreditar: sesión no encontrada. Inicia sesión de nuevo.');
        return;
      }

      // Metadata anti-fraude
      const ip = this.userTracking.getIp() || null;
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      const fingerprint = await this.userTracking.getSessionFingerprint() || null;

      // Determinar si es un mega V2 para pasar ad_type_override
      const clickedAd = this.selectedAd();
      const megaV2Types = ['mega_2000','mega_5000','mega_10000','mega_20000','mega_50000','mega_100000'];
      const adTypeOverride = clickedAd && megaV2Types.includes(clickedAd.adType) ? clickedAd.adType : null;

      const data = await this.sessionService.callRpc<{ success: boolean; reward?: number; donation?: number; error?: string }>(
        'record_ptc_click',
        {
          p_user_id: userId,
          p_task_id: taskId,
          p_ip_address: ip,
          p_user_agent: ua,
          p_session_fingerprint: fingerprint,
          p_click_duration_ms: durationMs ?? null,
          p_ad_type_override: adTypeOverride,
        }
      );

      if (data?.success) {
        this.userTracking.recordAdView(taskId);
        const reward = data.reward ?? this.adTypeRewards[this.ads().find(a => a.id === taskId)?.adType || 'mini'] ?? 0;
        const donation = data.donation ?? 0;
        this.profileService.patchBalance(reward, donation);
        this.profileService.getCurrentProfile().catch(() => {});
        if (!this.destroyed) {
          this.rewardStatus.set('credited');
          // Recargar anuncios para actualizar los que le quedan
          this.loadAds();
        }
      } else if (data && !data.success) {
        console.warn('RPC record_ptc_click rejected:', data.error);
        if (!this.destroyed) {
          const errorMsg = data.error || 'Error desconocido';
          const isBusinessError = this.isNonRetryableError(errorMsg);
          this.rewardErrorMessage.set(errorMsg);
          this.rewardErrorRetryable.set(!isBusinessError);
          this.rewardStatus.set('failed');
        }
      }
    } catch (err: any) {
      console.error('creditRewardToDb error:', err);
      if (!this.destroyed) {
        this.rewardErrorMessage.set('Error de conexión. Verifica tu internet e intenta de nuevo.');
        this.rewardErrorRetryable.set(true);
        this.rewardStatus.set('failed');
      }
    }
  }

  private isNonRetryableError(errorMsg: string): boolean {
    const nonRetryable = [
      'Ya viste este anuncio hoy',
      'Límite diario',
      'no está asignado',
      'Necesitas afiliados activos',
      'Anuncio no disponible',
    ];
    return nonRetryable.some(keyword => errorMsg.includes(keyword));
  }

  // ── Crear Anuncio PTC ────────────────────────────────────────────────────

  openPtcModal(): void {
    this.ptcFormData = { title: '', description: '', url: '', youtube_url: '', image_url: '' };
    this.ptcModalError.set(null);
    this.showPtcModal.set(true);
  }

  closePtcModal(): void {
    this.showPtcModal.set(false);
    this.ptcModalError.set(null);
  }

  async onPtcImageSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingPtc.set(true);
    try {
      const result = await this.storageService.uploadImage('ptc-ads', file, 'user-ads');
      if (result.success && result.url) {
        this.ptcFormData = { ...this.ptcFormData, image_url: result.url };
      }
    } finally {
      this.uploadingPtc.set(false);
    }
  }

  async savePtcAd(): Promise<void> {
    if (!this.ptcFormData.title || !this.ptcFormData.url) {
      this.ptcModalError.set('El nombre y la URL de destino son obligatorios.');
      return;
    }
    if (!this.ptcFormData.image_url) {
      this.ptcModalError.set('Sube una imagen para el anuncio antes de guardarlo.');
      return;
    }
    const userId = this.profile()?.id;
    if (!userId) {
      this.ptcModalError.set('No has iniciado sesión.');
      return;
    }

    this.savingPtc.set(true);
    this.ptcModalError.set(null);
    try {
      const result = await this.ptcService.createPtcTask({
        title: this.ptcFormData.title,
        description: this.ptcFormData.description,
        url: this.ptcFormData.url,
        youtube_url: this.ptcFormData.youtube_url || null,
        image_url: this.ptcFormData.image_url,
        reward: 400,
        duration: 60,
        daily_limit: 9,
        ad_type: 'standard_400',
        location: 'app',
        advertiser_id: userId,
        is_demo_only: false,
        total_clicks: 0,
      } as any);
      if (!result) throw new Error('No se pudo crear el anuncio.');
      this.closePtcModal();
      this.showToast('Anuncio creado correctamente. Ya puedes empezar a recibir clics.');
      await this.loadAds();
    } catch (err: unknown) {
      console.error('[savePtcAd] error', err);
      this.ptcModalError.set(traducirError(err));
    } finally {
      this.savingPtc.set(false);
    }
  }

  // ── Crear Banner ─────────────────────────────────────────────────────────

  openBannerModal(): void {
    this.bannerFormData = { name: '', description: '', url: '', image_url: '' };
    this.bannerModalError.set(null);
    this.showBannerModal.set(true);
  }

  closeBannerModal(): void {
    this.showBannerModal.set(false);
    this.bannerModalError.set(null);
  }

  async onBannerImageSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingBanner.set(true);
    try {
      const result = await this.storageService.uploadImage('banners', file, 'user-banners');
      if (result.success && result.url) {
        this.bannerFormData = { ...this.bannerFormData, image_url: result.url };
      }
    } finally {
      this.uploadingBanner.set(false);
    }
  }

  async saveBannerAd(): Promise<void> {
    if (!this.bannerFormData.name || !this.bannerFormData.url) {
      this.bannerModalError.set('El nombre y la URL de destino son obligatorios.');
      return;
    }
    if (!this.bannerFormData.image_url) {
      this.bannerModalError.set('Sube una imagen para el banner antes de guardarlo.');
      return;
    }
    const userId = this.profile()?.id;
    if (!userId) {
      this.bannerModalError.set('No has iniciado sesión.');
      return;
    }

    this.savingBanner.set(true);
    this.bannerModalError.set(null);
    try {
      const result = await this.bannerService.createBannerAd({
        name: this.bannerFormData.name,
        description: this.bannerFormData.description,
        url: this.bannerFormData.url,
        image_url: this.bannerFormData.image_url,
        position: 'middle',
        reward: 0,
        location: 'app',
        advertiser_id: userId,
      } as any);
      if (!result) throw new Error('No se pudo crear el banner.');
      this.closeBannerModal();
      this.showToast('Banner creado correctamente.');
      await this.loadAds();
    } catch (err: unknown) {
      console.error('[saveBannerAd] error', err);
      this.bannerModalError.set(traducirError(err));
    } finally {
      this.savingBanner.set(false);
    }
  }

  private showToast(msg: string): void {
    this.successToast.set(msg);
    setTimeout(() => this.successToast.set(null), 5000);
  }
}
