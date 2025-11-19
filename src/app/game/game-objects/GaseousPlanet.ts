import { Vector3 } from '../../types/game.types';
import { Planet, PlanetType, PlanetColorName } from './Planet';
import { GameObjectType } from '../types/game-object.types';

/**
 * GaseousPlanet: Cannot collide (placeholder), type set to Gaseous.
 * We keep geometry identical to Planet; collision systems should check the flag.
 */
export class GaseousPlanet extends Planet {
  // Flag for future collision system
  public nonCollidable: boolean = true;

  constructor(id: string, colorName: PlanetColorName, radius: number, initialPos: Vector3) {
    super(id, colorName, radius, initialPos);
    this.setType(GameObjectType.GASEOUS_PLANET); // Cambiar tipo de Planet a GaseousPlanet
    this.planetType = PlanetType.Gaseous;
  }

  // Optional: override checkCollision to always return false until system supports flags
  public override checkCollision(other: any): boolean { return false; }
}
