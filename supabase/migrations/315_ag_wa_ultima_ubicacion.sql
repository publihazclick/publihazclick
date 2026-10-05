-- 315 (2026-10-05): última ubicación recibida por WhatsApp, para no responder dos veces la
-- misma ubicación enviada repetida (ver "MISMA UBICACIÓN REPETIDA" en ag-whatsapp).
ALTER TABLE public.ag_wa_sessions ADD COLUMN IF NOT EXISTS ultima_ubicacion jsonb;
