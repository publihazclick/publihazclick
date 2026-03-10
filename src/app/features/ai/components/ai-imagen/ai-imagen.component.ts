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

interface GeneratedImage {
  dataUrl: string;
  mimeType: string;
  downloading: boolean;
}

type GenerateState = 'idle' | 'loading' | 'done' | 'error';

interface AspectOption {
  value: string;
  label: string;
  icon: string;
  desc: string;
}

interface StyleOption {
  value: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-ai-imagen',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Toast -->
    @if (toast()) {
      <div
        class="fixed top-6 right-6 z-[100] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-2"
        [class]="toastType() === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'"
      >
        <span class="material-symbols-outlined" style="font-size:18px">
          {{ toastType() === 'success' ? 'check_circle' : 'error' }}
        </span>
        {{ toast() }}
      </div>
    }

    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/20"
        >
          <span class="material-symbols-outlined text-white" style="font-size:22px">image</span>
        </div>
        <div>
          <h2 class="text-xl font-black text-white tracking-tight">Imagen IA</h2>
          <p class="text-xs text-slate-500">Genera imágenes con Vertex AI Imagen 3</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <!-- ── Panel izquierdo: formulario ─────────────────────────────── -->
        <div class="lg:col-span-2 space-y-4">
          <!-- Prompt -->
          <div class="bg-card-dark rounded-2xl border border-white/5 p-5">
            <label class="block text-xs text-slate-400 font-bold mb-2 uppercase tracking-wider">
              Descripción de la imagen *
            </label>
            <textarea
              [ngModel]="prompt()"
              (ngModelChange)="prompt.set($event)"
              placeholder="Ej: A professional coffee shop interior with warm lighting, cozy atmosphere, people working on laptops..."
              rows="5"
              class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 resize-none transition-all"
            ></textarea>
            <p class="text-[10px] text-slate-600 mt-1">
              En inglés para mejores resultados · {{ prompt().length }}/500
            </p>
          </div>

          <!-- Negative prompt -->
          <div class="bg-card-dark rounded-2xl border border-white/5 p-5">
            <label class="block text-xs text-slate-400 font-bold mb-2 uppercase tracking-wider">
              Prompt negativo (opcional)
            </label>
            <textarea
              [ngModel]="negativePrompt()"
              (ngModelChange)="negativePrompt.set($event)"
              placeholder="blurry, low quality, text, watermark..."
              rows="2"
              class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 resize-none transition-all"
            ></textarea>
          </div>

          <!-- Aspect ratio -->
          <div class="bg-card-dark rounded-2xl border border-white/5 p-5">
            <label class="block text-xs text-slate-400 font-bold mb-3 uppercase tracking-wider">
              Proporción
            </label>
            <div class="grid grid-cols-2 gap-2">
              @for (opt of aspectOptions; track opt.value) {
                <button
                  (click)="aspectRatio.set(opt.value)"
                  class="flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-bold transition-all"
                  [class]="
                    aspectRatio() === opt.value
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                  "
                >
                  <span class="material-symbols-outlined" style="font-size:20px">{{
                    opt.icon
                  }}</span>
                  <span>{{ opt.label }}</span>
                  <span class="text-[9px] opacity-60 font-normal">{{ opt.desc }}</span>
                </button>
              }
            </div>
          </div>

          <!-- Estilo -->
          <div class="bg-card-dark rounded-2xl border border-white/5 p-5">
            <label class="block text-xs text-slate-400 font-bold mb-3 uppercase tracking-wider">
              Estilo visual
            </label>
            <div class="flex flex-wrap gap-2">
              @for (s of styleOptions; track s.value) {
                <button
                  (click)="toggleStyle(s.value)"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all"
                  [class]="
                    selectedStyles().includes(s.value)
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
                  "
                >
                  <span class="material-symbols-outlined" style="font-size:14px">{{
                    s.icon
                  }}</span>
                  {{ s.label }}
                </button>
              }
            </div>
          </div>

          <!-- Cantidad -->
          <div class="bg-card-dark rounded-2xl border border-white/5 p-5">
            <label class="block text-xs text-slate-400 font-bold mb-3 uppercase tracking-wider">
              Cantidad: {{ sampleCount() }} imagen{{ sampleCount() > 1 ? 's' : '' }}
            </label>
            <input
              type="range"
              min="1"
              max="4"
              [ngModel]="sampleCount()"
              (ngModelChange)="sampleCount.set(+$event)"
              class="w-full accent-blue-500"
            />
            <div class="flex justify-between text-[10px] text-slate-600 mt-1">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
            </div>
          </div>

