import {
  Component, OnInit, OnDestroy, signal, inject, ChangeDetectionStrategy,
  ViewChild, ElementRef, AfterViewChecked, PLATFORM_ID, HostListener
} from '@angular/core';
import { CommonModule, NgClass, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SocialService } from '../../../../core/services/social.service';
import { ProfileService } from '../../../../core/services/profile.service';
import type { SocialConversation, SocialMessage } from '../../../../core/models/social.model';

@Component({
  selector: 'app-social-messages',
  standalone: true,
  imports: [CommonModule, NgClass, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './messages.component.html',
})
export class SocialMessagesComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesEnd') private messagesEnd!: ElementRef;

  private readonly socialService = inject(SocialService);
  private readonly profileService = inject(ProfileService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly profile = this.profileService.profile;

  conversations = signal<SocialConversation[]>([]);
  messages = signal<SocialMessage[]>([]);
  activeConversation = signal<SocialConversation | null>(null);
  activeConvId = signal<string | null>(null);

  loadingConvs = signal(true);
  loadingMsgs = signal(false);
  sending = signal(false);
  messageText = '';
  isMobile = signal(isPlatformBrowser(inject(PLATFORM_ID)) ? window.innerWidth < 768 : false);

  @HostListener('window:resize')
  onResize(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.isMobile.set(window.innerWidth < 768);
    }
  }

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private shouldScrollBottom = false;

  ngOnInit(): void {
    this.loadConversations();
    // Leer conversationId de la URL si viene navegado
    this.route.paramMap.subscribe(params => {
      const convId = params.get('convId');
      if (convId) this.selectConversationById(convId);
    });

    if (isPlatformBrowser(this.platformId)) {
      this.pollInterval = setInterval(() => {
        this.loadConversations(false);
        if (this.activeConvId()) this.pollMessages();
      }, 5000);
    }
  }

  ngOnDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollBottom) {
      this.scrollToBottom();
      this.shouldScrollBottom = false;
    }
  }

  async loadConversations(setLoading = true): Promise<void> {
    if (setLoading) this.loadingConvs.set(true);
    try {
      const convs = await this.socialService.getConversations();
      this.conversations.set(convs);
      // Si hay un convId activo, actualizar la conversación activa
      const id = this.activeConvId();
      if (id) {
        const updated = convs.find(c => c.id === id);
        if (updated) this.activeConversation.set(updated);
      }
    } catch {} finally {
      if (setLoading) this.loadingConvs.set(false);
    }
  }

  async selectConversationById(convId: string): Promise<void> {
    this.activeConvId.set(convId);
    this.router.navigate(['/social/messages', convId], { replaceUrl: true });
    const existing = this.conversations().find(c => c.id === convId);
    if (existing) this.activeConversation.set(existing);
    await this.loadMessages(convId);
  }

  async selectConversation(conv: SocialConversation): Promise<void> {
    this.activeConversation.set(conv);
    this.activeConvId.set(conv.id);
    this.router.navigate(['/social/messages', conv.id], { replaceUrl: true });
    await this.loadMessages(conv.id);
    // Marcar como leído
    this.socialService.markConversationAsRead(conv.id).catch(() => {});
    this.conversations.update(list =>
      list.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c)
    );
  }

  async loadMessages(convId: string): Promise<void> {
    this.loadingMsgs.set(true);
    try {
      const msgs = await this.socialService.getMessages(convId);
      this.messages.set(msgs);
      this.shouldScrollBottom = true;
    } catch {} finally {
      this.loadingMsgs.set(false);
    }
  }

  private async pollMessages(): Promise<void> {
    const convId = this.activeConvId();
    if (!convId) return;
    try {
      const msgs = await this.socialService.getMessages(convId);
      const current = this.messages();
      if (msgs.length !== current.length) {
        this.messages.set(msgs);
        this.shouldScrollBottom = true;
        this.socialService.markConversationAsRead(convId).catch(() => {});
      }
    } catch {}
  }

  async sendMessage(): Promise<void> {
    const text = this.messageText.trim();
    const convId = this.activeConvId();
    if (!text || !convId || this.sending()) return;

    this.sending.set(true);
    this.messageText = '';
    try {
      const msg = await this.socialService.sendMessage(convId, text);
      this.messages.update(list => [...list, msg]);
      this.shouldScrollBottom = true;
      await this.loadConversations(false);
    } catch {
      this.messageText = text;
    } finally {
      this.sending.set(false);
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(): void {
    try {
      this.messagesEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
    } catch {}
  }

  isMyMessage(msg: SocialMessage): boolean {
    return msg.sender_id === this.profile()?.id;
  }

  formatTime(date: string): string {
    return new Date(date).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  formatConvDate(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'ahora';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  getInitials(name: string | null, username: string): string {
    return (name || username || '?').slice(0, 2).toUpperCase();
  }
}
