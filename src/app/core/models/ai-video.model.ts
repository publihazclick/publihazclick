/** Plataformas de destino para videos */
export type AiPlatform = 'tiktok' | 'instagram' | 'facebook' | 'shorts' | 'youtube';

/** Duraciones disponibles en segundos */
export type AiVideoDuration = 15 | 30 | 60 | 90 | 180;

/** Tipos de voz */
export type AiVoiceType = 'adult_man' | 'adult_woman' | 'young_man' | 'young_woman';

/** Estados del proyecto de video */
export type AiVideoStatus = 'draft' | 'generating' | 'preview_ready' | 'rendering' | 'completed' | 'failed';

/** Pasos del wizard */
export type AiVideoStep = 'topic' | 'platform' | 'script' | 'voice' | 'images' | 'preview';

/** Escena individual del video */
export interface AiScene {
  scene: number;
  duration_seconds: number;
  narration: string;
  visual_description: string;
  camera_direction: string;
  text_overlay: string;
  image_url?: string;
  audio_url?: string;
}

/** Guión completo generado por IA */
export interface AiScript {
  title: string;
  hook: string;
  scenes: AiScene[];
  total_duration: number;
  cta: string;
  music_suggestion: string;
  chapters?: { timestamp: string; title: string }[];
  seo?: { title: string; hashtags: string[]; description: string };
}

/** Configuración de plataforma */
export interface AiPlatformConfig {
  name: string;
  format: 'short-form' | 'long-form';
  duration: number;
  aspect: string;
  hashtag_count: number;
  seo_label: string;
}

/** Proyecto de video completo */
export interface AiVideoProject {
  id?: string;
  user_id: string;
  topic: string;
  platform: AiPlatform;
  duration: AiVideoDuration;
  voice_type: AiVoiceType;
  script: AiScript | null;
  platform_config: AiPlatformConfig | null;
  status: AiVideoStatus;
  video_url?: string;
  created_at: string;
  updated_at: string;
}

/** Opción de voz para el selector */
export interface AiVoiceOption {
  type: AiVoiceType;
  label: string;
  voice_id: string;
  icon: string;
}

/** Info de plataforma para el selector */
export interface AiPlatformOption {
  id: AiPlatform;
  name: string;
  icon: string;
  description: string;
  aspect: string;
  durations: AiVideoDuration[];
}