          <!-- Botón generar -->
          <button
            (click)="generate()"
            [disabled]="!canGenerate() || state() === 'loading'"
            class="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg shadow-blue-500/25"
          >
            @if (state() === 'loading') {
              <span class="material-symbols-outlined animate-spin" style="font-size:18px"
                >progress_activity</span
              >
              Generando con Vertex AI...
            } @else {
              <span class="material-symbols-outlined" style="font-size:18px">auto_awesome</span>
              Generar {{ sampleCount() > 1 ? sampleCount() + ' imágenes' : 'imagen' }}
            }
          </button>
        </div>

        <!-- ── Panel derecho: resultados ───────────────────────────────── -->
        <div class="lg:col-span-3">
          @if (state() === 'idle' && images().length === 0) {
            <!-- Empty state -->
            <div
              class="bg-card-dark rounded-2xl border border-white/5 flex flex-col items-center justify-center py-24 px-6 text-center h-full min-h-64"
            >
              <div
                class="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4"
              >
                <span class="material-symbols-outlined text-blue-400" style="font-size:32px"
                  >image</span
                >
              </div>
              <p class="text-sm font-bold text-white mb-1">Tus imágenes aparecerán aquí</p>
              <p class="text-xs text-slate-500">
                Describe lo que quieres generar y haz clic en Generar
              </p>
            </div>
          }

          @if (state() === 'loading') {
            <!-- Loading state -->
            <div
              class="bg-card-dark rounded-2xl border border-white/5 flex flex-col items-center justify-center py-24 px-6 gap-4"
            >
              <div class="relative">
                <div
                  class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center"
                >
                  <span
                    class="material-symbols-outlined text-blue-400 animate-pulse"
                    style="font-size:32px"
                    >image</span
                  >
                </div>
                <div
                  class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 animate-ping"
                ></div>
              </div>
              <p class="text-sm font-bold text-white">Vertex AI Imagen está trabajando...</p>
              <p class="text-xs text-slate-500">
                Generando {{ sampleCount() }} imagen{{ sampleCount() > 1 ? 's' : '' }} de alta
                calidad
              </p>
            </div>
          }

