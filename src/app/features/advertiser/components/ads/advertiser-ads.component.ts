import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { StorageService } from '../../../../core/services/storage.service';
import { AdminPtcTaskService, SAMPLE_PTC_ADS } from '../../../../core/services/admin-ptc-task.service';
import { getSupabaseClient } from '../../../../core/supabase.client';
import type { PtcAdType } from '../../../../core/models/admin.model';

interface MyAd {
  id: string;
  title: string;
  description: string;
  url: string;
  youtube_url: string | null;
  image_url: string | null;
  ad_type: PtcAdType;
  status: string;
  daily_limit: number;
  total_clicks: number;
  created_at: string;
  activated_at: string | null;
}

interface AdForm {
  title: string;
  description: string;
  url: string;
  youtube_url: string;
  image_url: string;
}

interface GalleryAdCard {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  videoUrl: string;
  rewardCOP: number;
  advertiserName: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pendiente de revisión', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  active:    { label: 'Activo',                color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  paused:    { label: 'Pausado',               color: 'text-slate-400 bg-white/5 border-white/10' },
  rejected:  { label: 'Rechazado',             color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  completed: { label: 'Completado',            color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
};

@Component({
  selector: 'app-advertiser-ads',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './advertiser-ads.component.html',
})
export class AdvertiserAdsComponent implements OnInit, OnDestroy {
  private readonly profileService = inject(ProfileService);
  private readonly storageService = inject(StorageService);
  private readonly ptcService = inject(AdminPtcTaskService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase = getSupabaseClient();

  readonly profile = this.profileService.profile;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly uploadingImage = signal(false);
  readonly showForm = signal(false);
  readonly showDeleteConfirm = signal(false);

  readonly myAd = signal<MyAd | null>(null);
  /** Anuncio del ciclo anterior cuando el usuario aún no ha creado uno en el ciclo actual */
  readonly previousAd = signal<MyAd | null>(null);
  readonly successMsg = signal<string | null>(null);
  readonly errorMsg = signal<string | null>(null);

  readonly adExpiresAt = computed<Date | null>(() => {
    const ad = this.myAd();
    if (!ad?.activated_at) return null;
    const d = new Date(ad.activated_at);
    d.setDate(d.getDate() + 30);
    return d;
  });

  readonly adIsExpired = computed(() => {
    const exp = this.adExpiresAt();
    return exp ? exp < new Date() : false;
  });

  readonly adExpiresText = computed(() => {
    const exp = this.adExpiresAt();
    if (!exp) return null;
    return exp.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  });

  private approvalTimer: ReturnType<typeof setTimeout> | null = null;

  readonly form = signal<AdForm>({
    title: '',
    description: '',
    url: '',
    youtube_url: '',
    image_url: '',
  });

  // Gallery
  readonly galleryAds = signal<GalleryAdCard[]>([]);
  readonly galleryLoading = signal(true);
  readonly cloningFrom = signal<GalleryAdCard | null>(null);
  readonly selectedGalleryAd = signal<GalleryAdCard | null>(null);

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadMyAd(), this.loadGalleryAds()]);
    this.loading.set(false);
  }

  private async loadMyAd(): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await this.supabase
      .from('profiles')
      .select('package_started_at')
      .eq('id', user.id)
      .maybeSingle();

    // 1) Buscar el anuncio del CICLO ACTUAL (creado después de package_started_at)
    let currentQuery = this.supabase
      .from('ptc_tasks')
      .select('*')
      .eq('advertiser_id', user.id);

    if (profile?.package_started_at) {
      currentQuery = currentQuery.gte('created_at', profile.package_started_at);
    }

