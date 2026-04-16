import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { StorageService } from '../../../../core/services/storage.service';
import { getSupabaseClient } from '../../../../core/supabase.client';
import type { BannerPosition } from '../../../../core/models/admin.model';

interface MyBanner {
  id: string;
  name: string;
  description: string | null;
  image_url: string;
  url: string;
  position: BannerPosition;
  status: string;
  total_impressions: number;
  total_clicks: number;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
}

interface BannerForm {
  name: string;
  description: string;
  image_url: string;
  url: string;
  position: BannerPosition;
}

const POSITION_LABELS: Record<string, string> = {
  header:       'Banner Principal (encabezado)',
  sidebar:      'Banner Lateral (sidebar)',
  footer:       'Banner Inferior (footer)',
  interstitial: 'Banner Intersticial (pantalla completa)',
};

interface GalleryBanner {
  id: string;
  name: string;
  description: string | null;
  image_url: string;
  url: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pendiente de revisión', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  active:    { label: 'Activo',                color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  paused:    { label: 'Pausado',               color: 'text-slate-400 bg-white/5 border-white/10' },
  rejected:  { label: 'Rechazado',             color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  completed: { label: 'Completado',            color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
};

@Component({
  selector: 'app-advertiser-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './advertiser-banner.component.html',
})
export class AdvertiserBannerComponent implements OnInit, OnDestroy {
  private readonly profileService = inject(ProfileService);
  private readonly storageService = inject(StorageService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase = getSupabaseClient();

  readonly profile = this.profileService.profile;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly uploadingImage = signal(false);
  readonly showForm = signal(false);
  readonly showDeleteConfirm = signal(false);

  readonly myBanner = signal<MyBanner | null>(null);
  /** Banner del ciclo anterior si aún no creó uno en el ciclo actual */
  readonly previousBanner = signal<MyBanner | null>(null);
  readonly successMsg = signal<string | null>(null);
  readonly errorMsg = signal<string | null>(null);

  readonly bannerExpiresAt = computed<Date | null>(() => {
    const b = this.myBanner();
    if (!b?.end_date) return null;
    return new Date(b.end_date);
  });

  readonly bannerIsExpired = computed(() => {
    const exp = this.bannerExpiresAt();
    return exp ? exp < new Date() : false;
  });

  readonly bannerExpiresText = computed(() => {
    const exp = this.bannerExpiresAt();
    if (!exp) return null;
    return exp.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  });

  private approvalTimer: ReturnType<typeof setTimeout> | null = null;

  readonly form = signal<BannerForm>({
    name: '',
    description: '',
    image_url: '',
    url: '',
    position: 'header',
  });

  readonly positionLabels = POSITION_LABELS;
  readonly positionKeys = Object.keys(POSITION_LABELS) as BannerPosition[];

  // Gallery
  readonly galleryBanners = signal<GalleryBanner[]>([]);
  readonly galleryLoading = signal(true);
  readonly cloningFrom = signal<GalleryBanner | null>(null);
  readonly selectedGalleryBanner = signal<GalleryBanner | null>(null);

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadMyBanner(), this.loadGalleryBanners()]);
    this.loading.set(false);
  }

  private async loadGalleryBanners(): Promise<void> {
    try {
      const { data } = await this.supabase
        .from('banner_ads')
        .select('id, name, description, image_url, url')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(50);

      this.galleryBanners.set((data || []) as GalleryBanner[]);
    } catch {
      this.galleryBanners.set([]);
    } finally {
      this.galleryLoading.set(false);
    }
  }

  selectGalleryBanner(banner: GalleryBanner): void {
    if (this.myBanner()) return;
    const current = this.selectedGalleryBanner();
    this.selectedGalleryBanner.set(current?.id === banner.id ? null : banner);
    this.clearMessages();
  }

  async saveSelectedBanner(): Promise<void> {
    const banner = this.selectedGalleryBanner();
    if (!banner) return;

    this.saving.set(true);
    this.clearMessages();
    this.cloningFrom.set(banner);

    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) { this.saving.set(false); return; }

