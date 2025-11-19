import { Vector3 } from '../../types/game.types';
import { Planet, PlanetType, PlanetColorName } from './Planet';
import { GameObjectType } from '../types/game-object.types';

/**
 * Protoplanet: identical geometry to Planet, classified as Protoplanet.
 */
export class Protoplanet extends Planet {
  constructor(id: string, colorName: PlanetColorName, radius: number, initialPos: Vector3) {
    super(id, colorName, radius, initialPos);
    this.setType(GameObjectType.PROTOPLANET); // Cambiar tipo de Planet a Protoplanet
    this.planetType = PlanetType.Protoplanet;
  }
}
