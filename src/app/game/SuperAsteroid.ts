import { Vector3 } from '../types/game.types';
import { Asteroid } from './Asteroid';
import { TargetType } from './types/targeting.types';

/**
 * SuperAsteroid: igual que Asteroid pero con tamaño grande.
 * Importante: este constructor NO reescala el tamaño; usa el baseSize tal cual.
 * El multiplicador (p.ej. 3x–5x) se calcula en las factorías/creadores.
 */
export class SuperAsteroid extends Asteroid {
  constructor(
    id: string,
    position: Vector3,
    baseSize: number = 1.0,
    direction?: Vector3
  ) {
    // Usar el tamaño proporcionado directamente (la factoría decide el multiplicador)
    super(id, position, baseSize, direction);
  }

  /**
   * Sobrescribe el tipo de target para identificar explícitamente SuperAsteroid
   */
  public override getTargetType(): TargetType { return TargetType.SUPER_ASTEROID; }

  /**
   * Crea un SuperAsteroide en una posición aleatoria en los bordes del mundo
   * replicando la lógica de posicionamiento de Asteroid pero con gran tamaño
   */
  static createRandomSuperAsteroid(
    id: string,
    worldBounds: { min: Vector3; max: Vector3 },
    centerPosition: Vector3
  ): SuperAsteroid {
    // Reutilizamos el método de Asteroid para base y aplicamos 3..5x
    const tmp = Asteroid.createRandomAsteroid(`${id}-tmp`, worldBounds, centerPosition);
    const mul = 3 + Math.random() * 2; // 3..5
    return new SuperAsteroid(id, { ...tmp.position }, tmp.size * mul, { ...tmp.direction });
  }
}
