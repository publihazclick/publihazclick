import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProfileService } from '../../../../core/services/profile.service';
import { AdminPtcTaskService } from '../../../../core/services/admin-ptc-task.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { UserTrackingService } from '../../../../core/services/user-tracking.service';
import { SupabaseSessionService } from '../../../../core/services/supabase-session.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PtcModalComponent, PtcAd, RewardStatus } from '../../../../components/ptc-modal/ptc-modal.component';
import type { PtcAdType } from '../../../../core/models/admin.model';
import { getSupabaseClient } from '../../../../core/supabase.client';

const DAILY_SLOTS = {
  standard_400: 5,
  mini: 4,
  mega_per_affiliate: 5,
  max_affiliates: 40,
};

/** Slots de mini_referral por afiliado activo según nivel (debe coincidir con get_mini_referral_slots_per_affiliate en DB) */
function miniReferralSlotsPerAffiliate(affiliates: number): number {
  if (affiliates >= 20) return 5;  // ESMERALDA+
  if (affiliates >= 10) return 4;  // RUBY
  if (affiliates >= 6)  return 3;  // ZAFIRO
  if (affiliates >= 3)  return 2;  // PERLA
  if (affiliates >= 1)  return 1;  // JADE
  return 0;
}

interface TaskSlot {
  id: string | null;
  adType: PtcAdType;
  title: string;
  description: string;
  imageUrl: string;
  videoUrl: string;
  destinationUrl: string;
  rewardCOP: number;
  viewed: boolean;
}

@Component({
  selector: 'app-advertiser-tasks',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, PtcModalComponent],
  templateUrl: './advertiser-tasks.component.html',
})
export class AdvertiserTasksComponent implements OnInit, OnDestroy {
  private readonly profileService = inject(ProfileService);
  private readonly ptcService = inject(AdminPtcTaskService);
  private readonly currencyService = inject(CurrencyService);
  private readonly userTracking = inject(UserTrackingService);
  private readonly sessionService = inject(SupabaseSessionService);
  private readonly authService = inject(AuthService);
  private readonly supabase = getSupabaseClient();

  readonly profile = this.profileService.profile;
  readonly loading = signal(true);
  readonly userHasAd = signal(false);
  readonly userHasBanner = signal(false);
  readonly requirementsMet = computed(() => this.userHasAd() && this.userHasBanner());
  readonly affiliatesWithPackage = signal(0);
  readonly standard400Slots = signal<TaskSlot[]>([]);
  readonly miniSlots = signal<TaskSlot[]>([]);
  readonly megaSlots = signal<TaskSlot[]>([]);
  readonly miniReferralSlots = signal<TaskSlot[]>([]);

  readonly megaSlotsAvailable = computed(() =>
    Math.min(this.affiliatesWithPackage(), DAILY_SLOTS.max_affiliates) * DAILY_SLOTS.mega_per_affiliate
  );
  readonly miniReferralSlotsAvailable = computed(() =>
    this.affiliatesWithPackage() * miniReferralSlotsPerAffiliate(this.affiliatesWithPackage())
  );
  readonly maxDailyOwn = computed(() =>
    DAILY_SLOTS.standard_400 * 400 + DAILY_SLOTS.mini * 83.33
  );
  readonly maxDailyMega = computed(() => this.megaSlotsAvailable() * 2000);
  readonly maxDailyMiniReferral = computed(() => this.miniReferralSlotsAvailable() * 100);

  // Contadores de completados por categoría
  readonly standard400DoneCount = computed(() => this.standard400Slots().filter(s => s.viewed && s.id).length);
  readonly miniDoneCount = computed(() => this.miniSlots().filter(s => s.viewed && s.id).length);
  readonly totalDailyDoneCount = computed(() => this.standard400DoneCount() + this.miniDoneCount());
  readonly totalDailySlots = computed(() => this.standard400Slots().length + this.miniSlots().length);
  readonly megaDoneCount = computed(() => this.megaSlots().filter(s => s.viewed && s.id).length);
  readonly miniReferralDoneCount = computed(() => this.miniReferralSlots().filter(s => s.viewed && s.id).length);

