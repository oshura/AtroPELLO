import { Vector3 } from '../types/game.types';
import { Planet, PlanetType, PlanetColorName } from './Planet';

/**
 * RingedPlanet: same spherical geometry as Planet, but classified as Ringed.
 * Rendering of visible rings is not included (keeps sphere per request).
 */
export class RingedPlanet extends Planet {
  constructor(id: string, colorName: PlanetColorName, radius: number, initialPos: Vector3) {
    // Multiply radius by 2 to make ringed planets visually larger
    super(id, colorName, radius * 2, initialPos);
    this.planetType = PlanetType.Ringed;
  }
}
