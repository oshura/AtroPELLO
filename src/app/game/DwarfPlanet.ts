import { Vector3 } from '../types/game.types';
import { Planet, PlanetType, PlanetColorName } from './Planet';

/**
 * DwarfPlanet: identical geometry to Planet, classified as Dwarf.
 */
export class DwarfPlanet extends Planet {
  constructor(id: string, colorName: PlanetColorName, radius: number, initialPos: Vector3) {
    super(id, colorName, radius, initialPos);
    this.planetType = PlanetType.Dwarf;
  }
}
