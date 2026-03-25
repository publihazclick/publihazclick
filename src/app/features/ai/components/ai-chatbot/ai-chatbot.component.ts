import {
  Component,
  inject,
  signal,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  ChangeDetectionStrategy,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getSupabaseClient } from '../../../../core/supabase.client';
import { environment } from '../../../../../environments/environment';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

type ChatState = 'idle' | 'loading' | 'error';

@Component({
  selector: 'app-ai-chatbot',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col h-full space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center flex-shrink-0"
          >
            <span class="material-symbols-outlined text-white" style="font-size:24px"
              >auto_awesome</span
            >
          </div>
          <div>
            <h1 class="text-xl font-black text-white">PubliBot</h1>
            <p class="text-xs text-violet-400 font-medium">Asistente de contenido IA</p>
          </div>
        </div>
        <button
          (click)="clearChat()"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-all"
          title="Limpiar conversación"
        >
          <span class="material-symbols-outlined" style="font-size:16px">delete_sweep</span>
          Limpiar
        </button>
      </div>

      <!-- Chat area -->
      <div
        class="bg-card-dark border border-white/10 rounded-xl flex flex-col overflow-hidden"
        style="height: 60vh; min-height: 400px"
      >
        <!-- Messages -->
        <div #messagesContainer class="flex-1 overflow-y-auto p-4 space-y-4">
          @for (msg of messages(); track msg.timestamp) {
            <div
              class="flex gap-3"
              [class.flex-row-reverse]="msg.role === 'user'"
              [class.flex-row]="msg.role === 'model'"
            >
              <!-- Avatar -->
              @if (msg.role === 'model') {
                <div
                  class="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center flex-shrink-0 mt-1"
                >
                  <span class="material-symbols-outlined text-white" style="font-size:16px"
                    >auto_awesome</span
                  >
                </div>
              } @else {
                <div
                  class="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0 mt-1"
                >
                  <span class="material-symbols-outlined text-slate-300" style="font-size:16px"
                    >person</span
                  >
                </div>
              }

              <!-- Bubble -->
              <div class="max-w-[75%] flex flex-col gap-1" [class.items-end]="msg.role === 'user'">
                <div
                  class="px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                  [class.rounded-tl-sm]="msg.role === 'model'"
                  [class.rounded-tr-sm]="msg.role === 'user'"
                  [class.bg-gradient-to-br]="msg.role === 'model'"
                  [class.from-violet-600]="msg.role === 'model'"
                  [class.to-fuchsia-700]="msg.role === 'model'"
                  [class.text-white]="msg.role === 'model'"
                  [class.bg-white]="msg.role === 'user'"
                  [class.text-slate-900]="msg.role === 'user'"
                >
                  {{ msg.text }}
                </div>
                <span class="text-[10px] text-slate-600 px-1">
                  {{ msg.timestamp | date: 'HH:mm' }}
                </span>
              </div>
            </div>
          }

          <!-- Typing indicator -->
          @if (state() === 'loading') {
            <div class="flex gap-3">
              <div
                class="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center flex-shrink-0"
              >
                <span class="material-symbols-outlined text-white" style="font-size:16px"
                  >auto_awesome</span
                >
              </div>
              <div
                class="bg-gradient-to-br from-violet-600 to-fuchsia-700 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5"
              >
                <span class="w-2 h-2 bg-white/70 rounded-full animate-bounce" style="animation-delay:0ms"></span>
                <span class="w-2 h-2 bg-white/70 rounded-full animate-bounce" style="animation-delay:150ms"></span>
                <span class="w-2 h-2 bg-white/70 rounded-full animate-bounce" style="animation-delay:300ms"></span>
              </div>
            </div>
          }
        </div>

        <!-- Quick suggestions -->
        @if (messages().length <= 1) {
          <div class="border-t border-white/10 px-4 py-3">
            <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">
              Sugerencias
            </p>
            <div class="flex flex-wrap gap-2">
              @for (s of suggestions; track s) {
                <button
                  (click)="sendSuggestion(s)"
                  [disabled]="state() === 'loading'"
                  class="px-3 py-1.5 text-xs font-medium text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 rounded-full transition-all disabled:opacity-50"
                >
                  {{ s }}
                </button>
              }
            </div>
          </div>
        }

        <!-- Input bar -->
        <div class="border-t border-white/10 p-3 flex gap-2">
          <textarea
            #inputField
            [(ngModel)]="inputText"
            (keydown.enter)="onEnterKey($any($event))"
            [disabled]="state() === 'loading'"
            placeholder="Escribe tu mensaje... (Enter para enviar, Shift+Enter para nueva línea)"
            rows="1"
            class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all resize-none disabled:opacity-50"
            style="max-height: 120px; overflow-y: auto"
          ></textarea>
          <button
            (click)="sendMessage()"
            [disabled]="!inputText.trim() || state() === 'loading'"
            class="w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0 self-end"
          >
            <span class="material-symbols-outlined" style="font-size:20px">send</span>
          </button>
        </div>
      </div>

      <!-- Error toast -->
      @if (errorMsg()) {
        <div
          class="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
        >
          <span class="material-symbols-outlined flex-shrink-0" style="font-size:18px">error</span>
          <span>{{ errorMsg() }}</span>
          <button (click)="errorMsg.set('')" class="ml-auto text-red-400 hover:text-red-300">
            <span class="material-symbols-outlined" style="font-size:18px">close</span>
          </button>
        </div>
      }
    </div>
  `,
})
export class AiChatbotComponent implements AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase = getSupabaseClient();
  private shouldScroll = false;

  readonly messages = signal<ChatMessage[]>([
    {
      role: 'model',
      text: '¡Hola! Soy PubliBot 🤖 Tu asistente de contenido IA. Estoy aquí para ayudarte con estrategias de marketing, prompts para imágenes y videos, copy para redes sociales y mucho más. ¿En qué te puedo ayudar hoy?',
      timestamp: new Date(),
    },
  ]);

  readonly state = signal<ChatState>('idle');
  readonly errorMsg = signal('');

  inputText = '';

  readonly suggestions = [
    'Ideas para imagen IA',
    'Prompt para video viral',
    'Cómo crear contenido que vende',
    'Estrategia de reels para mi negocio',
    'Mejores voces para mi nicho',
  ];

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  private scrollToBottom(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch {
      // ignore
    }
  }

  onEnterKey(event: KeyboardEvent): void {
    if (!event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  sendSuggestion(text: string): void {
    this.inputText = text;
    this.sendMessage();
  }

  async sendMessage(): Promise<void> {
    const text = this.inputText.trim();
    if (!text || this.state() === 'loading') return;

    this.inputText = '';
    this.errorMsg.set('');

    const userMsg: ChatMessage = { role: 'user', text, timestamp: new Date() };
    this.messages.update((msgs) => [...msgs, userMsg]);
    this.shouldScroll = true;
    this.state.set('loading');

    try {
      const { data: sessionData } = await this.supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('No hay sesión activa');

      // Build history (exclude welcome message)
      const history = this.messages()
        .slice(1, -1) // skip welcome + current user msg
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch(`${environment.supabase.url}/functions/v1/chat-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: environment.supabase.anonKey,
        },
        body: JSON.stringify({ message: text, history }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al contactar al asistente');
      }

      const botMsg: ChatMessage = {
        role: 'model',
        text: data.reply,
        timestamp: new Date(),
      };
      this.messages.update((msgs) => [...msgs, botMsg]);
      this.shouldScroll = true;
      this.state.set('idle');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      this.errorMsg.set(message);
      this.state.set('error');
      // Reset to idle after showing error
      setTimeout(() => this.state.set('idle'), 100);
    }
  }

  clearChat(): void {
    this.messages.set([
      {
        role: 'model',
        text: '¡Hola! Soy PubliBot 🤖 Tu asistente de contenido IA. ¿En qué te puedo ayudar hoy?',
        timestamp: new Date(),
      },
    ]);
    this.errorMsg.set('');
    this.state.set('idle');
  }
}
