import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProfileService } from '../../../../core/services/profile.service';
import { AdminPtcTaskService } from '../../../../core/services/admin-ptc-task.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { WalletStateService } from '../../../../core/services/wallet-state.service';
import { UserTrackingService } from '../../../../core/services/user-tracking.service';
import { SupabaseSessionService } from '../../../../core/services/supabase-session.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PtcModalComponent, PtcAd } from '../../../../components/ptc-modal/ptc-modal.component';
import type { PtcAdType } from '../../../../core/models/admin.model';
import { getSupabaseClient } from '../../../../core/supabase.client';

const DAILY_SLOTS = {
  standard_400: 5,
  mini: 4,
  mega_per_affiliate: 5,
  max_affiliates: 40,
};

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
export class AdvertiserTasksComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly ptcService = inject(AdminPtcTaskService);
  private readonly currencyService = inject(CurrencyService);
  private readonly walletService = inject(WalletStateService);
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
  readonly standardSlots = signal<TaskSlot[]>([]);
  readonly megaSlots = signal<TaskSlot[]>([]);

  readonly megaSlotsAvailable = computed(() =>
    Math.min(this.affiliatesWithPackage(), DAILY_SLOTS.max_affiliates) * DAILY_SLOTS.mega_per_affiliate
  );
  readonly maxDailyOwn = computed(() =>
    DAILY_SLOTS.standard_400 * 400 + DAILY_SLOTS.mini * 83.33
  );
  readonly maxDailyMega = computed(() => this.megaSlotsAvailable() * 2000);

  // Contadores de completados
  readonly standardDoneCount = computed(() => this.standardSlots().filter(s => s.viewed && s.id).length);
  readonly megaDoneCount = computed(() => this.megaSlots().filter(s => s.viewed && s.id).length);

  readonly isModalOpen = signal(false);
  readonly selectedAd = signal<PtcAd | null>(null);

  private readonly adTypeRewards: Record<string, number> = {
    mega: 2000, standard_600: 600, standard_400: 400, mini: 83.33,
  };

  // ── Tracking ─────────────────────────────────────────────────────────────
  // Clave diaria incluye la fecha de hoy → se resetea sola cada nuevo día
  private get dailyKey(): string {
    return `ptc_daily_${new Date().toISOString().split('T')[0]}`;
  }
  // Clave mega es permanente → acumula hasta que se complete
  private readonly megaKey = 'ptc_mega_done';

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

  async ngOnInit(): Promise<void> {
    await this.checkRequirements();
    if (this.requirementsMet()) {
      await Promise.all([this.loadAffiliatesCount(), this.loadTasks()]);
    }
    this.loading.set(false);
  }

  private async checkRequirements(): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;
    const [{ count: adCount }, { count: bannerCount }] = await Promise.all([
      this.supabase.from('ptc_tasks').select('id', { count: 'exact', head: true }).eq('advertiser_id', user.id),
      this.supabase.from('banner_ads').select('id', { count: 'exact', head: true }).eq('advertiser_id', user.id),
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
      const result = await this.ptcService.getPtcTasks(
        { status: 'active', location: 'app' },
        { page: 1, pageSize: 100 }
      );
      const tasks = result.data ?? [];
      const dailyDone = this.getDailyDone();
      const megaDone = this.getMegaDone();

      const toSlot = (task: any, isDailyType: boolean): TaskSlot => ({
        id: task.id,
        adType: task.ad_type,
        title: task.title,
        description: task.description || '',
        imageUrl: task.image_url || '',
        videoUrl: task.youtube_url || '',
        destinationUrl: task.url || '',
        rewardCOP: this.adTypeRewards[task.ad_type] ?? task.reward ?? 0,
        // Diarias: verificar si se hizo HOY — Mega: verificar si alguna vez se hizo
        viewed: isDailyType ? dailyDone.has(task.id) : megaDone.has(task.id),
      });

      const emptySlot = (adType: PtcAdType, reward: number): TaskSlot => ({
        id: null, adType, title: 'Próximamente',
        description: 'El administrador cargará este anuncio pronto.',
        imageUrl: '', videoUrl: '', destinationUrl: '', rewardCOP: reward, viewed: false,
      });

      const fillSlots = (
        tasks: any[], total: number, adType: PtcAdType, reward: number, isDaily: boolean
      ): TaskSlot[] => {
        const slots = tasks.slice(0, total).map(t => toSlot(t, isDaily));
        for (let i = slots.length; i < total; i++) slots.push(emptySlot(adType, reward));
        return slots;
      };

      // Tareas diarias: standard_400 + mini
      const s400 = tasks.filter(t => t.ad_type === 'standard_400');
      const mini = tasks.filter(t => t.ad_type === 'mini');
      this.standardSlots.set([
        ...fillSlots(s400, DAILY_SLOTS.standard_400, 'standard_400', 400, true),
        ...fillSlots(mini, DAILY_SLOTS.mini, 'mini', 83.33, true),
      ]);

      // Mega tareas: acumulables hasta el máximo disponible
      const mega = tasks.filter(t => t.ad_type === 'mega');
      const megaTotal = this.megaSlotsAvailable();
      this.megaSlots.set(fillSlots(mega, megaTotal, 'mega', 2000, false));

    } catch {
      const emptyStandard = [
        ...Array.from({ length: DAILY_SLOTS.standard_400 }, () => this.emptySlot('standard_400', 400)),
        ...Array.from({ length: DAILY_SLOTS.mini }, () => this.emptySlot('mini', 83.33)),
      ];
      this.standardSlots.set(emptyStandard);
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

  // ── Modal ────────────────────────────────────────────────────────────────

  openModal(slot: TaskSlot): void {
    if (!slot.id || slot.viewed) return;
    this.selectedAd.set({
      id: slot.id, title: slot.title, description: slot.description,
      advertiserName: slot.title, advertiserType: 'company',
      imageUrl: slot.imageUrl, videoUrl: slot.videoUrl,
      destinationUrl: slot.destinationUrl, adType: slot.adType,
      rewardCOP: slot.rewardCOP, duration: slot.adType === 'mini' ? 30 : 60,
    });
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.selectedAd.set(null);
  }

  onRewardClaimed(event: { walletAmount: number; donationAmount: number; taskId: string; durationMs: number }): void {
    const ad = this.selectedAd();
    if (!ad) return;

    // Acreditar vía RPC con metadata anti-fraude
    this.creditRewardToDb(ad.id, event.durationMs);

    const isMega = ad.adType === 'mega';

    if (isMega) {
      // Mega: tracking permanente — acumula
      this.markMegaDone(ad.id);
      this.megaSlots.update(slots =>
        slots.map(s => s.id === ad.id ? { ...s, viewed: true } : s)
      );
    } else {
      // Diaria: tracking solo por hoy
      this.markDailyDone(ad.id);
      this.standardSlots.update(slots =>
        slots.map(s => s.id === ad.id ? { ...s, viewed: true } : s)
      );
    }
  }

  private async creditRewardToDb(taskId: string, durationMs?: number): Promise<void> {
    try {
      const user = this.authService.getCurrentUser();
      if (!user) return;

      const ip = this.userTracking.getIp() || null;
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      const fingerprint = await this.userTracking.getSessionFingerprint() || null;

      await this.sessionService.callRpc('record_ptc_click', {
        p_user_id: user.id,
        p_task_id: taskId,
        p_ip_address: ip,
        p_user_agent: ua,
        p_session_fingerprint: fingerprint,
        p_click_duration_ms: durationMs ?? null,
      });
    } catch (err) {
      console.error('creditRewardToDb error:', err);
    } finally {
      this.profileService.getCurrentProfile().catch(() => {});
    }
  }

  formatReward(cop: number): string {
    return this.currencyService.formatFromCOP(cop, 2);
  }

  getSlotColor(adType: PtcAdType): string {
    const map: Record<string, string> = { standard_400: 'cyan', mini: 'emerald', mega: 'purple' };
    return map[adType] ?? 'slate';
  }
}
