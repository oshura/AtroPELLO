import { Vector3 } from '../types/game.types';
import { Planet, PlanetType, PlanetColorName } from './Planet';

/**
 * Protoplanet: identical geometry to Planet, classified as Protoplanet.
 */
export class Protoplanet extends Planet {
  constructor(id: string, colorName: PlanetColorName, radius: number, initialPos: Vector3) {
    super(id, colorName, radius, initialPos);
    this.planetType = PlanetType.Protoplanet;
  }
}
