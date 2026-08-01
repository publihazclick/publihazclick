/**
 * Bug real 2026-07-31: habia DOS lugares que marcaban "pasajero a bordo" con un stage
 * DISTINTO cada uno (uno saltaba directo a 'on_route', el otro dejaba un estado intermedio
 * 'picked_up' que requeria un boton separado "Iniciar viaje"). Se unifico para que ambos usen
 * el mismo destino -- esta constante es la unica fuente de verdad para que no se repita.
 */
export const BOARDING_TARGET_STAGE = 'on_route' as const;

export type AgTripStage =
  | 'heading_to_pickup'
  | 'arrived_at_pickup'
  | 'picked_up'
  | 'on_route'
  | 'arrived_at_destination'
  | 'completed';

/** Orden canonico de etapas, usado para "¿ya se paso de esta etapa?" en barras de progreso.
 * 'picked_up' se deja en el orden por compatibilidad con viajes viejos que hayan quedado ahi
 * antes del fix de arriba -- pero ninguna accion nueva debe apuntar a ese stage directamente,
 * usar BOARDING_TARGET_STAGE en su lugar. */
export const AG_TRIP_STAGE_ORDER: AgTripStage[] = [
  'heading_to_pickup', 'arrived_at_pickup', 'picked_up', 'on_route', 'arrived_at_destination', 'completed',
];

export function isStageReached(current: string | null | undefined, target: string): boolean {
  if (!current) return false;
  return AG_TRIP_STAGE_ORDER.indexOf(current as AgTripStage) >= AG_TRIP_STAGE_ORDER.indexOf(target as AgTripStage);
}