          @if (images().length > 0) {
            <div class="space-y-4">
              <!-- Grid de imágenes -->
              <div
                class="grid gap-3"
                [class]="images().length === 1 ? 'grid-cols-1' : 'grid-cols-2'"
              >
                @for (img of images(); track $index; let i = $index) {
                  <div
                    class="bg-card-dark rounded-xl border border-white/5 overflow-hidden group relative"
                  >
                    <img
                      [src]="img.dataUrl"
                      [alt]="'Imagen generada ' + (i + 1)"
                      class="w-full h-auto object-cover"
                    />
                    <!-- Overlay con botones -->
                    <div
                      class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3"
                    >
                      <button
                        (click)="downloadImage(i)"
                        [disabled]="img.downloading"
                        class="flex items-center gap-1.5 px-4 py-2 bg-white text-black rounded-xl text-xs font-black hover:bg-slate-100 transition-all disabled:opacity-50"
                      >
                        <span class="material-symbols-outlined" style="font-size:16px"
                          >download</span
                        >
                        Descargar
                      </button>
                    </div>
                  </div>
                }
              </div>

              <!-- Prompt usado -->
              <div class="bg-card-dark rounded-xl border border-white/5 p-4">
                <p class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">
                  Prompt usado
                </p>
                <p class="text-xs text-white/70 leading-relaxed">{{ lastPrompt() }}</p>
              </div>

              <!-- Botones de acción -->
              <div class="flex gap-3">
                <button
                  (click)="generate()"
                  [disabled]="state() === 'loading'"
                  class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-xl text-xs font-black text-white transition-all disabled:opacity-40"
                >
                  <span class="material-symbols-outlined" style="font-size:16px">refresh</span>
                  Regenerar
                </button>
                <button
                  (click)="clearAll()"
                  class="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all"
                >
                  <span class="material-symbols-outlined" style="font-size:16px">close</span>
                  Limpiar
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class AiImagenComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase = getSupabaseClient();

  // ── Estado ────────────────────────────────────────────────────────────────

  readonly prompt = signal('');
  readonly negativePrompt = signal('');
  readonly aspectRatio = signal('1:1');
  readonly sampleCount = signal(1);
  readonly selectedStyles = signal<string[]>([]);
  readonly state = signal<GenerateState>('idle');
  readonly images = signal<GeneratedImage[]>([]);
  readonly lastPrompt = signal('');
  readonly toast = signal<string | null>(null);
  readonly toastType = signal<'success' | 'error'>('success');

  // ── Opciones ──────────────────────────────────────────────────────────────

  readonly aspectOptions: AspectOption[] = [
    { value: '1:1', label: 'Cuadrado', icon: 'crop_square', desc: '1:1 · Feed' },
    { value: '9:16', label: 'Vertical', icon: 'stay_current_portrait', desc: '9:16 · Stories' },
    { value: '16:9', label: 'Horizontal', icon: 'stay_current_landscape', desc: '16:9 · Banner' },
    { value: '4:3', label: 'Landscape', icon: 'crop_landscape', desc: '4:3 · Clásico' },
  ];

  readonly styleOptions: StyleOption[] = [
    { value: 'photorealistic', label: 'Fotorrealista', icon: 'photo_camera' },
    { value: 'cinematic lighting', label: 'Cinemático', icon: 'movie' },
    { value: 'minimalist', label: 'Minimalista', icon: 'filter_b_and_w' },
    { value: 'vibrant colors', label: 'Vibrante', icon: 'palette' },
    { value: 'professional photography', label: 'Profesional', icon: 'business_center' },
    { value: 'digital art', label: 'Arte digital', icon: 'brush' },
    { value: 'flat design illustration', label: 'Ilustración', icon: 'draw' },
    { value: 'dark moody atmosphere', label: 'Dark', icon: 'dark_mode' },
  ];

  // ── Computed ──────────────────────────────────────────────────────────────

  readonly canGenerate = computed(
    () => this.prompt().trim().length >= 3 && this.state() !== 'loading',
  );

  readonly fullPrompt = computed(() => {
    const parts = [this.prompt().trim(), ...this.selectedStyles()];
    return parts.join(', ');
  });

  // ── Acciones ──────────────────────────────────────────────────────────────

  toggleStyle(value: string) {
    const current = this.selectedStyles();
    if (current.includes(value)) {
      this.selectedStyles.set(current.filter((s) => s !== value));
    } else {
      this.selectedStyles.set([...current, value]);
    }
  }

  async generate() {
    if (!this.canGenerate()) return;

    this.state.set('loading');
    this.images.set([]);
    this.lastPrompt.set(this.fullPrompt());

    try {
      const {
        data: { session },
      } = await this.supabase.auth.getSession();

      if (!session?.access_token) {
        this.showToast('Sesión expirada. Recarga la página.', 'error');
        this.state.set('error');
        return;
      }

      const res = await fetch(
        `${environment.supabase.url}/functions/v1/generate-vertex-image`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            apikey: environment.supabase.anonKey,
          },
          body: JSON.stringify({
            prompt: this.fullPrompt(),
            aspectRatio: this.aspectRatio(),
            sampleCount: this.sampleCount(),
            negativePrompt: this.negativePrompt().trim() || undefined,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        this.showToast(data.error || 'Error al generar imagen.', 'error');
        this.state.set('error');
        return;
      }

      this.images.set(
        data.images.map((img: { dataUrl: string; mimeType: string }) => ({
          dataUrl: img.dataUrl,
          mimeType: img.mimeType,
          downloading: false,
        })),
      );

      this.state.set('done');
      this.showToast(
        `${data.images.length} imagen${data.images.length > 1 ? 's' : ''} generada${data.images.length > 1 ? 's' : ''} con éxito.`,
        'success',
      );
    } catch {
      this.showToast('Error de conexión. Intenta de nuevo.', 'error');
      this.state.set('error');
    }
  }

  downloadImage(index: number) {
    if (!isPlatformBrowser(this.platformId)) return;
    const img = this.images()[index];
    if (!img) return;

    const updated = [...this.images()];
    updated[index] = { ...updated[index], downloading: true };
    this.images.set(updated);

    try {
      const link = document.createElement('a');
      link.href = img.dataUrl;
      link.download = `vertex-imagen-${index + 1}-${Date.now()}.png`;
      link.click();
    } finally {
      setTimeout(() => {
        const reset = [...this.images()];
        reset[index] = { ...reset[index], downloading: false };
        this.images.set(reset);
      }, 1000);
    }
  }

  clearAll() {
    this.images.set([]);
    this.state.set('idle');
    this.lastPrompt.set('');
  }

  private showToast(msg: string, type: 'success' | 'error') {
    this.toast.set(msg);
    this.toastType.set(type);
    setTimeout(() => this.toast.set(null), 4000);
  }
}
