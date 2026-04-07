import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getSupabaseClient } from '../../../../core/supabase.client';
import { ProfileService } from '../../../../core/services/profile.service';

interface Broadcast {
  id: string;
  title: string;
  message: string;
  type: string;
  recipient_count: number;
  expires_at: string;
  created_at: string;
}

@Component({
  selector: 'app-admin-broadcasts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './broadcasts.component.html',
})
export class AdminBroadcastsComponent implements OnInit {
  private readonly supabase = getSupabaseClient();
  private readonly profileService = inject(ProfileService);

  readonly broadcasts = signal<Broadcast[]>([]);
  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly deleting = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);
  readonly errorMsg = signal<string | null>(null);

  // Form
  title = '';
  message = '';
  type = 'info';
  expiresDays = 3;

  async ngOnInit(): Promise<void> {
    await this.loadBroadcasts();
    this.loading.set(false);
  }

  private async loadBroadcasts(): Promise<void> {
    const { data } = await this.supabase
      .from('admin_broadcasts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) this.broadcasts.set(data);
  }

  async sendBroadcast(): Promise<void> {
    if (!this.title.trim() || !this.message.trim()) return;
    this.sending.set(true);
    this.errorMsg.set(null);

    try {
      const profile = this.profileService.profile();
      const { data, error } = await this.supabase.rpc('send_broadcast_notification', {
        p_title: this.title.trim(),
        p_message: this.message.trim(),
        p_type: this.type,
        p_sent_by: profile?.id ?? null,
        p_expires_days: this.expiresDays,
      });

      if (error) throw error;

      const recipients = data?.recipients ?? 0;
      this.successMsg.set(`Mensaje enviado a ${recipients} usuarios`);
      this.title = '';
      this.message = '';
      this.type = 'info';
      this.expiresDays = 3;
      await this.loadBroadcasts();
      setTimeout(() => this.successMsg.set(null), 4000);
    } catch (e: any) {
      this.errorMsg.set(e.message || 'Error al enviar');
    } finally {
      this.sending.set(false);
    }
  }

  async deleteBroadcast(id: string): Promise<void> {
    this.deleting.set(id);
    await this.supabase.rpc('delete_broadcast', { p_broadcast_id: id });
    this.broadcasts.update(list => list.filter(b => b.id !== id));
    this.deleting.set(null);
    this.successMsg.set('Mensaje eliminado');
    setTimeout(() => this.successMsg.set(null), 2000);
  }

  async cleanupExpired(): Promise<void> {
    const { data } = await this.supabase.rpc('cleanup_expired_notifications');
    this.successMsg.set(`${data ?? 0} notificaciones expiradas eliminadas`);
    await this.loadBroadcasts();
    setTimeout(() => this.successMsg.set(null), 3000);
  }

  isExpired(expiresAt: string): boolean {
    return new Date(expiresAt) < new Date();
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  timeLeft(expiresAt: string): string {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expirado';
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}h restantes`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h restantes`;
  }
}
