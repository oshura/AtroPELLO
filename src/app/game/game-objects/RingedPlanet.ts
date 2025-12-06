import { Vector3 } from '../../types/game.types';
import { Planet, PlanetType, PlanetColorName } from './Planet';
import { GameObjectType } from '../types/game-object.types';

export interface RingedPlanetOptions {
  /** When true, the constructor receives the final radius already (no x2 multiplier). */
  radiusIsAbsolute?: boolean;
}

/**
 * RingedPlanet: same spherical geometry as Planet, but classified as Ringed.
 * Rendering of visible rings is not included (keeps sphere per request).
 */
export class RingedPlanet extends Planet {
  constructor(id: string, colorName: PlanetColorName, radius: number, initialPos: Vector3, options?: RingedPlanetOptions) {
    // Multiply radius by 2 to make ringed planets visually larger (unless snapshot already stores the final radius)
    const multiplier = options?.radiusIsAbsolute ? 1 : 2;
    super(id, colorName, radius * multiplier, initialPos);
    this.setType(GameObjectType.RINGED_PLANET); // Cambiar tipo de Planet a RingedPlanet
    this.planetType = PlanetType.Ringed;
  }
}
