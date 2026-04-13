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

  /**
   * Cobra una acción IA del wallet del usuario antes de ejecutarla.
   * Si no tiene saldo suficiente, lanza un error descriptivo.
   */
  async chargeAction(actionId: string, metadata: Record<string, unknown> = {}): Promise<{ charged: number; balance_after: number }> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    const { data, error } = await this.supabase.rpc('charge_ai_action', {
      p_user_id: user.id,
      p_action_id: actionId,
      p_metadata: metadata,
    });

    if (error) throw new Error(error.message);
    if (!data?.ok) {
      const err = data?.error ?? 'Error al procesar cobro';
      if (data?.need_recharge) {
        throw new Error(`💰 ${err} Recarga tu billetera IA para continuar.`);
      }
      throw new Error(err);
    }

    return { charged: data.charged, balance_after: data.balance_after };
  }

  /** Obtener precios de todas las acciones IA */
  async getActionPricing(): Promise<{ id: string; label: string; category: string; price_cop: number }[]> {
    const { data } = await this.supabase.rpc('get_ai_pricing');
    return data ?? [];
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
      // Cobrar antes de ejecutar
      await this.chargeAction('script_gemini', { topic, platform });

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
    await this.chargeAction('image_vertex', { prompt, aspect_ratio: aspectRatio });
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
    await this.chargeAction('tts_azure', { voice_id: voiceId, chars: text.length });
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

  // ══════════════════════════════════════════════════════════════
  // ELEVENLABS — Voces ultra-realistas + clonación
  // ══════════════════════════════════════════════════════════════

  /** Listar voces de ElevenLabs */
  async listElevenLabsVoices(): Promise<{ voice_id: string; name: string; category: string; preview_url: string; language: string }[]> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${FUNCTIONS_URL}/list-elevenlabs-voices`, { method: 'POST', headers, body: '{}' });
    if (!res.ok) throw new Error('Error al cargar voces ElevenLabs');
    const data = await res.json();
    return data.voices ?? [];
  }

  /** Generar audio TTS con ElevenLabs */
  async generateElevenLabsTTS(text: string, voiceId: string, stability = 0.5, similarityBoost = 0.75): Promise<string> {
    await this.chargeAction('tts_elevenlabs', { voice_id: voiceId, chars: text.length });
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${FUNCTIONS_URL}/generate-elevenlabs-tts`, {
      method: 'POST', headers,
      body: JSON.stringify({ text, voice_id: voiceId, stability, similarity_boost: similarityBoost }),
    });
    if (!res.ok) throw new Error('Error al generar audio ElevenLabs');
    const data = await res.json();
    return data.audio_url;
  }

  /** Clonar voz del usuario (enviar archivo de audio) */
  async cloneVoice(name: string, audioFile: File): Promise<{ voice_id: string }> {
    await this.chargeAction('voice_clone', { name });
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('Sesión no encontrada');
    const form = new FormData();
    form.append('name', name);
    form.append('audio', audioFile);
    const res = await fetch(`${FUNCTIONS_URL}/clone-elevenlabs-voice`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
      body: form,
    });
    if (!res.ok) throw new Error('Error al clonar voz');
    return res.json();
  }

  // ══════════════════════════════════════════════════════════════
  // RUNWAY ML — Video desde imagen/texto
  // ══════════════════════════════════════════════════════════════

  /** Generar video cinematográfico desde imagen o texto */
  async generateRunwayVideo(prompt: string, imageUrl?: string, duration = 5, ratio = '16:9'): Promise<{ task_id: string }> {
    const actionId = duration <= 5 ? 'video_runway_5s' : 'video_runway_10s';
    await this.chargeAction(actionId, { prompt, duration });
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${FUNCTIONS_URL}/generate-runway-video`, {
      method: 'POST', headers,
      body: JSON.stringify({ prompt, image_url: imageUrl, duration, ratio }),
    });
    if (!res.ok) throw new Error('Error al iniciar generación de video');
    return res.json();
  }

  /** Verificar estado del video de Runway */
  async checkRunwayVideo(taskId: string): Promise<{ status: string; video_url: string | null; progress: number }> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${FUNCTIONS_URL}/check-runway-video`, {
      method: 'POST', headers,
      body: JSON.stringify({ task_id: taskId }),
    });
    if (!res.ok) throw new Error('Error al verificar estado del video');
    return res.json();
  }

  // ══════════════════════════════════════════════════════════════
  // REPLICATE — Face swap + Flux Pro imágenes
  // ══════════════════════════════════════════════════════════════

  /** Face swap: poner la cara del usuario en un avatar/template */
  async faceSwap(sourceImage: string, targetImage: string): Promise<{ status: string; result_url: string }> {
    await this.chargeAction('face_swap');
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${FUNCTIONS_URL}/generate-face-swap`, {
      method: 'POST', headers,
      body: JSON.stringify({ source_image: sourceImage, target_image: targetImage }),
    });
    if (!res.ok) throw new Error('Error en face swap');
    return res.json();
  }

  /** Generar imágenes fotorrealistas con Flux Pro */
  async generateFluxImage(prompt: string, aspectRatio = '16:9', numOutputs = 1, negativePrompt?: string): Promise<string[]> {
    // Cobrar por cada imagen
    for (let i = 0; i < numOutputs; i++) {
      await this.chargeAction('image_flux', { prompt, image_number: i + 1 });
    }
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${FUNCTIONS_URL}/generate-flux-image`, {
      method: 'POST', headers,
      body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, num_outputs: numOutputs, negative_prompt: negativePrompt }),
    });
    if (!res.ok) throw new Error('Error al generar imagen Flux Pro');
    const data = await res.json();
    return data.images ?? [];
  }

  // ══════════════════════════════════════════════════════════════
  // OPENAI GPT-4o — Guiones creativos superiores
  // ══════════════════════════════════════════════════════════════

  /** Generar guión con GPT-4o (alternativa a Gemini) */
  async generateOpenAIScript(topic: string, platform: AiPlatform, duration?: number, tone?: string, productInfo?: string): Promise<AiScript> {
    await this.chargeAction('script_openai', { topic, platform });
    const headers = await this.getAuthHeaders();
    const res = await fetch(`${FUNCTIONS_URL}/generate-openai-script`, {
      method: 'POST', headers,
      body: JSON.stringify({ topic, platform, duration, tone, product_info: productInfo }),
    });
    if (!res.ok) throw new Error('Error al generar guión OpenAI');
    const data = await res.json();
    return data.script;
  }
}
