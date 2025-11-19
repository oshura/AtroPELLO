import { Vector3, Color } from '../../types/game.types';
import { Planet, PlanetType, PlanetColorName } from './Planet';
import { GameObjectType } from '../types/game-object.types';

/**
 * GiantPlanet: Planet scaled 10x with void mass x10 and planetType set to Giant.
 */
export class GiantPlanet extends Planet {
  constructor(id: string, colorName: PlanetColorName, radius: number, initialPos: Vector3) {
    // Multiply radius by 4 to make giants visually massive
    super(id, colorName, radius * 4, initialPos);
    this.setType(GameObjectType.GIANT_PLANET); // Cambiar tipo de Planet a GiantPlanet
    this.planetType = PlanetType.Giant;
    // If no void mass set elsewhere, initialize with 10x the baseline range
    if (!this.voidMassUnits || this.voidMassUnits <= 0) {
      this.voidMassUnits = 10 * (2000 + Math.floor(Math.random() * 3001));
    }
  }
}
