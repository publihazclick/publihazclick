import { describe, it, expect } from 'vitest';
import { BOARDING_TARGET_STAGE, isStageReached, AG_TRIP_STAGE_ORDER } from './trip-stage.utils';

describe('trip-stage.utils', () => {
  it('BOARDING_TARGET_STAGE es on_route (bug real: dos caminos distintos marcaban "a bordo" con stages diferentes)', () => {
    expect(BOARDING_TARGET_STAGE).toBe('on_route');
  });

  it('BOARDING_TARGET_STAGE esta en el orden canonico de etapas', () => {
    expect(AG_TRIP_STAGE_ORDER).toContain(BOARDING_TARGET_STAGE);
  });

  describe('isStageReached', () => {
    it('retorna false si no hay etapa actual', () => {
      expect(isStageReached(null, 'on_route')).toBe(false);
      expect(isStageReached(undefined, 'on_route')).toBe(false);
    });

    it('retorna true cuando la etapa actual ya paso la etapa objetivo', () => {
      expect(isStageReached('on_route', 'arrived_at_pickup')).toBe(true);
      expect(isStageReached('completed', 'heading_to_pickup')).toBe(true);
    });

    it('retorna true cuando la etapa actual ES la etapa objetivo', () => {
      expect(isStageReached('arrived_at_pickup', 'arrived_at_pickup')).toBe(true);
    });

    it('retorna false cuando la etapa actual todavia no llega a la etapa objetivo', () => {
      expect(isStageReached('heading_to_pickup', 'on_route')).toBe(false);
      expect(isStageReached('arrived_at_pickup', 'completed')).toBe(false);
    });
  });
});
