import {
  Component,
  inject,
  signal,
  ChangeDetectionStrategy,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getSupabaseClient } from '../../../../core/supabase.client';
import { environment } from '../../../../../environments/environment';

interface Scene {
  scene: number;
  duration_seconds: number;
  narration: string;
  visual_description: string;
  camera_direction: string;
  text_overlay: string;
}

interface ReelScript {
  title: string;
  hook: string;
  scenes: Scene[];
  total_duration: number;
  music_suggestion: string;
}

@Component({
  selector: 'app-ai-script',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-script.component.html',
  styleUrls: ['./ai-script.component.scss'],
})
export class AiScriptComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase = getSupabaseClient();

  readonly description = signal('');
  readonly tone = signal('profesional');
  readonly audience = signal('');

  readonly loading = signal(false);
  readonly script = signal<ReelScript | null>(null);
  readonly errorMsg = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);
  readonly regeneratingScene = signal<number | null>(null);

  readonly toneOptions = [
    { value: 'profesional', label: 'Profesional', icon: 'business_center' },
    { value: 'divertido', label: 'Divertido', icon: 'sentiment_very_satisfied' },
    { value: 'emocional', label: 'Emocional', icon: 'favorite' },
    { value: 'urgente', label: 'Urgente', icon: 'bolt' },
    { value: 'educativo', label: 'Educativo', icon: 'school' },
  ];

  getImageUrl(visualDescription: string): string {
    const encoded = encodeURIComponent(visualDescription);
    return `https://gen.pollinations.ai/image/${encoded}?model=flux&width=1080&height=1920&nologo=true`;
  }

  async generateScript() {
    const desc = this.description().trim();
    if (desc.length < 10) {
      this.showError('La descripción debe tener al menos 10 caracteres.');
      return;
    }

    this.loading.set(true);
    this.errorMsg.set(null);
    this.script.set(null);

    try {
      const {
        data: { session },
      } = await this.supabase.auth.getSession();

      if (!session?.access_token) {
        this.showError('Sesión expirada. Recarga la página.');
        return;
      }

      const res = await fetch(
        `${environment.supabase.url}/functions/v1/generate-reel-script`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            apikey: environment.supabase.anonKey,
          },
          body: JSON.stringify({
            description: desc,
            tone: this.tone(),
            audience: this.audience().trim() || undefined,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        this.showError(data.error || 'Error al generar el guión.');
        return;
      }

      this.script.set(data.script);
      this.showSuccess('Guión generado exitosamente.');
    } catch {
      this.showError('Error de conexión. Intenta de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async regenerateScene(sceneIndex: number) {
    const currentScript = this.script();
    if (!currentScript) return;

    this.regeneratingScene.set(sceneIndex);

    try {
      const scene = currentScript.scenes[sceneIndex];
      const desc = `${this.description().trim()}. Regenera SOLO la escena ${scene.scene} con una alternativa creativa diferente. El resto del guión no cambia.`;

      const {
        data: { session },
      } = await this.supabase.auth.getSession();

      if (!session?.access_token) {
        this.showError('Sesión expirada.');
        return;
      }

      const res = await fetch(
        `${environment.supabase.url}/functions/v1/generate-reel-script`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            apikey: environment.supabase.anonKey,
          },
          body: JSON.stringify({
            description: desc,
            tone: this.tone(),
            audience: this.audience().trim() || undefined,
          }),
        }
      );

      const data = await res.json();

      if (res.ok && data.success && data.script?.scenes?.length > sceneIndex) {
        const newScene = data.script.scenes[sceneIndex];
        const updatedScenes = [...currentScript.scenes];
        updatedScenes[sceneIndex] = {
          ...newScene,
          scene: scene.scene,
          duration_seconds: scene.duration_seconds,
        };
        this.script.set({ ...currentScript, scenes: updatedScenes });
        this.showSuccess(`Escena ${scene.scene} regenerada.`);
      } else {
        this.showError('No se pudo regenerar la escena.');
      }
    } catch {
      this.showError('Error al regenerar.');
    } finally {
      this.regeneratingScene.set(null);
    }
  }

  copyScript() {
    const s = this.script();
    if (!s || !isPlatformBrowser(this.platformId)) return;

    const lines: string[] = [
      `GUIÓN: ${s.title}`,
      `HOOK: ${s.hook}`,
      `DURACIÓN TOTAL: ${s.total_duration}s`,
      `MÚSICA: ${s.music_suggestion}`,
      '',
      '---',
      '',
    ];

    for (const scene of s.scenes) {
      lines.push(`ESCENA ${scene.scene} (${scene.duration_seconds}s) — ${scene.camera_direction}`);
      lines.push(`Narración: ${scene.narration}`);
      lines.push(`Overlay: ${scene.text_overlay}`);
      lines.push(`Visual: ${scene.visual_description}`);
      lines.push('');
    }

    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => this.showSuccess('Guión copiado al portapapeles.'))
      .catch(() => this.showError('No se pudo copiar.'));
  }

  private showError(msg: string) {
    this.errorMsg.set(msg);
    setTimeout(() => this.errorMsg.set(null), 5000);
  }

  private showSuccess(msg: string) {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(null), 3000);
  }
}
