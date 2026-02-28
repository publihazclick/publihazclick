import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  ChangeDetectionStrategy,
  PLATFORM_ID,
  ElementRef,
  ViewChildren,
  QueryList,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SocialService } from '../../../../core/services/social.service';
import { ProfileService } from '../../../../core/services/profile.service';
import type { SocialConversation, SocialMessage } from '../../../../core/models/social.model';

interface OpenChat {
  conversation: SocialConversation;
  messages: SocialMessage[];
  loading: boolean;
  sending: boolean;
  messageText: string;
  minimized: boolean;
  scrollNeeded: boolean;
}

@Component({
  selector: 'app-floating-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- FAB Button -->
    <button
      (click)="togglePanel()"
      class="fixed bottom-5 right-5 z-[60] w-14 h-14 rounded-full bg-primary text-black shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
      [class.ring-2]="showPanel()"
      [class.ring-white/20]="showPanel()"
    >
      <span class="material-symbols-outlined text-2xl">{{ showPanel() ? 'close' : 'chat' }}</span>
      @if (unreadTotal() > 0 && !showPanel()) {
        <span class="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-accent text-white text-[10px] font-black flex items-center justify-center px-1 shadow-lg">
          {{ unreadTotal() > 99 ? '99+' : unreadTotal() }}
        </span>
      }
    </button>

    <!-- Conversations Panel -->
    @if (showPanel()) {
      <div class="fixed bottom-20 right-5 z-[60] w-[340px] max-h-[480px] bg-zinc-900 rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden
                  max-md:left-3 max-md:right-3 max-md:w-auto max-md:bottom-20 max-md:max-h-[70vh]">
        <!-- Panel header -->
        <div class="px-4 py-3 border-b border-white/10 flex items-center gap-2">
          <span class="material-symbols-outlined text-primary" style="font-size:20px">chat</span>
          <h3 class="text-sm font-black text-white flex-1">Mensajes</h3>
          <span class="text-[10px] text-slate-500 font-medium">{{ conversations().length }} chats</span>
        </div>

        <!-- Search -->
        <div class="px-3 py-2 border-b border-white/5">
          <div class="relative">
            <span class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" style="font-size:16px">search</span>
            <input
              type="text"
              [(ngModel)]="searchQuery"
              placeholder="Buscar conversación..."
              class="w-full bg-white/5 border border-white/5 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary/30"
            />
          </div>
        </div>

        <!-- Conversations list -->
        <div class="flex-1 overflow-y-auto overscroll-contain">
          @if (loadingConvs()) {
            <div class="flex items-center justify-center py-10">
              <div class="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          } @else if (filteredConversations().length === 0) {
            <div class="text-center py-10 px-4">
              <span class="material-symbols-outlined text-slate-600 mb-2 block" style="font-size:32px">forum</span>
              <p class="text-xs text-slate-500">{{ searchQuery ? 'Sin resultados' : 'No hay conversaciones' }}</p>
            </div>
          } @else {
            @for (conv of filteredConversations(); track conv.id) {
              <button
                (click)="openChat(conv)"
                class="w-full flex items-center gap-3 px-3 py-3 hover:bg-white/5 transition-all border-b border-white/5 last:border-b-0 text-left"
              >
                <!-- Avatar -->
                <div class="relative flex-shrink-0">
                  <div class="w-10 h-10 rounded-full overflow-hidden border-2 border-white/10">
                    @if (conv.other_user.avatar_url) {
                      <img [src]="conv.other_user.avatar_url" alt="" class="w-full h-full object-cover" />
                    } @else {
                      <div class="w-full h-full bg-gradient-to-tr from-primary to-cyan-400 flex items-center justify-center">
                        <span class="text-black font-black text-xs">{{ getInitials(conv.other_user.full_name, conv.other_user.username || '') }}</span>
                      </div>
                    }
                  </div>
                  @if ((conv.unread_count ?? 0) > 0) {
                    <span class="absolute -top-0.5 -right-0.5 w-3 h-3 bg-accent rounded-full border-2 border-zinc-900"></span>
                  }
                </div>

                <!-- Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-bold text-white truncate" [class.text-primary]="(conv.unread_count ?? 0) > 0">
                      {{ conv.other_user.full_name || conv.other_user.username }}
                    </span>
                    @if (conv.last_message_at) {
                      <span class="text-[10px] text-slate-500 flex-shrink-0">{{ formatConvDate(conv.last_message_at) }}</span>
                    }
                  </div>
                  @if (conv.last_message) {
                    <p class="text-[11px] text-slate-400 truncate mt-0.5" [class.text-slate-300]="(conv.unread_count ?? 0) > 0" [class.font-semibold]="(conv.unread_count ?? 0) > 0">
                      {{ conv.last_message }}
                    </p>
                  }
                </div>

                <!-- Unread badge -->
                @if ((conv.unread_count ?? 0) > 0) {
                  <span class="min-w-[18px] h-[18px] rounded-full bg-accent text-white text-[9px] font-black flex items-center justify-center px-1 flex-shrink-0">
                    {{ conv.unread_count }}
                  </span>
                }
              </button>
            }
          }
        </div>
      </div>
    }

    <!-- Minimized chat avatars -->
    @for (chat of minimizedChats(); track chat.conversation.id; let i = $index) {
      <button
        (click)="restoreChat(chat)"
        class="fixed bottom-5 z-[60] w-12 h-12 rounded-full overflow-hidden border-2 border-primary/40 shadow-lg shadow-primary/20 hover:scale-110 active:scale-95 transition-all"
        [style.right.px]="80 + i * 56"
      >
        @if (chat.conversation.other_user.avatar_url) {
          <img [src]="chat.conversation.other_user.avatar_url" alt="" class="w-full h-full object-cover" />
        } @else {
          <div class="w-full h-full bg-gradient-to-tr from-primary to-cyan-400 flex items-center justify-center">
            <span class="text-black font-black text-xs">{{ getInitials(chat.conversation.other_user.full_name, chat.conversation.other_user.username || '') }}</span>
          </div>
        }
        @if (chatUnreadCount(chat) > 0) {
          <span class="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-accent text-white text-[8px] font-black flex items-center justify-center px-0.5">
            {{ chatUnreadCount(chat) }}
          </span>
        }
      </button>
    }

    <!-- Open chat windows -->
    @for (chat of visibleChats(); track chat.conversation.id; let i = $index) {
      <div
        class="fixed bottom-5 z-[60] bg-zinc-900 rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden
               max-md:left-2 max-md:right-2 max-md:bottom-0 max-md:top-14 max-md:rounded-t-2xl max-md:rounded-b-none max-md:w-auto"
        [class]="isMobile() ? '' : 'w-[320px] h-[420px]'"
        [style.right.px]="isMobile() ? undefined : (80 + i * 336)"
      >
        <!-- Chat header -->
        <div class="px-3 py-2.5 border-b border-white/10 flex items-center gap-2 bg-zinc-900/95 backdrop-blur-sm flex-shrink-0">
          <div class="w-8 h-8 rounded-full overflow-hidden border border-white/10 flex-shrink-0">
            @if (chat.conversation.other_user.avatar_url) {
              <img [src]="chat.conversation.other_user.avatar_url" alt="" class="w-full h-full object-cover" />
            } @else {
              <div class="w-full h-full bg-gradient-to-tr from-primary to-cyan-400 flex items-center justify-center">
                <span class="text-black font-black text-[10px]">{{ getInitials(chat.conversation.other_user.full_name, chat.conversation.other_user.username || '') }}</span>
              </div>
            }
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-bold text-white truncate">{{ chat.conversation.other_user.full_name || chat.conversation.other_user.username }}</p>
            <p class="text-[10px] text-slate-500 truncate">@{{ chat.conversation.other_user.username }}</p>
          </div>
          <button (click)="minimizeChat(chat)" class="p-1 hover:bg-white/10 rounded-lg transition-all" title="Minimizar">
            <span class="material-symbols-outlined text-slate-400 hover:text-white" style="font-size:18px">remove</span>
          </button>
          <button (click)="closeChat(chat)" class="p-1 hover:bg-white/10 rounded-lg transition-all" title="Cerrar">
            <span class="material-symbols-outlined text-slate-400 hover:text-white" style="font-size:18px">close</span>
          </button>
        </div>

        <!-- Messages area -->
        <div
          class="flex-1 overflow-y-auto overscroll-contain px-3 py-2 space-y-2"
          #chatScroll
        >
          @if (chat.loading) {
            <div class="flex items-center justify-center py-10">
              <div class="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          } @else if (chat.messages.length === 0) {
            <div class="text-center py-10">
              <span class="material-symbols-outlined text-slate-600 mb-1 block" style="font-size:28px">waving_hand</span>
              <p class="text-[11px] text-slate-500">Inicia la conversación</p>
            </div>
          } @else {
            @for (msg of chat.messages; track msg.id) {
              <div class="flex" [class.justify-end]="isMyMessage(msg)">
                <div
                  class="max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed"
                  [class]="isMyMessage(msg) ? 'bg-primary/20 text-primary rounded-br-sm' : 'bg-white/5 text-slate-200 rounded-bl-sm'"
                >
                  <p class="break-words whitespace-pre-wrap">{{ msg.content }}</p>
                  <p class="text-[9px] mt-1 opacity-50 text-right">{{ formatTime(msg.created_at) }}</p>
                </div>
              </div>
            }
          }
          <div #chatScrollAnchor></div>
        </div>

        <!-- Input area -->
        <div class="px-3 py-2 border-t border-white/10 flex items-center gap-2 flex-shrink-0 bg-zinc-900">
          <input
            type="text"
            [(ngModel)]="chat.messageText"
            (keydown)="onChatKeyDown($event, chat)"
            placeholder="Escribe un mensaje..."
            class="flex-1 bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary/30"
            [disabled]="chat.sending"
          />
          <button
            (click)="sendChatMessage(chat)"
            [disabled]="!chat.messageText.trim() || chat.sending"
            class="w-8 h-8 rounded-full bg-primary text-black flex items-center justify-center hover:bg-primary/80 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          >
            <span class="material-symbols-outlined" style="font-size:16px">send</span>
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class FloatingChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChildren('chatScrollAnchor') private scrollAnchors!: QueryList<ElementRef>;

  private readonly socialService = inject(SocialService);
  private readonly profileService = inject(ProfileService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly profile = this.profileService.profile;

  showPanel = signal(false);
  conversations = signal<SocialConversation[]>([]);
  openChats = signal<OpenChat[]>([]);
  loadingConvs = signal(true);
  unreadTotal = signal(0);
  searchQuery = '';
  isMobile = signal(isPlatformBrowser(this.platformId) ? window.innerWidth < 768 : false);

  private convPollInterval: ReturnType<typeof setInterval> | null = null;
  private msgPollInterval: ReturnType<typeof setInterval> | null = null;
  private pendingScrollIds = new Set<string>();

  readonly filteredConversations = computed(() => {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) return this.conversations();
    return this.conversations().filter(c => {
      const name = (c.other_user.full_name || '').toLowerCase();
      const user = (c.other_user.username || '').toLowerCase();
      return name.includes(q) || user.includes(q);
    });
  });

  readonly visibleChats = computed(() => {
    return this.openChats().filter(c => !c.minimized);
  });

  readonly minimizedChats = computed(() => {
    return this.openChats().filter(c => c.minimized);
  });

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.loadConversations();
    this.loadUnreadCount();

    this.convPollInterval = setInterval(() => {
      this.loadConversations(false);
      this.loadUnreadCount();
    }, 15000);

    this.msgPollInterval = setInterval(() => {
      this.pollOpenChatMessages();
    }, 5000);

    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    if (this.convPollInterval) clearInterval(this.convPollInterval);
    if (this.msgPollInterval) clearInterval(this.msgPollInterval);
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('resize', this.onResize);
    }
  }

  ngAfterViewChecked(): void {
    if (this.pendingScrollIds.size > 0 && this.scrollAnchors) {
      const anchors = this.scrollAnchors.toArray();
      const chats = this.visibleChats();
      for (let i = 0; i < chats.length; i++) {
        if (this.pendingScrollIds.has(chats[i].conversation.id) && anchors[i]) {
          anchors[i].nativeElement.scrollIntoView({ behavior: 'auto' });
          this.pendingScrollIds.delete(chats[i].conversation.id);
        }
      }
    }
  }

  private onResize = (): void => {
    this.isMobile.set(window.innerWidth < 768);
  };

  togglePanel(): void {
    this.showPanel.update(v => !v);
    if (this.showPanel()) this.loadConversations();
  }

  async loadConversations(setLoading = true): Promise<void> {
    if (setLoading) this.loadingConvs.set(true);
    try {
      const convs = await this.socialService.getConversations();
      this.conversations.set(convs);
    } catch {
    } finally {
      if (setLoading) this.loadingConvs.set(false);
    }
  }

  async loadUnreadCount(): Promise<void> {
    try {
      const count = await this.socialService.getUnreadMessagesCount();
      this.unreadTotal.set(count);
    } catch {}
  }

  async openChat(conv: SocialConversation): Promise<void> {
    this.showPanel.set(false);

    // If already open, bring to front / restore
    const existing = this.openChats().find(c => c.conversation.id === conv.id);
    if (existing) {
      if (existing.minimized) {
        this.openChats.update(list =>
          list.map(c =>
            c.conversation.id === conv.id ? { ...c, minimized: false } : c
          )
        );
      }
      return;
    }

    const maxOpen = this.isMobile() ? 1 : 3;
    let currentChats = this.openChats();

    // If at max, close the oldest non-minimized chat
    const visible = currentChats.filter(c => !c.minimized);
    if (visible.length >= maxOpen) {
      const toClose = visible[0];
      currentChats = currentChats.filter(
        c => c.conversation.id !== toClose.conversation.id
      );
    }

    const newChat: OpenChat = {
      conversation: conv,
      messages: [],
      loading: true,
      sending: false,
      messageText: '',
      minimized: false,
      scrollNeeded: false,
    };

    this.openChats.set([...currentChats, newChat]);

    // Load messages
    try {
      const msgs = await this.socialService.getMessages(conv.id);
      this.openChats.update(list =>
        list.map(c =>
          c.conversation.id === conv.id
            ? { ...c, messages: msgs, loading: false }
            : c
        )
      );
      this.pendingScrollIds.add(conv.id);
      // Mark as read
      this.socialService.markConversationAsRead(conv.id).catch(() => {});
      this.conversations.update(list =>
        list.map(c => (c.id === conv.id ? { ...c, unread_count: 0 } : c))
      );
      this.loadUnreadCount();
    } catch {
      this.openChats.update(list =>
        list.map(c =>
          c.conversation.id === conv.id ? { ...c, loading: false } : c
        )
      );
    }
  }

  minimizeChat(chat: OpenChat): void {
    this.openChats.update(list =>
      list.map(c =>
        c.conversation.id === chat.conversation.id
          ? { ...c, minimized: true }
          : c
      )
    );
  }

  restoreChat(chat: OpenChat): void {
    const maxOpen = this.isMobile() ? 1 : 3;
    const visible = this.openChats().filter(c => !c.minimized);

    if (visible.length >= maxOpen) {
      // Minimize the oldest visible
      const toMinimize = visible[0];
      this.openChats.update(list =>
        list.map(c => {
          if (c.conversation.id === toMinimize.conversation.id)
            return { ...c, minimized: true };
          if (c.conversation.id === chat.conversation.id)
            return { ...c, minimized: false };
          return c;
        })
      );
    } else {
      this.openChats.update(list =>
        list.map(c =>
          c.conversation.id === chat.conversation.id
            ? { ...c, minimized: false }
            : c
        )
      );
    }
    this.pendingScrollIds.add(chat.conversation.id);
  }

  closeChat(chat: OpenChat): void {
    this.openChats.update(list =>
      list.filter(c => c.conversation.id !== chat.conversation.id)
    );
  }

  async sendChatMessage(chat: OpenChat): Promise<void> {
    const text = chat.messageText.trim();
    if (!text || chat.sending) return;

    this.openChats.update(list =>
      list.map(c =>
        c.conversation.id === chat.conversation.id
          ? { ...c, sending: true, messageText: '' }
          : c
      )
    );

    try {
      const msg = await this.socialService.sendMessage(
        chat.conversation.id,
        text
      );
      this.openChats.update(list =>
        list.map(c =>
          c.conversation.id === chat.conversation.id
            ? { ...c, messages: [...c.messages, msg], sending: false }
            : c
        )
      );
      this.pendingScrollIds.add(chat.conversation.id);
      this.loadConversations(false);
    } catch {
      this.openChats.update(list =>
        list.map(c =>
          c.conversation.id === chat.conversation.id
            ? { ...c, sending: false, messageText: text }
            : c
        )
      );
    }
  }

  onChatKeyDown(event: KeyboardEvent, chat: OpenChat): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendChatMessage(chat);
    }
  }

  chatUnreadCount(chat: OpenChat): number {
    const conv = this.conversations().find(
      c => c.id === chat.conversation.id
    );
    return conv?.unread_count ?? 0;
  }

  private async pollOpenChatMessages(): Promise<void> {
    const chats = this.openChats();
    for (const chat of chats) {
      if (chat.loading) continue;
      try {
        const msgs = await this.socialService.getMessages(
          chat.conversation.id
        );
        if (msgs.length !== chat.messages.length) {
          this.openChats.update(list =>
            list.map(c =>
              c.conversation.id === chat.conversation.id
                ? { ...c, messages: msgs }
                : c
            )
          );
          if (!chat.minimized) {
            this.pendingScrollIds.add(chat.conversation.id);
            this.socialService
              .markConversationAsRead(chat.conversation.id)
              .catch(() => {});
          }
        }
      } catch {}
    }
  }

  isMyMessage(msg: SocialMessage): boolean {
    return msg.sender_id === this.profile()?.id;
  }

  formatTime(date: string): string {
    return new Date(date).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatConvDate(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'ahora';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000)
      return d.toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
      });
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  getInitials(name: string | null | undefined, username: string): string {
    return (name || username || '?').slice(0, 2).toUpperCase();
  }
}
