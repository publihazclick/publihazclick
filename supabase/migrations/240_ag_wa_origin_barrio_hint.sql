-- Pedido explícito del usuario 2026-08-28: zonas grandes como "Ciudadela
-- Juan Atalaya" agrupan decenas de barrios reales (ej. "Comuneros") que ni
-- Mapbox ni OpenStreetMap tienen mapeados como subdivisión propia -- se
-- confirmó con datos reales de producción (ver commit relacionado en
-- ag-whatsapp/index.ts). Solución acordada: antes de pedir el GPS del punto
-- de recogida, el bot pregunta el barrio/sector a mano, y ese texto se
-- AGREGA (no reemplaza) a lo que la ubicación GPS detecte sola. Solo aplica
-- al ORIGEN (punto de recogida), no al destino -- pedido explícito.

ALTER TABLE public.ag_wa_sessions
  ADD COLUMN IF NOT EXISTS origin_barrio_hint text,
  ADD COLUMN IF NOT EXISTS pending_location_kind text;
