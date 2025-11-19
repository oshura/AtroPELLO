import { Vector3 } from '../../types/game.types';
import { SuperAsteroid } from './SuperAsteroid';
import { TargetType } from '../types/targeting.types';
import { GameObjectType } from '../types/game-object.types';

/**
 * MegaAsteroid: like SuperAsteroid but forced size x25 (previously x5).
 */
export class MegaAsteroid extends SuperAsteroid {
  constructor(id: string, position: Vector3, baseSize: number = 1.0, direction?: Vector3) {
    // Make MegaAsteroids 5x larger than before (was x5 vs base, now x25 vs base)
    super(id, position, baseSize * 25, direction);
    this.setType(GameObjectType.MEGA_ASTEROID); // Cambiar tipo de super a mega
    (this as any).objectType = TargetType.MEGA_ASTEROID;
    
    // Health: extremely durable (40-60 hits from ship)
    this.healthMax = 2500;
    this.healthCurrent = this.healthMax;
    
    // Assign void mass proportional to size multiplier over SuperAsteroid base
    // SuperAsteroid baseline ~100 per unit size; MegaAsteroid now forces x25
    // Use baseSize to scale so larger megas carry more void mass
    (this as any).voidMassUnits = Math.max(1, Math.round(2500 * baseSize));
  }

  public override getDisplayName(): string {
    return `MegaAsteroid ${this.id}`;
  }
}
