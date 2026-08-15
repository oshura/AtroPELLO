import { collisionDamageForType, collisionDamageForConstructor } from './collision-damage';
import { GameObjectType } from '../../../game-objects';

describe('collision-damage', () => {
  it('daño por tipo de objeto', () => {
    expect(collisionDamageForType(GameObjectType.ASTEROID)).toBe(10);
    expect(collisionDamageForType(GameObjectType.SUPER_ASTEROID)).toBe(75);
    expect(collisionDamageForType(GameObjectType.MEGA_ASTEROID)).toBe(150);
    expect(collisionDamageForType(GameObjectType.PLANET)).toBe(100000);
    expect(collisionDamageForType(GameObjectType.SUN)).toBe(100000);
    expect(collisionDamageForType(GameObjectType.PORTAL)).toBe(0);
    expect(collisionDamageForType(GameObjectType.UNKNOWN)).toBeNull();
  });

  it('daño por nombre de constructor (mismos valores)', () => {
    expect(collisionDamageForConstructor('Asteroid')).toBe(10);
    expect(collisionDamageForConstructor('MegaAsteroid')).toBe(150);
    expect(collisionDamageForConstructor('RingedPlanet')).toBe(100000);
    expect(collisionDamageForConstructor('Portal')).toBe(0);
    expect(collisionDamageForConstructor('Desconocido')).toBeNull();
  });

  it('tipo y constructor coinciden (fuente única)', () => {
    expect(collisionDamageForType(GameObjectType.ASTEROID)).toBe(collisionDamageForConstructor('Asteroid'));
    expect(collisionDamageForType(GameObjectType.MEGA_ASTEROID)).toBe(collisionDamageForConstructor('MegaAsteroid'));
    expect(collisionDamageForType(GameObjectType.PLANET)).toBe(collisionDamageForConstructor('Planet'));
  });
});
