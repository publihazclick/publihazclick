import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { StorageService } from '../../../../core/services/storage.service';
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
}

interface AdForm {
  title: string;
  description: string;
  url: string;
  youtube_url: string;
  image_url: string;
  ad_type: PtcAdType;
  daily_limit: number;
}

const AD_TYPE_LABELS: Record<string, string> = {
  mega: 'Mega Anuncio — 2,000 COP',
  standard_600: 'Anuncio 600 — 600 COP',
  standard_400: 'Anuncio 400 — 400 COP',
  mini: 'Mini Anuncio — 83.33 COP',
};

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
export class AdvertiserAdsComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly storageService = inject(StorageService);
  private readonly supabase = getSupabaseClient();

  readonly profile = this.profileService.profile;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly uploadingImage = signal(false);
  readonly showForm = signal(false);
  readonly showDeleteConfirm = signal(false);

  readonly myAd = signal<MyAd | null>(null);
  readonly successMsg = signal<string | null>(null);
  readonly errorMsg = signal<string | null>(null);

  readonly form = signal<AdForm>({
    title: '',
    description: '',
    url: '',
    youtube_url: '',
    image_url: '',
    ad_type: 'standard_400',
    daily_limit: 50,
  });

  readonly adTypeLabels = AD_TYPE_LABELS;
  readonly adTypeKeys = Object.keys(AD_TYPE_LABELS) as PtcAdType[];

  async ngOnInit(): Promise<void> {
    await this.loadMyAd();
    this.loading.set(false);
  }

  private async loadMyAd(): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;

    const { data } = await this.supabase
      .from('ptc_tasks')
      .select('*')
      .eq('advertiser_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    this.myAd.set(data as MyAd | null);
  }

  openCreateForm(): void {
    this.form.set({
      title: '', description: '', url: '', youtube_url: '',
      image_url: '', ad_type: 'standard_400', daily_limit: 50,
    });
    this.showForm.set(true);
    this.clearMessages();
  }

  openEditForm(): void {
    const ad = this.myAd();
    if (!ad) return;
    this.form.set({
      title: ad.title,
      description: ad.description,
      url: ad.url,
      youtube_url: ad.youtube_url || '',
      image_url: ad.image_url || '',
      ad_type: ad.ad_type,
      daily_limit: ad.daily_limit,
    });
    this.showForm.set(true);
    this.clearMessages();
  }

  cancelForm(): void {
    this.showForm.set(false);
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
        // Actualizar — vuelve a pending para revisión del admin
        const { error } = await this.supabase
          .from('ptc_tasks')
          .update({
            title: f.title.trim(),
            description: f.description.trim(),
            url: f.url.trim(),
            youtube_url: f.youtube_url.trim() || null,
            image_url: f.image_url.trim() || null,
            ad_type: f.ad_type,
            daily_limit: f.daily_limit,
            status: 'pending',
          })
          .eq('id', existing.id);

        if (error) throw error;
        this.showSuccess('Anuncio actualizado. Pendiente de revisión por el administrador.');
      } else {
        // Crear nuevo con status pending
        const { error } = await this.supabase
          .from('ptc_tasks')
          .insert({
            title: f.title.trim(),
            description: f.description.trim(),
            url: f.url.trim(),
            youtube_url: f.youtube_url.trim() || null,
            image_url: f.image_url.trim() || null,
            ad_type: f.ad_type,
            daily_limit: f.daily_limit,
            advertiser_id: user.id,
            status: 'pending',
            location: 'app',
            reward: 0,
            duration: 60,
            total_clicks: 0,
          });

        if (error) throw error;
        this.showSuccess('Anuncio creado y enviado a revisión. El admin lo activará pronto.');
      }

      await this.loadMyAd();
      this.showForm.set(false);
    } catch {
      this.showError('Error al guardar. Intenta de nuevo.');
    }

    this.saving.set(false);
  }

  async deleteAd(): Promise<void> {
    const ad = this.myAd();
    if (!ad) return;

    const { error } = await this.supabase
      .from('ptc_tasks')
      .delete()
      .eq('id', ad.id);

    this.showDeleteConfirm.set(false);

    if (error) {
      this.showError('Error al eliminar el anuncio.');
    } else {
      this.myAd.set(null);
      this.showSuccess('Anuncio eliminado correctamente.');
    }
  }

  getStatusInfo(status: string): { label: string; color: string } {
    return STATUS_LABELS[status] ?? { label: status, color: 'text-slate-400 bg-white/5 border-white/10' };
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