  readonly isModalOpen = signal(false);
  readonly selectedAd = signal<PtcAd | null>(null);
  readonly rewardStatus = signal<RewardStatus>('idle');
  readonly rewardDisplayAmount = signal('');
  readonly rewardErrorMessage = signal<string | null>(null);
  readonly rewardErrorRetryable = signal(true);
  private pendingRewardAd: PtcAd | null = null;
  private pendingRewardDuration = 0;
  private destroyed = false;
  // Clicks de hoy cargados desde la BD (fuente de verdad, independiente de caché/navegador)
  private dbDoneToday = new Set<string>();

  private readonly adTypeRewards: Record<string, number> = {
    mega: 2000, mega_2000: 2000, mega_5000: 5000, mega_10000: 10000,
    mega_20000: 20000, mega_50000: 50000, mega_100000: 100000,
    standard_400: 400, mini: 83.33, mini_referral: 100,
  };

  // Mega grants V2
  readonly megaV2Slots = signal<TaskSlot[]>([]);

  // ── Tracking ─────────────────────────────────────────────────────────────
  // Clave diaria en fecha Colombia (UTC-5) → se resetea sola cada medianoche Colombia
  private get todayKeyColombia(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }
  private get dailyKey(): string {
    return `ptc_daily_${this.todayKeyColombia}`;
  }
  // Mega también es diario (el RPC hace dedup por día Colombia)
  private get megaKey(): string {
    return `ptc_mega_${this.todayKeyColombia}`;
  }

  private getDailyDone(): Set<string> {
    if (typeof window === 'undefined') return new Set();
    try {
      const v = localStorage.getItem(this.dailyKey);
      return v ? new Set(JSON.parse(v)) : new Set();
    } catch { return new Set(); }
  }

  private getMegaDone(): Set<string> {
    if (typeof window === 'undefined') return new Set();
    try {
      const v = localStorage.getItem(this.megaKey);
      return v ? new Set(JSON.parse(v)) : new Set();
    } catch { return new Set(); }
  }

  private markDailyDone(id: string): void {
    const done = this.getDailyDone();
    done.add(id);
    localStorage.setItem(this.dailyKey, JSON.stringify([...done]));
  }

  private markMegaDone(id: string): void {
    const done = this.getMegaDone();
    done.add(id);
    localStorage.setItem(this.megaKey, JSON.stringify([...done]));
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  async ngOnInit(): Promise<void> {
    await this.checkRequirements();
    if (this.requirementsMet()) {
      await this.loadAffiliatesCount();
      // Cargar clicks de hoy desde la BD antes de construir slots.
      // Así el estado "visto" es correcto en cualquier navegador o dispositivo.
      await this.loadDbDoneToday();
      await Promise.all([this.loadTasks(), this.loadMiniReferralSlots(), this.loadMegaV2Grants()]);
    }
    this.loading.set(false);
  }

  // IDs de mega clicks hechos este mes (para marcar como viewed)
  private dbMegaDoneMonth = new Set<string>();

  private async loadDbDoneToday(): Promise<void> {
    try {
      const [{ data }, { data: megaMonth }] = await Promise.all([
        this.supabase.rpc('get_my_today_clicks'),
        this.supabase.rpc('get_my_month_mega_clicks'),
      ]);
      if (megaMonth && Array.isArray(megaMonth)) {
        this.dbMegaDoneMonth = new Set(megaMonth.map((r: any) => r.task_id));
      }
      if (data && Array.isArray(data)) {
        this.dbDoneToday = new Set(data.map((r: { task_id: string }) => r.task_id));
      }
    } catch {
      // Fallback: usar solo localStorage si la consulta falla
    }
  }

  private async checkRequirements(): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const [{ count: adCount }, { count: bannerCount }] = await Promise.all([
      this.supabase.from('ptc_tasks').select('id', { count: 'exact', head: true })
        .eq('advertiser_id', user.id).eq('status', 'active')
        .or(`activated_at.is.null,activated_at.gte.${thirtyDaysAgo}`),
      this.supabase.from('banner_ads').select('id', { count: 'exact', head: true })
        .eq('advertiser_id', user.id).eq('status', 'active')
        .or(`end_date.is.null,end_date.gte.${now}`),
    ]);
    this.userHasAd.set((adCount ?? 0) > 0);
    this.userHasBanner.set((bannerCount ?? 0) > 0);
  }

