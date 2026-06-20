import { Vector3 } from '../../../types/game.types';
import { Planet } from '../../game-objects/Planet';
import { LandingApproachContext } from '../../types/landing.types';
import { vec3Normalize } from '../../math/vector-math';

/**
 * Resolución del centro de un planeta para el aterrizaje. Funciones PURAS (sin estado ni host): el motor
 * les pasa la colección de planetas y el contexto. Antes vivían en GameEngine; lógica idéntica.
 * docs/ARQUITECTURA.md Fase 5.2.
 */
export function getSolarSystemPlanetCenter(planets: Planet[], planetId?: string | null): Vector3 | null {
  if (!planetId) {
    return null;
  }
  const planet = planets.find((p) => p?.id === planetId);
  const source = planet
    ? ((planet as { position?: Vector3; center?: Vector3 }).position
      ?? (planet as { center?: Vector3 }).center
      ?? null)
    : null;
  if (!source) {
    return null;
  }
  return {
    x: source.x ?? 0,
    y: source.y ?? 0,
    z: source.z ?? 0,
  };
}

export function resolvePlanetCenterFromContext(
  planets: Planet[],
  context: LandingApproachContext,
): Vector3 | null {
  if (context.planetCenter) {
    return { ...context.planetCenter };
  }
  const stateCenter = getSolarSystemPlanetCenter(planets, context.planetId);
  if (stateCenter) {
    return stateCenter;
  }
  if (!context.surfacePoint || !context.surfaceNormal) {
    return null;
  }
  const normal = vec3Normalize(context.surfaceNormal);
  const radius = Number.isFinite(context.radius) ? context.radius : 0;
  return {
    x: context.surfacePoint.x - normal.x * radius,
    y: context.surfacePoint.y - normal.y * radius,
    z: context.surfacePoint.z - normal.z * radius,
  };
}

/** Normal de superficie del aterrizaje: la del contexto, o derivada de (surfacePoint − centro). */
export function deriveLandingNormalFromContext(planets: Planet[], context: LandingApproachContext): Vector3 {
  if (context.surfaceNormal) {
    return vec3Normalize(context.surfaceNormal);
  }
  const center = resolvePlanetCenterFromContext(planets, context);
  const surface = context.surfacePoint ?? center;
  if (center && surface) {
    return vec3Normalize({
      x: surface.x - center.x,
      y: surface.y - center.y,
      z: surface.z - center.z,
    });
  }
  return { x: 0, y: 1, z: 0 };
}

/** Punto de contacto del aterrizaje: el surfacePoint del contexto, o centro + normal·radio. */
export function resolveLandingContactPoint(planets: Planet[], context: LandingApproachContext): Vector3 {
  if (context.surfacePoint) {
    return { ...context.surfacePoint };
  }
  const center = resolvePlanetCenterFromContext(planets, context);
  const normal = vec3Normalize(context.surfaceNormal ?? { x: 0, y: 1, z: 0 });
  const radius = Number.isFinite(context.radius) ? context.radius : 0;
  if (center) {
    return {
      x: center.x + normal.x * radius,
      y: center.y + normal.y * radius,
      z: center.z + normal.z * radius,
    };
  }
  return {
    x: normal.x * radius,
    y: normal.y * radius,
    z: normal.z * radius,
  };
}
