import { describe, it, expect } from 'vitest';
import { resolveCallAuthorization } from './call-authorization.utils';

const PASSENGER_ID = 'passenger-ag-user-id';
const DRIVER_ID = 'driver-ag-user-id';

describe('resolveCallAuthorization', () => {
  it('autoriza al pasajero del viaje', () => {
    const r = resolveCallAuthorization(PASSENGER_ID, PASSENGER_ID, DRIVER_ID);
    expect(r).toEqual({ isPassenger: true, isDriver: false, authorized: true });
  });

  it('autoriza al conductor del viaje', () => {
    const r = resolveCallAuthorization(DRIVER_ID, PASSENGER_ID, DRIVER_ID);
    expect(r).toEqual({ isPassenger: false, isDriver: true, authorized: true });
  });

  it('rechaza a un tercero que no es ni el conductor ni el pasajero de ese viaje', () => {
    const r = resolveCallAuthorization('un-desconocido-cualquiera', PASSENGER_ID, DRIVER_ID);
    expect(r).toEqual({ isPassenger: false, isDriver: false, authorized: false });
  });

  it('rechaza si el viaje no tiene conductor asignado todavia (driverAgUserId ausente)', () => {
    const r = resolveCallAuthorization(DRIVER_ID, PASSENGER_ID, undefined);
    expect(r.authorized).toBe(false);
  });

  it('nunca autoriza por coincidencia de valores vacios/undefined en ambos lados', () => {
    const r = resolveCallAuthorization('', undefined, undefined);
    expect(r.authorized).toBe(false);
  });
});
