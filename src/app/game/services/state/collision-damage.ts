import { GameObjectType } from '../../game-objects';

/**
 * Tabla ÚNICA de daño por colisión según el objeto impactado. Antes vivía DUPLICADA en GameEngine: una
 * versión por `GameObjectType` y otra por nombre de constructor, con los MISMOS valores. Aquí comparten
 * las constantes (fuente única). Funciones puras. docs/ARQUITECTURA.md Fase 5.4.
 */
const COLLISION_DAMAGE = {
  asteroid: 10,
  superAsteroid: 75,
  megaAsteroid: 150,
  planetary: 100000, // planetas + sol: impacto letal
  portal: 0,
} as const;

/** Daño de colisión por tipo de objeto (null = tipo sin daño definido). */
export function collisionDamageForType(type: GameObjectType): number | null {
  switch (type) {
    case GameObjectType.ASTEROID:
    case GameObjectType.CLUSTER:
      return COLLISION_DAMAGE.asteroid;
    case GameObjectType.SUPER_ASTEROID:
      return COLLISION_DAMAGE.superAsteroid;
    case GameObjectType.MEGA_ASTEROID:
      return COLLISION_DAMAGE.megaAsteroid;
    case GameObjectType.PLANET:
    case GameObjectType.DWARF_PLANET:
    case GameObjectType.PROTOPLANET:
    case GameObjectType.GIANT_PLANET:
    case GameObjectType.GASEOUS_PLANET:
    case GameObjectType.RINGED_PLANET:
    case GameObjectType.EARTH_SPLIT_PLANET:
    case GameObjectType.SUN:
      return COLLISION_DAMAGE.planetary;
    case GameObjectType.PORTAL:
      return COLLISION_DAMAGE.portal;
    default:
      return null;
  }
}

/** Daño de colisión por nombre de constructor (fallback cuando no hay GameObjectType). Mismos valores. */
export function collisionDamageForConstructor(name: string): number | null {
  switch (name) {
    case 'Asteroid':
    case 'ClusterObject':
      return COLLISION_DAMAGE.asteroid;
    case 'SuperAsteroid':
      return COLLISION_DAMAGE.superAsteroid;
    case 'MegaAsteroid':
      return COLLISION_DAMAGE.megaAsteroid;
    case 'Planet':
    case 'RingedPlanet':
    case 'GaseousPlanet':
    case 'GiantPlanet':
    case 'DwarfPlanet':
    case 'Protoplanet':
    case 'EarthSplitPlanet':
    case 'Sun':
      return COLLISION_DAMAGE.planetary;
    case 'Portal':
      return COLLISION_DAMAGE.portal;
    default:
      return null;
  }
}
