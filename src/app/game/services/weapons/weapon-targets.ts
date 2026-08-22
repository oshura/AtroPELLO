import { Vector3 } from '../../../types/game.types';
import { ProjectileTargetLike } from './projectile-system';

/**
 * Recolección de candidatos de impacto para los proyectiles (Fase 12 — docs/ARMAS.md).
 *
 * El pool de proyectiles no conoce el mundo: alguien tiene que decirle contra qué puede chocar.
 * Estas funciones puras arman esa lista reutilizando los buffers, porque se invocan en el bucle
 * caliente (una vez por frame y sólo si hay proyectiles vivos).
 *
 * Los asteroides de cluster SÍ entran, pero sólo los que están al alcance de un disparo: un
 * barrido contra los miles del sistema por frame no se paga con lo que aporta.
 */

/** Lo mínimo que necesita un objeto del mundo para recibir un impacto. */
export interface DamageableLike {
  id: string;
  position: Vector3;
  healthCurrent: number;
  healthMax: number;
  boundingSphere?: { center: Vector3; radius: number } | null;
  active?: boolean;
  visible?: boolean;
  isActive?: () => boolean;
}

/** Cúmulo de asteroides, en lo mínimo que necesita el filtro de alcance. */
export interface AsteroidClusterLike {
  center: Vector3;
  objects: ReadonlyArray<DamageableLike | null | undefined>;
}

/**
 * Asteroides de cúmulo que un disparo puede alcanzar. Descarta el cúmulo entero por la distancia
 * de su centro antes de mirar sus miembros (broad gate), igual que hace el sistema de colisiones
 * de la nave.
 */
export function collectNearbyClusterTargets(
  clusters: ReadonlyArray<AsteroidClusterLike | null | undefined>,
  origin: Vector3,
  maxDistance: number,
  out: DamageableLike[]
): DamageableLike[] {
  out.length = 0;
  if (!clusters?.length) {
    return out;
  }
  // Margen generoso en el gate: el centro puede estar lejos y tener miembros cerca.
  const clusterGate = maxDistance * 2;
  for (const cluster of clusters) {
    if (!cluster?.objects?.length) {
      continue;
    }
    if (distanceTo(cluster.center, origin) > clusterGate) {
      continue;
    }
    for (const candidate of cluster.objects) {
      if (!isDamageable(candidate) || distanceTo(candidate.position, origin) > maxDistance) {
        continue;
      }
      out.push(candidate);
    }
  }
  return out;
}

function distanceTo(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Radio con el que un objeto para un proyectil. */
export function resolveCollisionRadius(target: DamageableLike, fallback = 10): number {
  const radius = target.boundingSphere?.radius;
  return Number.isFinite(radius) && (radius as number) > 0 ? (radius as number) : fallback;
}

/** ¿Sigue en juego y puede recibir daño? */
export function isDamageable(target: DamageableLike | null | undefined): target is DamageableLike {
  if (!target) {
    return false;
  }
  if (typeof target.isActive === 'function' && !target.isActive()) {
    return false;
  }
  if (target.active === false) {
    return false;
  }
  return Number.isFinite(target.healthCurrent) && target.healthCurrent > 0;
}

/**
 * Vuelca en `out`/`outById` los candidatos vivos de `sources` (se vacían primero).
 * Devuelve el número de candidatos.
 */
export function collectProjectileTargets(
  sources: ReadonlyArray<ReadonlyArray<DamageableLike | null | undefined> | null | undefined>,
  out: ProjectileTargetLike[],
  outById: Map<string, DamageableLike>
): number {
  out.length = 0;
  outById.clear();
  for (const source of sources) {
    if (!source?.length) {
      continue;
    }
    for (const candidate of source) {
      if (!isDamageable(candidate) || outById.has(candidate.id)) {
        continue;
      }
      outById.set(candidate.id, candidate);
      out.push({
        id: candidate.id,
        position: candidate.position,
        radius: resolveCollisionRadius(candidate),
      });
    }
  }
  return out.length;
}