    try {
      const existing = this.myBanner();
      if (existing) {
        const { error } = await this.supabase
          .from('banner_ads')
          .update({
            name: banner.name,
            description: banner.description,
            image_url: banner.image_url,
            status: 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await this.supabase
          .from('banner_ads')
          .insert({
            name: banner.name,
            description: banner.description,
            image_url: banner.image_url,
            url: banner.url,
            position: 'header',
            advertiser_id: user.id,
            status: 'pending',
            location: 'app',
            impressions_limit: 10000,
            clicks_limit: 1000,
            reward: 0,
          });

        if (error) throw error;

        const prev = this.previousBanner();
        if (prev) {
          await this.supabase
            .from('banner_ads')
            .update({ status: 'paused' })
            .eq('id', prev.id)
            .eq('status', 'active');
        }
      }

      await this.loadMyBanner();
      this.showForm.set(false);
      this.selectedGalleryBanner.set(null);
      this.cloningFrom.set(null);
      this.showSuccess('Tu banner se ha enviado a revisión.');

      if (isPlatformBrowser(this.platformId)) {
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
      }
    } catch {
      this.showError('Error al crear el banner. Intenta de nuevo.');
    }

    this.saving.set(false);
  }

  private async loadMyBanner(): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await this.supabase
      .from('profiles')
      .select('package_started_at')
      .eq('id', user.id)
      .maybeSingle();

    // 1) Banner del ciclo actual
    let currentQuery = this.supabase
      .from('banner_ads')
      .select('*')
      .eq('advertiser_id', user.id);

    if (profile?.package_started_at) {
      currentQuery = currentQuery.gte('created_at', profile.package_started_at);
    }

    const { data: currentBanner } = await currentQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentBanner) {
      this.myBanner.set(currentBanner as MyBanner);
      this.previousBanner.set(null);
      return;
    }

    // 2) No tiene del ciclo actual → último de ciclos anteriores
    this.myBanner.set(null);

    if (!profile?.package_started_at) {
      this.previousBanner.set(null);
      return;
    }

