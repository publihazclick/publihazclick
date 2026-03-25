import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getSupabaseClient } from '../../../../core/supabase.client';
import { environment } from '../../../../../environments/environment';

interface VoiceOption {
  id: string;
  flag: string;
  name: string;
  gender: 'Masculino' | 'Femenino';
  country: string;
}

interface AudioEntry {
  id: number;
  text: string;
  voice: string;
  voiceName: string;
  audioUrl: string;
  timestamp: Date;
}

@Component({
  selector: 'app-ai-voz',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div>
        <h1 class="text-2xl lg:text-3xl font-black text-white">Voz IA</h1>
        <p class="text-sm text-slate-400 mt-1">
          Convierte texto a voz con voces naturales en español
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <!-- Main panel -->
        <div class="xl:col-span-2 space-y-5">
          <!-- Voice selector -->
          <div class="bg-card-dark border border-white/10 rounded-xl p-5">
            <h2 class="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <span class="material-symbols-outlined text-violet-400" style="font-size:18px"
                >record_voice_over</span
              >
              Selecciona una voz
            </h2>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              @for (voice of voices; track voice.id) {
                <button
                  (click)="selectedVoice.set(voice.id)"
                  class="flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center"
                  [class.border-violet-500]="selectedVoice() === voice.id"
                  [class.bg-violet-500\/10]="selectedVoice() === voice.id"
                  [class.border-white\/10]="selectedVoice() !== voice.id"
                  [class.bg-white\/5]="selectedVoice() !== voice.id"
                  [class.hover\:border-violet-500\/40]="selectedVoice() !== voice.id"
                >
                  <span class="text-2xl">{{ voice.flag }}</span>
                  <span
                    class="text-xs font-bold"
                    [class.text-violet-300]="selectedVoice() === voice.id"
                    [class.text-white]="selectedVoice() !== voice.id"
                    >{{ voice.name }}</span
                  >
                  <span
                    class="text-[10px]"
                    [class.text-violet-400]="selectedVoice() === voice.id"
                    [class.text-slate-500]="selectedVoice() !== voice.id"
                    >{{ voice.gender }}</span
                  >
                  @if (selectedVoice() === voice.id) {
                    <span
                      class="w-1.5 h-1.5 rounded-full bg-violet-400 mt-0.5"
                    ></span>
                  }
                </button>
              }
            </div>
          </div>

          <!-- Text input -->
          <div class="bg-card-dark border border-white/10 rounded-xl p-5">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-bold text-white flex items-center gap-2">
                <span class="material-symbols-outlined text-violet-400" style="font-size:18px"
                  >text_fields</span
                >
                Texto a convertir
              </h2>
              <span
                class="text-xs font-mono"
                [class.text-red-400]="textContent.length > 1800"
                [class.text-amber-400]="textContent.length > 1400 && textContent.length <= 1800"
                [class.text-slate-500]="textContent.length <= 1400"
              >
                {{ textContent.length }}/2000
              </span>
            </div>
            <textarea
              [(ngModel)]="textContent"
              [maxlength]="2000"
              [disabled]="isLoading()"
              placeholder="Escribe o pega aquí el texto que quieres convertir a voz. Por ejemplo: 'Hola, bienvenidos a mi canal. Hoy te voy a mostrar cómo ganar dinero desde casa con estas 5 estrategias probadas...'"
              rows="8"
              class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all resize-none disabled:opacity-50"
            ></textarea>

            <!-- Generate button -->
            <button
              (click)="generateAudio()"
              [disabled]="!canGenerate()"
              class="mt-4 w-full py-3 px-6 font-black text-sm rounded-xl transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
              [class.bg-gradient-to-r]="canGenerate()"
              [class.from-violet-600]="canGenerate()"
              [class.to-fuchsia-600]="canGenerate()"
              [class.text-white]="canGenerate()"
              [class.hover\:from-violet-500]="canGenerate()"
              [class.hover\:to-fuchsia-500]="canGenerate()"
              [class.shadow-lg]="canGenerate()"
              [class.shadow-violet-500\/25]="canGenerate()"
              [class.bg-white\/10]="!canGenerate()"
              [class.text-slate-500]="!canGenerate()"
              [class.cursor-not-allowed]="!canGenerate()"
            >
              @if (isLoading()) {
                <svg
                  class="animate-spin w-4 h-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  ></path>
                </svg>
                <span>Generando audio...</span>
              } @else {
                <span class="material-symbols-outlined" style="font-size:18px">mic</span>
                <span>Generar Audio</span>
              }
            </button>
          </div>

          <!-- Audio player result -->
          @if (currentAudioUrl()) {
            <div
              class="bg-card-dark border border-emerald-500/20 rounded-xl p-5 space-y-4 bg-emerald-500/5"
            >
              <div class="flex items-center gap-2">
                <span
                  class="material-symbols-outlined text-emerald-400"
                  style="font-size:20px"
                  >check_circle</span
                >
                <h3 class="text-sm font-bold text-emerald-300">
                  Audio generado con {{ selectedVoiceName() }}
                </h3>
              </div>

              <audio
                [src]="currentAudioUrl()!"
                controls
                class="w-full rounded-lg"
                style="accent-color: #8b5cf6"
              ></audio>

              <button
                (click)="downloadAudio()"
                class="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-all"
              >
                <span class="material-symbols-outlined" style="font-size:16px">download</span>
                Descargar MP3
              </button>
            </div>
          }

          <!-- Error toast -->
          @if (errorMsg()) {
            <div
              class="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
            >
              <span class="material-symbols-outlined flex-shrink-0" style="font-size:18px"
                >error</span
              >
              <span>{{ errorMsg() }}</span>
              <button (click)="errorMsg.set('')" class="ml-auto text-red-400 hover:text-red-300">
                <span class="material-symbols-outlined" style="font-size:18px">close</span>
              </button>
            </div>
          }

          <!-- Success toast -->
          @if (successMsg()) {
            <div
              class="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-400"
            >
              <span class="material-symbols-outlined flex-shrink-0" style="font-size:18px"
                >check_circle</span
              >
              <span>{{ successMsg() }}</span>
            </div>
          }
        </div>

        <!-- Sidebar: History + Info -->
        <div class="space-y-5">
          <!-- Info card -->
          <div class="bg-card-dark border border-white/10 rounded-xl p-5">
            <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <span class="material-symbols-outlined text-violet-400" style="font-size:18px"
                >info</span
              >
              Cómo usar
            </h3>
            <ul class="space-y-2 text-xs text-slate-400">
              <li class="flex items-start gap-2">
                <span class="text-violet-400 mt-0.5">1.</span>
                Elige la voz que mejor se adapte a tu contenido
              </li>
              <li class="flex items-start gap-2">
                <span class="text-violet-400 mt-0.5">2.</span>
                Escribe o pega el texto (máx. 2000 caracteres)
              </li>
              <li class="flex items-start gap-2">
                <span class="text-violet-400 mt-0.5">3.</span>
                Haz clic en "Generar Audio"
              </li>
              <li class="flex items-start gap-2">
                <span class="text-violet-400 mt-0.5">4.</span>
                Reproduce o descarga el MP3 generado
              </li>
            </ul>
            <div class="mt-4 pt-4 border-t border-white/10">
              <p class="text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-2">
                Tecnología
              </p>
              <div class="flex items-center gap-2">
                <div
                  class="w-6 h-6 rounded bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center"
                >
                  <span
                    class="material-symbols-outlined text-white"
                    style="font-size:12px"
                    >auto_awesome</span
                  >
                </div>
                <span class="text-xs text-slate-400">Edge TTS · Voces Neurales</span>
              </div>
            </div>
          </div>

          <!-- History -->
          <div class="bg-card-dark border border-white/10 rounded-xl p-5">
            <h3 class="text-sm font-bold text-white mb-3 flex items-center justify-between gap-2">
              <span class="flex items-center gap-2">
                <span class="material-symbols-outlined text-violet-400" style="font-size:18px"
                  >history</span
                >
                Últimos audios
              </span>
              @if (audioHistory().length > 0) {
                <span class="text-[10px] text-slate-500">{{ audioHistory().length }}/5</span>
              }
            </h3>

            @if (audioHistory().length === 0) {
              <p class="text-xs text-slate-600 text-center py-4">
                Los audios generados aparecerán aquí
              </p>
            } @else {
              <div class="space-y-2">
                @for (entry of audioHistory(); track entry.id) {
                  <div
                    class="bg-white/5 border border-white/10 rounded-lg p-3 hover:border-violet-500/20 transition-all"
                  >
                    <div class="flex items-start justify-between gap-2 mb-2">
                      <div class="flex-1 min-w-0">
                        <p class="text-xs text-white font-medium truncate">
                          {{ entry.text | slice: 0 : 60
                          }}{{ entry.text.length > 60 ? '...' : '' }}
                        </p>
                        <p class="text-[10px] text-slate-500 mt-0.5">
                          {{ entry.voiceName }} · {{ entry.timestamp | date: 'HH:mm' }}
                        </p>
                      </div>
                    </div>
                    <audio
                      [src]="entry.audioUrl"
                      controls
                      class="w-full rounded"
                      style="height:32px; accent-color: #8b5cf6"
                    ></audio>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AiVozComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase = getSupabaseClient();
  private audioCounter = 0;

  readonly voices: VoiceOption[] = [
    { id: 'es-CO-GonzaloNeural', flag: '🇨🇴', name: 'Gonzalo', gender: 'Masculino', country: 'Colombia' },
    { id: 'es-CO-SalomeNeural', flag: '🇨🇴', name: 'Salomé', gender: 'Femenino', country: 'Colombia' },
    { id: 'es-MX-JorgeNeural', flag: '🇲🇽', name: 'Jorge', gender: 'Masculino', country: 'México' },
    { id: 'es-MX-DaliaNeural', flag: '🇲🇽', name: 'Dalia', gender: 'Femenino', country: 'México' },
    { id: 'es-ES-AlvaroNeural', flag: '🇪🇸', name: 'Álvaro', gender: 'Masculino', country: 'España' },
    { id: 'es-ES-ElviraNeural', flag: '🇪🇸', name: 'Elvira', gender: 'Femenino', country: 'España' },
    { id: 'es-AR-TomasNeural', flag: '🇦🇷', name: 'Tomás', gender: 'Masculino', country: 'Argentina' },
    { id: 'es-AR-ElenaNeural', flag: '🇦🇷', name: 'Elena', gender: 'Femenino', country: 'Argentina' },
    { id: 'es-US-AlonsoNeural', flag: '🇺🇸', name: 'Alonso', gender: 'Masculino', country: 'Latino USA' },
    { id: 'es-US-PalomaNeural', flag: '🇺🇸', name: 'Paloma', gender: 'Femenino', country: 'Latina USA' },
  ];

  readonly selectedVoice = signal('es-CO-GonzaloNeural');
  readonly isLoading = signal(false);
  readonly errorMsg = signal('');
  readonly successMsg = signal('');
  readonly currentAudioUrl = signal<string | null>(null);
  readonly audioHistory = signal<AudioEntry[]>([]);

  textContent = '';

  readonly canGenerate = computed(
    () => this.textContent.trim().length > 0 && !this.isLoading()
  );

  readonly selectedVoiceName = computed(() => {
    const v = this.voices.find((x) => x.id === this.selectedVoice());
    return v ? `${v.flag} ${v.name}` : '';
  });

  async generateAudio(): Promise<void> {
    const text = this.textContent.trim();
    if (!text || this.isLoading()) return;

    this.errorMsg.set('');
    this.successMsg.set('');
    this.isLoading.set(true);

    // Revoke previous blob URL to free memory
    const prev = this.currentAudioUrl();
    if (prev?.startsWith('blob:') && isPlatformBrowser(this.platformId)) {
      URL.revokeObjectURL(prev);
    }
    this.currentAudioUrl.set(null);

    try {
      const { data: sessionData } = await this.supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('No hay sesión activa');

      const res = await fetch(`${environment.supabase.url}/functions/v1/generate-tts-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: environment.supabase.anonKey,
        },
        body: JSON.stringify({ text, voice: this.selectedVoice() }),
      });

      if (!res.ok) {
        let errMsg = 'Error al generar el audio';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      const blob = await res.blob();
      if (!isPlatformBrowser(this.platformId)) {
        throw new Error('Solo disponible en el navegador');
      }

      const audioUrl = URL.createObjectURL(blob);
      this.currentAudioUrl.set(audioUrl);
      this.successMsg.set('Audio generado exitosamente');
      setTimeout(() => this.successMsg.set(''), 3000);

      // Add to history (keep last 5)
      const voiceObj = this.voices.find((v) => v.id === this.selectedVoice());
      const entry: AudioEntry = {
        id: ++this.audioCounter,
        text,
        voice: this.selectedVoice(),
        voiceName: voiceObj ? `${voiceObj.flag} ${voiceObj.name}` : this.selectedVoice(),
        audioUrl,
        timestamp: new Date(),
      };
      this.audioHistory.update((h) => [entry, ...h].slice(0, 5));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      this.errorMsg.set(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  downloadAudio(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const url = this.currentAudioUrl();
    if (!url) return;
    const voiceObj = this.voices.find((v) => v.id === this.selectedVoice());
    const name = voiceObj?.name ?? 'audio';
    const a = document.createElement('a');
    a.href = url;
    a.download = `publistudio-voz-${name.toLowerCase()}-${Date.now()}.mp3`;
    a.click();
  }
}
