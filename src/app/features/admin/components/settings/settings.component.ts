import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { StorageService } from '../../../../core/services/storage.service';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
})
export class AdminSettingsComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly storageService = inject(StorageService);

  readonly profile = this.profileService.profile;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly uploadingAvatar = signal(false);
  readonly successMsg = signal<string | null>(null);
  readonly errorMsg = signal<string | null>(null);
  readonly avatarPreview = signal<string | null>(null);
  readonly copied = signal(false);

  readonly fullName = signal('');

  async ngOnInit(): Promise<void> {
    const p = await this.profileService.getCurrentProfile();
    if (p) {
      this.fullName.set(p.full_name ?? '');
    }
    this.loading.set(false);
  }

  async onAvatarChange(event: Event): Promise<void> {
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

    const reader = new FileReader();
    reader.onload = (e) => this.avatarPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);

    this.uploadingAvatar.set(true);
    this.clearMessages();

    const result = await this.storageService.uploadProfileImage(file);
    this.uploadingAvatar.set(false);

    if (!result.success || !result.url) {
      this.showError('Error al subir la imagen. Intenta de nuevo.');
      this.avatarPreview.set(null);
      return;
    }

    const updated = await this.profileService.updateProfile({ avatar_url: result.url });
    if (updated) {
      this.avatarPreview.set(null);
      this.showSuccess('Foto de perfil actualizada.');
    } else {
      this.showError('Error al guardar la imagen.');
    }

    input.value = '';
  }

  async saveProfile(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.clearMessages();

    const updated = await this.profileService.updateProfile({
      full_name: this.fullName().trim() || undefined,
    });

    this.saving.set(false);
    if (updated) {
      this.showSuccess('Perfil actualizado correctamente.');
    } else {
      this.showError('Error al guardar los cambios. Intenta de nuevo.');
    }
  }

  get currentAvatar(): string | null {
    return this.avatarPreview() ?? this.profile()?.avatar_url ?? null;
  }

  get initials(): string {
    const name = this.profile()?.full_name || this.profile()?.username || '?';
    return name.slice(0, 2).toUpperCase();
  }

  async copyReferralCode(): Promise<void> {
    const code = this.profile()?.referral_code;
    if (!code) return;
    await navigator.clipboard.writeText(code);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  private showSuccess(msg: string): void {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(null), 4000);
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