    const { data: prevBanner } = await this.supabase
      .from('banner_ads')
      .select('*')
      .eq('advertiser_id', user.id)
      .lt('created_at', profile.package_started_at)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    this.previousBanner.set(prevBanner as MyBanner | null);
  }

  openCreateForm(): void {
    this.form.set({ name: '', description: '', image_url: '', url: '', position: 'header' });
    this.showForm.set(true);
    this.clearMessages();
  }

  openEditForm(): void {
    const b = this.myBanner();
    if (!b) return;
    this.form.set({
      name: b.name,
      description: b.description || '',
      image_url: b.image_url,
      url: b.url,
      position: b.position,
    });
    this.showForm.set(true);
    this.clearMessages();
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.clearMessages();
  }

  updateForm(field: keyof BannerForm, value: any): void {
    this.form.update(f => ({ ...f, [field]: value }));
  }

  async onImageChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!this.storageService.isValidImage(file)) {
      this.showError('Formato inválido. Usa JPG, PNG o WebP.');
      return;
    }
    if (!this.storageService.isValidSize(file, 2)) {
      this.showError('La imagen no debe superar 2MB.');
      return;
    }

    this.uploadingImage.set(true);
    const result = await this.storageService.uploadBannerImage(file);
    this.uploadingImage.set(false);

    if (result.success && result.url) {
      this.form.update(f => ({ ...f, image_url: result.url! }));
    } else {
      this.showError('Error al subir la imagen. Intenta de nuevo.');
    }
    input.value = '';
  }

  async save(): Promise<void> {
    const f = this.form();
    if (!f.name.trim() || !f.url.trim()) {
      this.showError('El nombre y la URL de destino son obligatorios.');
      return;
    }
    if (!f.image_url) {
      this.showError('La imagen del banner es obligatoria.');
      return;
    }

    this.saving.set(true);
    this.clearMessages();

    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) { this.saving.set(false); return; }

    const existing = this.myBanner();

    try {
      if (existing) {
        const { error } = await this.supabase
          .from('banner_ads')
          .update({
            name: f.name.trim(),
            description: f.description.trim() || null,
            image_url: f.image_url,
            url: f.url.trim(),
            position: f.position,
            status: 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await this.supabase
          .from('banner_ads')
          .insert({
            name: f.name.trim(),
            description: f.description.trim() || null,
            image_url: f.image_url,
            url: f.url.trim(),
            position: f.position,
            advertiser_id: user.id,
            status: 'pending',
            location: 'app',
            impressions_limit: 10000,
            clicks_limit: 1000,
            reward: 0,
          });

        if (error) throw error;

        const prev = this.previousBanner();
        if (prev) {
          await this.supabase
            .from('banner_ads')
            .update({ status: 'paused' })
            .eq('id', prev.id)
            .eq('status', 'active');
        }
      }

      await this.loadMyBanner();
      this.showForm.set(false);
      this.showSuccess('Tu banner se ha enviado a revisión.');
    } catch {
      this.showError('Error al guardar. Intenta de nuevo.');
    }

    this.saving.set(false);
  }

  /** Vuelve a usar el banner del ciclo anterior: clona en estado pending */
  async reusePreviousBanner(): Promise<void> {
    const prev = this.previousBanner();
    if (!prev) return;

    this.saving.set(true);
    this.clearMessages();

    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) { this.saving.set(false); return; }

    try {
      const { error } = await this.supabase
        .from('banner_ads')
        .insert({
          name: prev.name,
          description: prev.description,
          image_url: prev.image_url,
          url: prev.url,
          position: prev.position,
          advertiser_id: user.id,
          status: 'pending',
          location: 'app',
          impressions_limit: 10000,
          clicks_limit: 1000,
          reward: 0,
        });

      if (error) throw error;

      // Pausar el viejo
      await this.supabase
        .from('banner_ads')
        .update({ status: 'paused' })
        .eq('id', prev.id)
        .eq('status', 'active');

      await this.loadMyBanner();
      this.showSuccess('Tu banner se ha enviado a revisión.');
    } catch {
      this.showError('No se pudo reenviar el banner. Intenta de nuevo.');
    }

    this.saving.set(false);
  }

  /** Editar banner del ciclo anterior: abre el form con sus datos */
  editPreviousBanner(): void {
    const prev = this.previousBanner();
    if (!prev) return;
    this.form.set({
      name: prev.name,
      description: prev.description ?? '',
      image_url: prev.image_url,
      url: prev.url,
      position: prev.position,
    });
    this.showForm.set(true);
    this.clearMessages();
  }

  async deleteBanner(): Promise<void> {
    // SOLO se puede eliminar el banner del CICLO ANTERIOR.
    // El del ciclo actual está bloqueado hasta que el usuario renueve.
    if (this.myBanner()) {
      this.showDeleteConfirm.set(false);
      this.showError('No puedes eliminar tu banner hasta que pasen los 30 días desde tu activación o renovación.');
      return;
    }

    const b = this.previousBanner();
    if (!b) {
      this.showDeleteConfirm.set(false);
      return;
    }

    const { error } = await this.supabase
      .from('banner_ads')
      .delete()
      .eq('id', b.id);

    this.showDeleteConfirm.set(false);

    if (error) {
      console.error('[deleteBanner] error', error);
      this.showError('No se pudo eliminar el banner: ' + (error.message || 'error desconocido'));
    } else {
      this.myBanner.set(null);
      this.previousBanner.set(null);
      this.showSuccess('Banner eliminado. Ya puedes crear o clonar uno nuevo.');
      await this.loadMyBanner();
    }
  }

  ngOnDestroy(): void {
    if (this.approvalTimer) clearTimeout(this.approvalTimer);
  }

  getStatusInfo(status: string): { label: string; color: string } {
    return STATUS_LABELS[status] ?? { label: status, color: 'text-slate-400 bg-white/5 border-white/10' };
  }

  private scheduleAutoApproval(): void {
    if (this.approvalTimer) clearTimeout(this.approvalTimer);
    this.successMsg.set('Pendiente de aprobación. Tu banner está siendo revisado...');
    this.approvalTimer = setTimeout(async () => {
      await this.loadMyBanner();
      this.successMsg.set('¡Tu banner fue aprobado y ya está activo!');
      setTimeout(() => this.successMsg.set(null), 6000);
    }, 3 * 60 * 1000);
  }

  private showSuccess(msg: string): void {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(null), 5000);
  }

  private showError(msg: string): void {
    this.errorMsg.set(msg);
    setTimeout(() => this.errorMsg.set(null), 5000);
  }

  private clearMessages(): void {
    this.successMsg.set(null);
    this.errorMsg.set(null);
  }
}
