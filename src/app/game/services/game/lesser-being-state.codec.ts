import { LesserBeingBase } from '../../game-objects/lesser-beings/lesser-being-base';
import { LesserBeing, LesserBeingInstanceSnapshot } from '../../types/cosmic-life.types';
import { SerializedLesserBeingState } from '../../types/universe-state.types';
import { Vector3 } from '../../../types/game.types';

/**
 * FUENTE ÚNICA DE VERDAD del estado persistente de lesser beings
 * (docs/ARQUITECTURA.md §4.3, Fase 2.6). `LesserBeingInstanceSnapshot` es la forma
 * canónica; aquí viven la captura desde instancias vivas, el clonado profundo y el
 * puente con la forma por-objeto del savegame.
 * (La resurrección snapshot → instancia viva sigue en LesserBeingSpawner.reviveFromSnapshot.)
 */

function cloneVec(vec: Vector3 | null | undefined): Vector3 | undefined {
  if (!vec) {
    return undefined;
  }
  return { x: Number(vec.x) || 0, y: Number(vec.y) || 0, z: Number(vec.z) || 0 };
}

/** Captura el estado persistente de un lesser being vivo. */
export function captureLesserBeingSnapshot(being: LesserBeingBase): LesserBeingInstanceSnapshot {
  return {
    id: being.id,
    type: being.beingType,
    position: { ...being.position },
    velocity: { ...being.velocity },
    forward: { ...being.forwardDirection },
    hasLanded: being.hasLanded,
    landedPlanetId: being.landedPlanetId,
    health: { current: being.healthCurrent, max: being.healthMax },
  };
}

/** Clon profundo de un snapshot (todas las copias deben pasar por aquí). */
export function cloneLesserBeingSnapshot(snap: LesserBeingInstanceSnapshot): LesserBeingInstanceSnapshot {
  return {
    ...snap,
    position: { ...snap.position },
    velocity: snap.velocity ? { ...snap.velocity } : undefined,
    forward: snap.forward ? { ...snap.forward } : undefined,
    health: snap.health ? { ...snap.health } : undefined,
    metadata: snap.metadata ? { ...snap.metadata } : undefined,
  };
}

/** Forma por-objeto usada por el payload del savegame. */
export function serializedFromLesserBeingSnapshot(snap: LesserBeingInstanceSnapshot): SerializedLesserBeingState {
  const custom: Record<string, any> = {};
  if (snap.forward) {
    custom['forward'] = { ...snap.forward };
  }
  if (snap.hasLanded !== undefined) {
    custom['hasLanded'] = snap.hasLanded;
  }
  if (snap.landedPlanetId) {
    custom['landedPlanetId'] = snap.landedPlanetId;
  }
  if (snap.health) {
    custom['health'] = { ...snap.health };
  }
  if (snap.metadata) {
    custom['metadata'] = { ...snap.metadata };
  }
  return {
    id: snap.id,
    archetype: snap.type,
    position: { ...snap.position },
    velocity: snap.velocity ? { ...snap.velocity } : null,
    custom: Object.keys(custom).length ? custom : null,
  };
}

/** Reconstruye el snapshot canónico desde la forma por-objeto del savegame. */
export function lesserBeingSnapshotFromSerialized(entry: SerializedLesserBeingState): LesserBeingInstanceSnapshot {
  return {
    id: entry.id,
    type: (entry.archetype as LesserBeing) || LesserBeing.NONE,
    position: cloneVec(entry.position) ?? { x: 0, y: 0, z: 0 },
    velocity: cloneVec(entry.velocity) ?? undefined,
    forward: cloneVec(entry.custom?.['forward']) ?? undefined,
    hasLanded: Boolean(entry.custom?.['hasLanded']),
    landedPlanetId: entry.custom?.['landedPlanetId'] ?? null,
    health: entry.custom?.['health'] ? { ...entry.custom['health'] } : undefined,
    metadata: entry.custom?.['metadata'] ? { ...entry.custom['metadata'] } : undefined,
  };
}
