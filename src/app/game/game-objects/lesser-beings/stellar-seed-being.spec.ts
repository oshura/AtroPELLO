import { StellarSeedBeing } from './stellar-seed-being';
import { LesserBeing } from '../../types/cosmic-life.types';

describe('StellarSeedBeing', () => {
  it('instantiates without crashing and keeps orientation state usable', () => {
    const being = new StellarSeedBeing({ position: { x: 10, y: -4, z: 25 } });

    expect(being.beingType).toBe(LesserBeing.SEMILLAS_ESTELARES);
    expect(being.forwardDirection).toEqual(jasmine.objectContaining({ z: jasmine.any(Number) }));

    expect(() => being.update(0.016)).not.toThrow();
  });
});
