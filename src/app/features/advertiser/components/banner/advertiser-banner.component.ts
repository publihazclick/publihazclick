import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
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
export class AdvertiserBannerComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly storageService = inject(StorageService);
  private readonly supabase = getSupabaseClient();

  readonly profile = this.profileService.profile;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly uploadingImage = signal(false);
  readonly showForm = signal(false);
  readonly showDeleteConfirm = signal(false);

  readonly myBanner = signal<MyBanner | null>(null);
  readonly successMsg = signal<string | null>(null);
  readonly errorMsg = signal<string | null>(null);

  readonly form = signal<BannerForm>({
    name: '',
    description: '',
    image_url: '',
    url: '',
    position: 'header',
  });

  readonly positionLabels = POSITION_LABELS;
  readonly positionKeys = Object.keys(POSITION_LABELS) as BannerPosition[];

  async ngOnInit(): Promise<void> {
    await this.loadMyBanner();
    this.loading.set(false);
  }

  private async loadMyBanner(): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;

    const { data } = await this.supabase
      .from('banner_ads')
      .select('*')
      .eq('advertiser_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    this.myBanner.set(data as MyBanner | null);
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
        this.showSuccess('Banner actualizado. Pendiente de revisión por el administrador.');
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
        this.showSuccess('Banner creado y enviado a revisión. El admin lo activará pronto.');
      }

      await this.loadMyBanner();
      this.showForm.set(false);
    } catch {
      this.showError('Error al guardar. Intenta de nuevo.');
    }

    this.saving.set(false);
  }

  async deleteBanner(): Promise<void> {
    const b = this.myBanner();
    if (!b) return;

    const { error } = await this.supabase
      .from('banner_ads')
      .delete()
      .eq('id', b.id);

    this.showDeleteConfirm.set(false);

    if (error) {
      this.showError('Error al eliminar el banner.');
    } else {
      this.myBanner.set(null);
      this.showSuccess('Banner eliminado correctamente.');
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