  private async loadAffiliatesCount(): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;
    const { count } = await this.supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by', user.id)
      .eq('has_active_package', true);
    this.affiliatesWithPackage.set(count ?? 0);
  }

  private async loadTasks(): Promise<void> {
    try {
      // 1. Obtener límites reales desde la BD (fuente de verdad)
      const userId = this.profile()?.id;
      let limits: any = null;
      if (userId) {
        const { data } = await this.supabase.rpc('get_user_ad_limits', { p_user_id: userId });
        limits = data;
      }

      // 2. Cargar anuncios activos
      const result = await this.ptcService.getPtcTasks(
        { status: 'active', location: 'app' },
        { page: 1, pageSize: 100 }
      );
      const tasks = result.data ?? [];

      // 3. Sets de tasks ya completados
      const dailyDone = new Set([...this.dbDoneToday, ...this.getDailyDone()]);
      const megaDone = new Set([...this.dbMegaDoneMonth, ...this.getMegaDone()]);

      const toSlot = (task: any, isDailyType: boolean): TaskSlot => ({
        id: task.id,
        adType: task.ad_type,
        title: task.title,
        description: task.description || '',
        imageUrl: task.image_url || '',
        videoUrl: task.youtube_url || '',
        destinationUrl: task.url || '',
        rewardCOP: this.adTypeRewards[task.ad_type] ?? task.reward ?? 0,
        viewed: isDailyType ? dailyDone.has(task.id) : megaDone.has(task.id),
      });

      // 4. Usar remaining de la BD en vez de constantes locales
      const std400Remaining = limits?.standard_400?.remaining ?? DAILY_SLOTS.standard_400;
      const miniRemaining = limits?.mini?.remaining ?? DAILY_SLOTS.mini;
      const megaRemaining = limits?.mega?.remaining ?? 0;

      // 5. Filtrar tasks: excluir los ya clickeados hoy (diarios) o este mes (mega)
      const s400 = tasks.filter(t => t.ad_type === 'standard_400' && !dailyDone.has(t.id));
      const mini = tasks.filter(t => t.ad_type === 'mini' && !dailyDone.has(t.id));
      const mega = tasks.filter(t => t.ad_type === 'mega' && !megaDone.has(t.id));

      // 6. Mostrar SOLO la cantidad que realmente le queda
      this.standard400Slots.set(s400.slice(0, std400Remaining).map(t => toSlot(t, true)));
      this.miniSlots.set(mini.slice(0, miniRemaining).map(t => toSlot(t, true)));
      this.megaSlots.set(mega.slice(0, megaRemaining).map(t => toSlot(t, false)));

    } catch {
      this.standard400Slots.set([]);
      this.miniSlots.set([]);
      this.megaSlots.set([]);
    }
  }

  private emptySlot(adType: PtcAdType, reward: number): TaskSlot {
    return {
      id: null, adType, title: 'Próximamente',
      description: 'El administrador cargará este anuncio pronto.',
      imageUrl: '', videoUrl: '', destinationUrl: '', rewardCOP: reward, viewed: false,
    };
  }

  private async loadMiniReferralSlots(): Promise<void> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) return;

      // Asignar slots si no existen aún hoy (idempotente)
      await this.sessionService.callRpc('assign_mini_referral_tasks', { p_user_id: user.id });

      // Leer asignaciones del día
      const { data } = await this.supabase.rpc('get_mini_referral_tasks_today', { p_user_id: user.id });
      const rows: any[] = data ?? [];
      const dailyDone = new Set([...this.dbDoneToday, ...this.getDailyDone()]);
      const total = this.miniReferralSlotsAvailable();

      // Solo mostrar los que NO están completados — no placeholders vacíos
      const filled: TaskSlot[] = rows
        .filter(r => !r.is_completed && !dailyDone.has(r.task_id))
        .map(r => ({
          id: r.task_id,
          adType: 'mini_referral' as const,
          title: r.title,
          description: r.description || '',
          imageUrl: r.image_url || '',
          videoUrl: r.youtube_url || '',
          destinationUrl: r.url || '',
          rewardCOP: 100,
          viewed: false,
        }));

      this.miniReferralSlots.set(filled);
    } catch {
      this.miniReferralSlots.set(
        Array.from({ length: this.miniReferralSlotsAvailable() }, () => this.emptySlot('mini_referral', 100))
      );
    }
  }

  private async loadMegaV2Grants(): Promise<void> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) return;

      const { data: grants } = await this.supabase.rpc('get_available_mega_grants', { p_user_id: user.id });
      if (!grants || !Array.isArray(grants) || grants.length === 0) {
        this.megaV2Slots.set([]);
        return;
      }

      // Cargar ptc_tasks de los tipos mega V2 para usar como contenido
      const megaTypes = grants.map((g: any) => g.ad_type);
      const { data: megaTasks } = await this.supabase
        .from('ptc_tasks')
        .select('*')
        .in('ad_type', megaTypes)
        .eq('status', 'active');

      const tasksByType: Record<string, any> = {};
      for (const t of megaTasks ?? []) {
        tasksByType[t.ad_type] = t;
      }

      const slots: TaskSlot[] = [];
      for (const grant of grants) {
        const task = tasksByType[grant.ad_type];
        if (!task) continue;
        for (let i = 0; i < grant.available; i++) {
          slots.push({
            id: task.id,
            adType: grant.ad_type as PtcAdType,
            title: task.title,
            description: task.description || '',
            imageUrl: task.image_url || '',
            videoUrl: task.youtube_url || '',
            destinationUrl: task.url || '',
            rewardCOP: grant.reward_per_ad,
            viewed: false,
          });
        }
      }

      this.megaV2Slots.set(slots);
    } catch {
      this.megaV2Slots.set([]);
    }
  }

  // ── Modal ────────────────────────────────────────────────────────────────

  openModal(slot: TaskSlot): void {
    if (!slot.id || slot.viewed) return;
    this.selectedAd.set({
      id: slot.id, title: slot.title, description: slot.description,
      advertiserName: slot.title, advertiserType: 'company',
      imageUrl: slot.imageUrl, videoUrl: slot.videoUrl,
      destinationUrl: slot.destinationUrl, adType: slot.adType,
      rewardCOP: slot.rewardCOP,
      duration: (slot.adType === 'mini' || slot.adType === 'mini_referral') ? 30 : 60,
    });
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.selectedAd.set(null);
    this.rewardStatus.set('idle');
    this.pendingRewardAd = null;
  }

  onRewardClaimed(event: { walletAmount: number; donationAmount: number; taskId: string; durationMs: number }): void {
    const ad = this.selectedAd();
    if (!ad) return;
    this.pendingRewardAd = ad;
    this.pendingRewardDuration = event.durationMs;
    this.rewardDisplayAmount.set(this.formatReward(ad.rewardCOP));
    this.isModalOpen.set(false);
    this.rewardStatus.set('crediting');
    this.creditRewardToDb(ad, event.durationMs);
  }

  closeRewardOverlay(): void {
    this.rewardStatus.set('idle');
    this.isModalOpen.set(false);
    this.selectedAd.set(null);
    this.pendingRewardAd = null;
  }

  onRetryReward(): void {
    if (this.pendingRewardAd) {
      this.rewardStatus.set('crediting');
      this.creditRewardToDb(this.pendingRewardAd, this.pendingRewardDuration);
    }
  }

  private markSlotViewed(ad: PtcAd): void {
    const megaV2Types = ['mega_2000','mega_5000','mega_10000','mega_20000','mega_50000','mega_100000'];
    if (megaV2Types.includes(ad.adType)) {
      // Marcar el primer slot no visto de este tipo como visto
      this.megaV2Slots.update(slots => {
        const idx = slots.findIndex(s => s.adType === ad.adType && !s.viewed);
        if (idx >= 0) slots[idx] = { ...slots[idx], viewed: true };
        return [...slots];
      });
      return;
    }
    if (ad.adType === 'mega') {
      this.markMegaDone(ad.id);
      this.megaSlots.update(slots =>
        slots.map(s => s.id === ad.id ? { ...s, viewed: true } : s)
      );
    } else if (ad.adType === 'mini_referral') {
      this.markDailyDone(ad.id);
      this.miniReferralSlots.update(slots =>
        slots.map(s => s.id === ad.id ? { ...s, viewed: true } : s)
      );
    } else if (ad.adType === 'mini') {
      this.markDailyDone(ad.id);
      this.miniSlots.update(slots =>
        slots.map(s => s.id === ad.id ? { ...s, viewed: true } : s)
      );
    } else {
      this.markDailyDone(ad.id);
      this.standard400Slots.update(slots =>
        slots.map(s => s.id === ad.id ? { ...s, viewed: true } : s)
      );
    }
  }

  private async creditRewardToDb(ad: PtcAd, durationMs?: number): Promise<void> {
    try {
      // Obtener user ID con fallback robusto
      let userId = this.authService.getCurrentUser()?.id;
      if (!userId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        userId = user?.id;
      }
      if (!userId) {
        console.warn('[PTC] No user ID disponible');
        return;
      }

      const ip = this.userTracking.getIp() || null;
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      const fingerprint = await this.userTracking.getSessionFingerprint() || null;

      const result: any = await this.sessionService.callRpc('record_ptc_click', {
        p_user_id: userId,
        p_task_id: ad.id,
        p_ip_address: ip,
        p_user_agent: ua,
        p_session_fingerprint: fingerprint,
        p_click_duration_ms: durationMs ?? null,
        p_ad_type_override: ['mini_referral','mega_2000','mega_5000','mega_10000','mega_20000','mega_50000','mega_100000'].includes(ad.adType) ? ad.adType : null,
      });

      if (result?.success === true) {
        this.markSlotViewed(ad);
        this.userTracking.recordAdView(ad.id);
        const actualReward: number = result.reward ?? ad.rewardCOP;
        this.profileService.patchBalance(actualReward);
        this.profileService.getCurrentProfile().catch(() => {});
        if (!this.destroyed) this.rewardStatus.set('credited');
      } else {
        console.warn('[PTC] Reward rejected:', result?.error ?? 'unknown reason');
        if (!this.destroyed) {
          const errorMsg = result?.error || 'Error desconocido';
          const isBusinessError = this.isNonRetryableError(errorMsg);
          this.rewardErrorMessage.set(errorMsg);
          this.rewardErrorRetryable.set(!isBusinessError);
          this.rewardStatus.set('failed');
        }
      }
    } catch (err) {
      console.error('[PTC] creditRewardToDb error:', err);
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

  formatReward(cop: number): string {
    return this.currencyService.formatFromCOP(cop, 2);
  }

  getSlotColor(adType: PtcAdType): string {
    const map: Record<string, string> = {
      standard_400: 'cyan', mini: 'emerald', mega: 'purple', mini_referral: 'amber',
    };
    return map[adType] ?? 'slate';
  }
}
