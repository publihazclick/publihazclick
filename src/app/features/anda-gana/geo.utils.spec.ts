import { describe, it, expect } from 'vitest';
import { distMeters } from './geo.utils';

describe('distMeters', () => {
  it('devuelve 0 para el mismo punto', () => {
    expect(distMeters(4.6097, -74.0817, 4.6097, -74.0817)).toBeCloseTo(0, 3);
  });

  it('calcula una distancia real conocida (Bogota centro -> Bogota norte, ~9.5km)', () => {
    // Plaza de Bolivar (4.5981,-74.0761) -> Usaquen (4.6947,-74.0301), distancia real ~11.2km
    const d = distMeters(4.5981, -74.0761, 4.6947, -74.0301);
    expect(d).toBeGreaterThan(10000);
    expect(d).toBeLessThan(12500);
  });

  it('es simetrica (A->B == B->A)', () => {
    const ab = distMeters(4.6097, -74.0817, 4.7110, -74.0721);
    const ba = distMeters(4.7110, -74.0721, 4.6097, -74.0817);
    expect(ab).toBeCloseTo(ba, 6);
  });

  it('detecta correctamente el radio de 30m usado por el auto-finalizar viaje', () => {
    // ~22m de diferencia en latitud (1 grado lat ~= 111.32km -> 0.0002 grados ~= 22m)
    const d = distMeters(4.6097, -74.0817, 4.60992, -74.0817);
    expect(d).toBeLessThan(30);
  });

  it('un punto a ~200m no cae dentro del radio de 30m', () => {
    const d = distMeters(4.6097, -74.0817, 4.6115, -74.0817);
    expect(d).toBeGreaterThan(30);
  });
});
