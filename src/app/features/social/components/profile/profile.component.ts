import {
  Component, inject, signal, computed, OnInit, ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SocialService } from '../../../../core/services/social.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { StorageService } from '../../../../core/services/storage.service';
import type { AdvertiserCard, SocialBusinessProfile } from '../../../../core/models/social.model';

@Component({
  selector: 'app-social-profile',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SocialProfileComponent implements OnInit {
  private readonly socialService = inject(SocialService);
  private readonly profileService = inject(ProfileService);
  private readonly storageService = inject(StorageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  // ── Estado de vista ──────────────────────────────────────────
  readonly card = signal<AdvertiserCard | null>(null);
  readonly business = signal<SocialBusinessProfile | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly actionLoading = signal(false);
  readonly toast = signal<{ message: string; type: 'success' | 'error' } | null>(null);

  // ── Panel de edición ─────────────────────────────────────────
  readonly showEditPanel = signal(false);
  readonly saving = signal(false);
  readonly uploadingBanner = signal(false);
  readonly bannerPreview = signal<string | null>(null);

  readonly isOwnProfile = computed(() => {
    const current = this.profileService.profile();
    return !!current && current.id === this.card()?.id;
  });

  readonly categories = [
    'Tecnología', 'Comercio', 'Servicios', 'Alimentación', 'Moda y ropa',
    'Belleza y cuidado personal', 'Salud y bienestar', 'Educación',
    'Entretenimiento', 'Inmobiliaria', 'Construcción', 'Finanzas',
    'Marketing y publicidad', 'Transporte y logística', 'Arte y diseño', 'Otro'
  ];

  editForm: FormGroup = this.fb.group({
    business_name: ['', [Validators.maxLength(80)]],
    description:   ['', [Validators.maxLength(500)]],
    category:      [''],
    website:       ['', [Validators.maxLength(200)]],
    whatsapp:      ['', [Validators.maxLength(20)]],
    location:      ['', [Validators.maxLength(100)]],
  });

  // ── Init ─────────────────────────────────────────────────────
  ngOnInit(): void {
    const userId = this.route.snapshot.paramMap.get('userId');
    if (userId) this.loadProfile(userId);
    else this.error.set('Perfil no encontrado');
  }

  async loadProfile(userId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [card, biz] = await Promise.all([
        this.socialService.getUserProfile(userId),
        this.socialService.getBusinessProfile(userId),
      ]);
      if (!card) { this.error.set('Perfil no encontrado'); return; }
      this.card.set(card);
      this.business.set(biz);
    } catch {
      this.error.set('Error al cargar el perfil');
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  // ── Panel edición ─────────────────────────────────────────────
  openEditPanel(): void {
    const biz = this.business();
    const c = this.card();
    this.editForm.patchValue({
      business_name: biz?.business_name ?? c?.business_name ?? '',
      description:   biz?.description ?? c?.description ?? '',
      category:      biz?.category ?? c?.category ?? '',
      website:       biz?.website ?? '',
      whatsapp:      biz?.whatsapp ?? '',
      location:      biz?.location ?? c?.location ?? '',
    });
    this.bannerPreview.set(biz?.banner_url ?? null);
    this.showEditPanel.set(true);
  }

  closeEditPanel(): void {
    this.showEditPanel.set(false);
    this.bannerPreview.set(null);
  }

  async onBannerSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.showToast('La imagen no puede superar 5 MB', 'error');
      return;
    }
    this.uploadingBanner.set(true);
    this.cdr.markForCheck();
    try {
      const result = await this.storageService.uploadImage(
        this.storageService.BANNERS_BUCKET, file, 'social-banners'
      );
      if (result.success && result.url) {
        this.bannerPreview.set(result.url);
      } else {
        this.showToast(result.error ?? 'Error al subir la imagen', 'error');
      }
    } finally {
      this.uploadingBanner.set(false);
      this.cdr.markForCheck();
    }
  }

  async saveProfile(): Promise<void> {
    if (this.editForm.invalid || this.saving()) return;
    this.saving.set(true);
    this.cdr.markForCheck();
    try {
      const values = this.editForm.value;
      const payload: Partial<SocialBusinessProfile> = {
        business_name: values.business_name?.trim() || null,
        description:   values.description?.trim()   || null,
        category:      values.category              || null,
        website:       values.website?.trim()        || null,
        whatsapp:      values.whatsapp?.trim()       || null,
        location:      values.location?.trim()       || null,
        banner_url:    this.bannerPreview()          ?? this.business()?.banner_url ?? null,
      };
      await this.socialService.upsertBusinessProfile(payload);

      // Actualizar estado local
      this.business.update(prev => ({
        ...(prev ?? { user_id: '', created_at: '', updated_at: '' }),
        ...payload,
        updated_at: new Date().toISOString(),
      } as SocialBusinessProfile));
      this.card.update(prev => prev ? {
        ...prev,
        business_name: payload.business_name ?? null,
        description:   payload.description ?? null,
        category:      payload.category ?? null,
        location:      payload.location ?? null,
      } : null);

      this.showToast('Perfil actualizado correctamente', 'success');
      this.closeEditPanel();
    } catch {
      this.showToast('Error al guardar los cambios', 'error');
    } finally {
      this.saving.set(false);
      this.cdr.markForCheck();
    }
  }

  // ── Conexiones ────────────────────────────────────────────────
  async sendRequest(): Promise<void> {
    const c = this.card();
    if (!c) return;
    this.actionLoading.set(true);
    try {
      await this.socialService.sendConnectionRequest(c.id);
      this.card.update(prev => prev ? { ...prev, connection_status: 'pending', is_requester: true } : null);
      this.showToast('Solicitud de conexión enviada', 'success');
    } catch {
      this.showToast('Error al enviar la solicitud', 'error');
    } finally {
      this.actionLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  async acceptRequest(): Promise<void> {
    const c = this.card();
    if (!c?.connection_id) return;
    this.actionLoading.set(true);
    try {
      await this.socialService.respondToRequest(c.connection_id, true);
      this.card.update(prev => prev ? { ...prev, connection_status: 'accepted' } : null);
      this.showToast('¡Conexión aceptada!', 'success');
    } catch {
      this.showToast('Error al aceptar la solicitud', 'error');
    } finally {
      this.actionLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  async openChat(): Promise<void> {
    const c = this.card();
    if (!c) return;
    this.actionLoading.set(true);
    try {
      const convId = await this.socialService.getOrCreateConversation(c.id);
      this.router.navigate(['/social/messages', convId]);
    } catch {
      this.showToast('Error al abrir el chat', 'error');
      this.actionLoading.set(false);
    }
  }

  goBack(): void { history.back(); }

  // ── Helpers ───────────────────────────────────────────────────
  private showToast(message: string, type: 'success' | 'error'): void {
    this.toast.set({ message, type });
    setTimeout(() => { this.toast.set(null); this.cdr.markForCheck(); }, 3500);
  }

  getRoleLabel(role: string): string {
    return role === 'admin' ? 'Admin' : role === 'dev' ? 'Dev' : 'Anunciante';
  }

  getRoleBadgeClass(role: string): string {
    return role === 'admin'
      ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
      : role === 'dev'
      ? 'bg-violet-500/10 border-violet-500/20 text-violet-400'
      : 'bg-accent/10 border-accent/20 text-accent';
  }

  getGradientClasses(role: string): string {
    return role === 'admin'
      ? 'from-blue-700 to-blue-400'
      : role === 'dev'
      ? 'from-violet-700 to-violet-400'
      : 'from-accent to-primary';
  }

  getInitials(fullName: string | null, username: string): string {
    if (fullName?.trim()) {
      const parts = fullName.trim().split(' ');
      return parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : fullName.slice(0, 2).toUpperCase();
    }
    return username.slice(0, 2).toUpperCase();
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'long' });
  }

  formatWebsite(url: string | null): string {
    if (!url) return '';
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  formatWhatsapp(num: string | null): string {
    if (!num) return '';
    return num.startsWith('+') ? num : `+${num}`;
  }

  charCount(field: string): number {
    return this.editForm.get(field)?.value?.length ?? 0;
  }
}
