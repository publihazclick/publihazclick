import { Injectable, signal } from '@angular/core';
import { getSupabaseClient } from '../supabase.client';
import { environment } from '../../../environments/environment';
import type {
  AiScene,
  AiScript,
  AiPlatform,
  AiPlatformConfig,
  AiVoiceOption,
  AiVoiceType,
} from '../models/ai-video.model';

const FUNCTIONS_URL = `${environment.supabase.url}/functions/v1`;

@Injectable({ providedIn: 'root' })
export class AiVideoService {
  private readonly supabase = getSupabaseClient();

  readonly isGenerating = signal(false);
  readonly generationProgress = signal(0);
  readonly generationStep = signal('');
  readonly error = signal<string | null>(null);

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const {
      data: { session },
    } = await this.supabase.auth.getSession();
    if (!session) throw new Error('Sesión no encontrada');
    return {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  /** Genera un título ganador usando la Edge Function chat-ai */
  async generateWinnerTitle(
    topic: string,
    platform: AiPlatform,
    duration: number
  ): Promise<string> {
    const headers = await this.getAuthHeaders();
    const message = `Genera SOLO un título viral y ganador para un video de ${platform} de ${duration} segundos sobre: "${topic}". Responde ÚNICAMENTE con el título, sin comillas, sin explicaciones, sin emojis extra. Máximo 80 caracteres.`;

    const res = await fetch(`${FUNCTIONS_URL}/chat-ai`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error del servidor' }));
      throw new Error(err.error || `Error ${res.status}`);
    }

    const data = await res.json();
    return data.reply?.trim() || 'No se pudo generar el título';
  }

  /** Busca los 5 títulos más virales de YouTube sobre un tema */
  async searchViralYouTubeTitles(
    topic: string
  ): Promise<{ title: string; views: string; channel: string }[]> {
    const { data, error } = await this.supabase.functions.invoke('search-youtube-titles', {
      body: { topic: topic.trim() },
    });
    if (error) throw error;
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (parsed?.titles?.length) {
      return parsed.titles.map(
        (t: { title: string; viewsFormatted: string; channel: string }) => ({
          title: t.title,
          views: t.viewsFormatted,
          channel: t.channel,
        })
      );
    }
    return [];
  }

  /** Genera un guión usando la Edge Function generate-reel-script */
  async generateScript(
    topic: string,
    platform: AiPlatform,
    options?: {
      video_type?: string;
      tone?: string;
      audience?: string;
      niche?: string;
      monetization?: string;
      duration?: number;
    }
  ): Promise<{ script: AiScript; platform_config: AiPlatformConfig }> {
    this.isGenerating.set(true);
    this.generationStep.set('Generando guión con IA...');
    this.error.set(null);

    try {
      const headers = await this.getAuthHeaders();
      const res = await fetch(`${FUNCTIONS_URL}/generate-reel-script`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          description: topic,
          platform,
          video_type: options?.video_type || 'educational',
          tone: options?.tone || 'professional',
          audience: options?.audience || 'general',
          niche: options?.niche || '',
          monetization: options?.monetization || 'personal_brand',
          duration: options?.duration,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error del servidor' }));
        throw new Error(err.error || `Error ${res.status}`);
      }

      const data = await res.json();
      return {
        script: data.script,
        platform_config: data.platform_config,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error generando guión';
      this.error.set(msg);
      throw e;
    } finally {
      this.isGenerating.set(false);
      this.generationStep.set('');
    }
  }

  /** Genera una imagen usando la Edge Function generate-vertex-image */
  async generateImage(
    prompt: string,
    aspectRatio: string = '9:16'
  ): Promise<{ dataUrl: string; mimeType: string }> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${FUNCTIONS_URL}/generate-vertex-image`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt, aspectRatio, sampleCount: 1 }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error del servidor' }));
      throw new Error(err.error || `Error ${res.status}`);
    }

    const data = await res.json();
    if (data.images && data.images.length > 0) {
      return data.images[0];
    }
    throw new Error('No se generó ninguna imagen');
  }

  /** Genera imágenes para todas las escenas secuencialmente */
  async generateSceneImages(scenes: AiScene[], aspectRatio: string): Promise<AiScene[]> {
    this.isGenerating.set(true);
    this.error.set(null);
    const updated = [...scenes];

    for (let i = 0; i < updated.length; i++) {
      this.generationStep.set(`Generando imagen ${i + 1} de ${updated.length}...`);
      this.generationProgress.set(Math.round(((i) / updated.length) * 100));

      try {
        const result = await this.generateImage(updated[i].visual_description, aspectRatio);
        updated[i] = { ...updated[i], image_url: result.dataUrl };
      } catch (e) {
        console.error(`Error generando imagen escena ${i + 1}:`, e);
        // Continuar con las demás escenas
      }
    }

    this.generationProgress.set(100);
    this.isGenerating.set(false);
    this.generationStep.set('');
    return updated;
  }

  /** Genera audio TTS para un texto */
  async generateAudio(text: string, voiceId: string): Promise<string> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${FUNCTIONS_URL}/generate-tts-audio`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, voice: voiceId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error del servidor' }));
      throw new Error(err.error || `Error ${res.status}`);
    }

    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  /** Genera audios para todas las escenas secuencialmente */
  async generateSceneAudios(scenes: AiScene[], voiceId: string): Promise<AiScene[]> {
    this.isGenerating.set(true);
    this.error.set(null);
    const updated = [...scenes];

    for (let i = 0; i < updated.length; i++) {
      this.generationStep.set(`Generando audio ${i + 1} de ${updated.length}...`);
      this.generationProgress.set(Math.round(((i) / updated.length) * 100));

      try {
        const audioUrl = await this.generateAudio(updated[i].narration, voiceId);
        updated[i] = { ...updated[i], audio_url: audioUrl };
      } catch (e) {
        console.error(`Error generando audio escena ${i + 1}:`, e);
      }
    }

    this.generationProgress.set(100);
    this.isGenerating.set(false);
    this.generationStep.set('');
    return updated;
  }

  /** Opciones de voz disponibles */
  getVoiceOptions(): AiVoiceOption[] {
    return [
      { type: 'adult_man', label: 'Hombre Adulto', voice_id: 'es-CO-GonzaloNeural', icon: 'record_voice_over' },
      { type: 'adult_woman', label: 'Mujer Adulta', voice_id: 'es-CO-SalomeNeural', icon: 'record_voice_over' },
      { type: 'young_man', label: 'Hombre Joven', voice_id: 'es-MX-JorgeNeural', icon: 'mic' },
      { type: 'young_woman', label: 'Mujer Joven', voice_id: 'es-MX-DaliaNeural', icon: 'mic' },
    ];
  }

  /** Limpiar blob URLs para evitar memory leaks */
  cleanupBlobUrls(scenes: AiScene[]): void {
    for (const scene of scenes) {
      if (scene.audio_url?.startsWith('blob:')) {
        URL.revokeObjectURL(scene.audio_url);
      }
    }
  }
}
