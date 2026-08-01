/**
 * Espejo (a proposito, no un import compartido -- Deno vs Node son runtimes distintos) de la
 * regla de autorizacion en supabase/functions/ag-livekit-token/index.ts: decide si quien pide
 * un token de llamada es de verdad el conductor o el pasajero de ESE viaje. Si cambias la regla
 * alla, actualiza esta funcion y su prueba tambien -- un error aca deja llamar a cualquiera.
 */
export interface CallAuthorizationResult {
  isPassenger: boolean;
  isDriver: boolean;
  authorized: boolean;
}

export function resolveCallAuthorization(
  requestingAgUserId: string,
  passengerAgUserId: string | null | undefined,
  driverAgUserId: string | null | undefined,
): CallAuthorizationResult {
  const isPassenger = !!passengerAgUserId && requestingAgUserId === passengerAgUserId;
  const isDriver = !!driverAgUserId && requestingAgUserId === driverAgUserId;
  return { isPassenger, isDriver, authorized: isPassenger || isDriver };
}
