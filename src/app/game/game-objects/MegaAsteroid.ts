import { Vector3 } from '../../types/game.types';
import { SuperAsteroid } from './SuperAsteroid';
import { TargetType } from '../types/targeting.types';
import { GameObjectType } from '../types/game-object.types';

interface MegaAsteroidOptions {
  /**
   * When true, the provided size is already in world units and should not be multiplied again.
   * Useful when rehidrating serialized debris where the snapshot already stores the final scale.
   */
  sizeIsAbsolute?: boolean;
}

/**
 * MegaAsteroid: like SuperAsteroid but forced size x25 (previously x5).
 */
export class MegaAsteroid extends SuperAsteroid {
  public static readonly SIZE_MULTIPLIER = 25;

  constructor(id: string, position: Vector3, baseSize: number = 1.0, direction?: Vector3, options?: MegaAsteroidOptions) {
    const finalSize = options?.sizeIsAbsolute ? baseSize : baseSize * MegaAsteroid.SIZE_MULTIPLIER;
    super(id, position, finalSize, direction);
    this.setType(GameObjectType.MEGA_ASTEROID); // Cambiar tipo de super a mega
    (this as any).objectType = TargetType.MEGA_ASTEROID;
    
    // Health: extremely durable (40-60 hits from ship)
    this.healthMax = 2500;
    this.healthCurrent = this.healthMax;
    
    // Assign void mass proportional to size multiplier over SuperAsteroid base
    // SuperAsteroid baseline ~100 per unit size; MegaAsteroid now forces x25
    // Use baseSize to scale so larger megas carry more void mass
    const massBase = options?.sizeIsAbsolute && baseSize > 0
      ? baseSize / MegaAsteroid.SIZE_MULTIPLIER
      : baseSize;
    (this as any).voidMassUnits = Math.max(1, Math.round(2500 * massBase));
  }

  public override getDisplayName(): string {
    return `MegaAsteroid ${this.id}`;
  }
}
