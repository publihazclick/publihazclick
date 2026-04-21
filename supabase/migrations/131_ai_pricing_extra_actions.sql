-- =============================================================================
-- Migración 131: pricing para acciones que faltaban en ai_action_pricing
-- =============================================================================
-- Agrega entradas para:
--   - niches_gemini: generación de nichos virales con Gemini (video-generator)
--   - ideas_youtube: ideas virales para YouTube (youtube-studio)
--   - photo_avatar_heygen: subir foto personal y crear talking_photo en HeyGen
--   - tts_azure: TTS con Microsoft Edge (alias de tts_edge para compat cliente)
--
-- Todas activas y con precio/cost definido. Usa ON CONFLICT para idempotencia.
-- =============================================================================

INSERT INTO ai_action_pricing (id, label, category, price_cop, cost_cop, is_active, description)
VALUES
  ('niches_gemini',        'Generar nichos virales',   'tools',  300,  8,   true, 'Sugerencias de nichos y temas virales con Gemini'),
  ('ideas_youtube',        'Ideas virales YouTube',    'tools',  300,  8,   true, 'Ideas optimizadas para algoritmo YouTube'),
  ('photo_avatar_heygen',  'Foto avatar personal',     'tools',  1500, 400, true, 'Subir tu foto y crear avatar parlante en HeyGen'),
  ('tts_azure',            'Voz Edge TTS',             'voice',  200,  0,   true, 'Narración con Microsoft Edge TTS')
ON CONFLICT (id) DO UPDATE
  SET label       = EXCLUDED.label,
      category    = EXCLUDED.category,
      price_cop   = EXCLUDED.price_cop,
      cost_cop    = EXCLUDED.cost_cop,
      description = EXCLUDED.description,
      is_active   = EXCLUDED.is_active,
      updated_at  = now();