    const { data: currentAd } = await currentQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentAd) {
      this.myAd.set(currentAd as MyAd);
      this.previousAd.set(null);
      return;
    }

    // 2) No tiene anuncio del ciclo actual → buscar el último de cualquier ciclo anterior
    this.myAd.set(null);

    if (!profile?.package_started_at) {
      this.previousAd.set(null);
      return;
    }

    const { data: prevAd } = await this.supabase
      .from('ptc_tasks')
      .select('*')
      .eq('advertiser_id', user.id)
      .lt('created_at', profile.package_started_at)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    this.previousAd.set(prevAd as MyAd | null);
  }

  private async loadGalleryAds(): Promise<void> {
    try {
      const result = await this.ptcService.getPtcTasks(
        { status: 'active' },
        { page: 1, pageSize: 50 }
      );

      const tasks = result.data ?? [];

      if (tasks.length > 0) {
        this.galleryAds.set(
          tasks.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description || '',
            imageUrl: t.image_url || '',
            videoUrl: t.youtube_url || '',
            rewardCOP: 400,
            advertiserName: t.advertiser_username || t.title,
          }))
        );
      } else {
        this.setFallbackGallery();
      }
    } catch {
      this.setFallbackGallery();
    } finally {
      this.galleryLoading.set(false);
    }
  }

  private setFallbackGallery(): void {
    this.galleryAds.set(
      SAMPLE_PTC_ADS.map(s => ({
        id: s.id,
        title: s.title,
        description: s.description,
        imageUrl: s.imageUrl,
        videoUrl: s.videoUrl,
        rewardCOP: s.rewardCOP,
        advertiserName: s.advertiserName,
      }))
    );
  }

  openCreateForm(): void {
    this.cloningFrom.set(null);
    this.form.set({ title: '', description: '', url: '', youtube_url: '', image_url: '' });
    this.showForm.set(true);
    this.clearMessages();
  }

  openEditForm(): void {
    this.cloningFrom.set(null);
    const ad = this.myAd();
    if (!ad) return;
    this.form.set({
      title: ad.title,
      description: ad.description,
      url: ad.url,
      youtube_url: ad.youtube_url || '',
      image_url: ad.image_url || '',
    });
    this.showForm.set(true);
    this.clearMessages();
  }

  selectGalleryAd(ad: GalleryAdCard): void {
    if (this.myAd()) return;
    const current = this.selectedGalleryAd();
    this.selectedGalleryAd.set(current?.id === ad.id ? null : ad);
    this.clearMessages();
  }

  async saveSelectedAd(): Promise<void> {
    const ad = this.selectedGalleryAd();
    if (!ad) return;

    this.saving.set(true);
    this.clearMessages();
    this.cloningFrom.set(ad);

    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) { this.saving.set(false); return; }

    try {
      const existing = this.myAd();
      if (existing) {
        const { error } = await this.supabase
          .from('ptc_tasks')
          .update({
            title: ad.title,
            description: ad.description,
            youtube_url: ad.videoUrl || null,
            image_url: ad.imageUrl || null,
            ad_type: 'standard_400',
            daily_limit: 50,
            status: 'pending',
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await this.supabase
          .from('ptc_tasks')
          .insert({
            title: ad.title,
            description: ad.description,
            url: ad.description,
            youtube_url: ad.videoUrl || null,
            image_url: ad.imageUrl || null,
            ad_type: 'standard_400',
            daily_limit: 50,
            advertiser_id: user.id,
            status: 'pending',
            location: 'app',
            reward: 0,
            duration: 60,
            total_clicks: 0,
          });

        if (error) throw error;

        // Si tenía un anuncio del ciclo anterior, pausarlo
        const prev = this.previousAd();
        if (prev) {
          await this.supabase
            .from('ptc_tasks')
            .update({ status: 'paused' })
            .eq('id', prev.id)
            .eq('status', 'active');
        }
      }

      await this.loadMyAd();
      this.showForm.set(false);
      this.selectedGalleryAd.set(null);
      this.cloningFrom.set(null);
      this.showSuccess('Tu anuncio se ha enviado a revisión.');

      if (isPlatformBrowser(this.platformId)) {
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
      }
    } catch {
      this.showError('Error al crear el anuncio. Intenta de nuevo.');
    }

    this.saving.set(false);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.cloningFrom.set(null);
    this.clearMessages();
  }

  updateForm(field: keyof AdForm, value: any): void {
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
    const result = await this.storageService.uploadPtcAdImage(file);
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
    if (!f.title.trim() || !f.url.trim()) {
      this.showError('El título y la URL de destino son obligatorios.');
      return;
    }

    this.saving.set(true);
    this.clearMessages();

    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) { this.saving.set(false); return; }

    const existing = this.myAd();

    try {
      if (existing) {
        // Editar anuncio del ciclo actual: se queda en pending para re-revisión
        const { error } = await this.supabase
          .from('ptc_tasks')
          .update({
            title: f.title.trim(),
            description: f.description.trim(),
            url: f.url.trim(),
            youtube_url: f.youtube_url.trim() || null,
            image_url: f.image_url.trim() || null,
            ad_type: 'standard_400',
            daily_limit: 50,
            status: 'pending',
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Crear nuevo (puede venir del form normal o de "editar anuncio anterior").
        // Siempre nace en estado pending → revisión.
        const { error } = await this.supabase
          .from('ptc_tasks')
          .insert({
            title: f.title.trim(),
            description: f.description.trim(),
            url: f.url.trim(),
            youtube_url: f.youtube_url.trim() || null,
            image_url: f.image_url.trim() || null,
            ad_type: 'standard_400',
            daily_limit: 50,
            advertiser_id: user.id,
            status: 'pending',
            location: 'app',
            reward: 0,
            duration: 60,
            total_clicks: 0,
          });

        if (error) throw error;

        // Si venía de "editar anuncio anterior", pausar el viejo para no duplicar
        const prev = this.previousAd();
        if (prev) {
          await this.supabase
            .from('ptc_tasks')
            .update({ status: 'paused' })
            .eq('id', prev.id)
            .eq('status', 'active');
        }
      }

      await this.loadMyAd();
      this.showForm.set(false);
      this.cloningFrom.set(null);
      this.showSuccess('Tu anuncio se ha enviado a revisión.');
    } catch {
      this.showError('Error al guardar. Intenta de nuevo.');
    }

    this.saving.set(false);
  }

  async deleteAd(): Promise<void> {
    // SOLO se puede eliminar el anuncio del CICLO ANTERIOR.
    // El del ciclo actual está bloqueado hasta que el usuario renueve.
    if (this.myAd()) {
      this.showDeleteConfirm.set(false);
      this.showError('No puedes eliminar tu anuncio hasta que pasen los 30 días desde tu activación o renovación.');
      return;
    }

    const ad = this.previousAd();
    if (!ad) {
      this.showDeleteConfirm.set(false);
      return;
    }

    const { error } = await this.supabase
      .from('ptc_tasks')
      .delete()
      .eq('id', ad.id);

    this.showDeleteConfirm.set(false);

    if (error) {
      console.error('[deleteAd] error', error);
      this.showError('No se pudo eliminar el anuncio: ' + (error.message || 'error desconocido'));
    } else {
      this.myAd.set(null);
      this.previousAd.set(null);
      this.showSuccess('Anuncio eliminado. Ya puedes crear o clonar uno nuevo.');
      await this.loadMyAd();
    }
  }

  /**
   * Vuelve a usar el anuncio del ciclo anterior: clona sus datos como uno nuevo
   * en estado `pending` para revisión. Conserva el viejo en la DB para historial.
   */
  async reusePreviousAd(): Promise<void> {
    const prev = this.previousAd();
    if (!prev) return;

    this.saving.set(true);
    this.clearMessages();

    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) { this.saving.set(false); return; }

    try {
      const { error } = await this.supabase
        .from('ptc_tasks')
        .insert({
          title: prev.title,
          description: prev.description,
          url: prev.url,
          youtube_url: prev.youtube_url,
          image_url: prev.image_url,
          ad_type: 'standard_400',
          daily_limit: prev.daily_limit ?? 50,
          advertiser_id: user.id,
          status: 'pending',
          location: 'app',
          reward: 0,
          duration: 60,
          total_clicks: 0,
        });

      if (error) throw error;

      // Pausar el anuncio viejo para que no aparezca duplicado en el feed
      await this.supabase
        .from('ptc_tasks')
        .update({ status: 'paused' })
        .eq('id', prev.id)
        .eq('status', 'active');

      await this.loadMyAd();
      this.showSuccess('Tu anuncio se ha enviado a revisión.');
    } catch {
      this.showError('No se pudo reenviar el anuncio. Intenta de nuevo.');
    }

    this.saving.set(false);
  }

  /**
   * Editar el anuncio del ciclo anterior: abre el formulario con sus datos.
   * Al guardar, se crea uno NUEVO en estado pending (no muta el viejo).
   */
  editPreviousAd(): void {
    const prev = this.previousAd();
    if (!prev) return;
    this.cloningFrom.set(null);
    this.form.set({
      title: prev.title,
      description: prev.description,
      url: prev.url,
      youtube_url: prev.youtube_url ?? '',
      image_url: prev.image_url ?? '',
    });
    this.showForm.set(true);
    this.clearMessages();
  }

  ngOnDestroy(): void {
    if (this.approvalTimer) clearTimeout(this.approvalTimer);
  }

  getStatusInfo(status: string): { label: string; color: string } {
    return STATUS_LABELS[status] ?? { label: status, color: 'text-slate-400 bg-white/5 border-white/10' };
  }

  private scheduleAutoApproval(): void {
    if (this.approvalTimer) clearTimeout(this.approvalTimer);
    this.successMsg.set('Pendiente de aprobación. Tu anuncio está siendo revisado...');
    this.approvalTimer = setTimeout(async () => {
      await this.loadMyAd();
      this.successMsg.set('¡Tu anuncio fue aprobado y ya está activo!');
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
