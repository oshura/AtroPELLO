import { Vector3 } from '../../types/game.types';
import { Planet, PlanetType, PlanetColorName } from './Planet';
import { GameObjectType } from '../types/game-object.types';

/**
 * DwarfPlanet: identical geometry to Planet, classified as Dwarf.
 */
export class DwarfPlanet extends Planet {
  constructor(id: string, colorName: PlanetColorName, radius: number, initialPos: Vector3) {
    super(id, colorName, radius, initialPos);
    this.setType(GameObjectType.DWARF_PLANET); // Cambiar tipo de Planet a DwarfPlanet
    this.planetType = PlanetType.Dwarf;
  }
}
