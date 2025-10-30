import { Vector3 } from '../types/game.types';
import { SuperAsteroid } from './SuperAsteroid';
import { TargetType } from './types/targeting.types';

/**
 * MegaAsteroid: like SuperAsteroid but forced size x5.
 */
export class MegaAsteroid extends SuperAsteroid {
  constructor(id: string, position: Vector3, baseSize: number = 1.0, direction?: Vector3) {
    super(id, position, baseSize * 5, direction);
    (this as any).objectType = TargetType.MEGA_ASTEROID;
    // Assign void mass proportional to size multiplier over SuperAsteroid base
    // SuperAsteroid baseline ~100 per unit size; MegaAsteroid forces x5
    // Use baseSize to scale so larger megas carry more void mass
    (this as any).voidMassUnits = Math.max(1, Math.round(500 * baseSize));
  }

  public override getDisplayName(): string {
    return `MegaAsteroid ${this.id}`;
  }
}
