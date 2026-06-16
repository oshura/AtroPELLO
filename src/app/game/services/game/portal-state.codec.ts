import { Portal } from '../../game-objects/Portal';
import { EyeState, PortalSnapshot } from '../../types/solar-system.types';
import { SerializedPortalState } from '../../types/universe-state.types';
import { Vector3 } from '../../../types/game.types';
import { LoggingService } from '../../../services/logging.service';

/**
 * FUENTE ÚNICA DE VERDAD de los campos persistentes de un portal
 * (docs/ARQUITECTURA.md §4.3, Fase 2.5). Mismo patrón que planet-state.codec:
 * captura, aplicación y puente con el payload del savegame viven SOLO aquí.
 */

function cloneVec(vec: Vector3 | null | undefined): Vector3 | undefined {
  if (!vec) {
    return undefined;
  }
  return { x: Number(vec.x) || 0, y: Number(vec.y) || 0, z: Number(vec.z) || 0 };
}

export function cloneEyeState(state?: EyeState | null): EyeState | undefined {
  if (!state) {
    return undefined;
  }
  const clone: EyeState = { ...state };
  if (typeof state.gazeTarget === 'object' && state.gazeTarget !== null) {
    clone.gazeTarget = { ...(state.gazeTarget as Vector3) };
  }
  return clone;
}

function clonePlanetColorRef(
  ref: PortalSnapshot['planetColorRef'] | null | undefined
): PortalSnapshot['planetColorRef'] | undefined {
  return ref ? { ...ref } : undefined;
}

/** Captura todos los campos persistentes de un portal vivo. */
export function capturePortalSnapshot(portal: Portal): PortalSnapshot {
  return {
    id: portal.id,
    position: cloneVec(portal.position) ?? { x: 0, y: 0, z: 0 },
    radius: typeof portal.radius === 'number' && Number.isFinite(portal.radius) ? portal.radius : 100,
    linkedPortalId: portal.linkedPortalId,
    eyeState: cloneEyeState(portal.eyeState),
    animosity: portal.animosity,
    concordSealActive: portal.concordSealActive ?? false,
    concordSealActivatedAt: portal.concordSealActivatedAt || undefined,
    preventsLesserIncursions: portal.preventsLesserIncursions || undefined,
    planetColorRef: clonePlanetColorRef(portal.planetColorRef),
  };
}

/** Aplica los campos persistentes a un portal YA construido (no toca id/posición/radio). */
export function applyPortalSnapshotFields(portal: Portal, snap: PortalSnapshot): void {
  portal.linkedPortalId = snap.linkedPortalId;
  portal.applyEyeState(snap.eyeState);
  if (snap.animosity) {
    try { portal.setAnimosity(snap.animosity); } catch { /* animosidad inválida: se ignora */ }
  }
  if (typeof snap.concordSealActive === 'boolean') {
    portal.setConcordSealState(
      snap.concordSealActive,
      snap.preventsLesserIncursions ?? portal.preventsLesserIncursions,
      snap.concordSealActivatedAt,
      { immediateStrength: true }
    );
  }
  if (snap.planetColorRef) {
    portal.planetColorRef = { ...snap.planetColorRef };
  }
}

/** Factory canónica: construye el Portal desde su snapshot y aplica todos los campos. */
export function createPortalFromSnapshot(snap: PortalSnapshot, logger?: LoggingService): Portal {
  const portal = new Portal(snap.id, { ...snap.position }, snap.radius, logger);
  applyPortalSnapshotFields(portal, snap);
  return portal;
}

/** Forma por-objeto usada por el payload del savegame (SerializedPortalState). */
export function serializedFromPortalSnapshot(snap: PortalSnapshot): SerializedPortalState {
  const custom: Record<string, any> = {
    animosity: snap.animosity,
    concordSealActive: snap.concordSealActive ?? false,
    concordSealActivatedAt: snap.concordSealActivatedAt || undefined,
    preventsLesserIncursions: snap.preventsLesserIncursions || undefined,
    eyeState: cloneEyeState(snap.eyeState),
    planetColorRef: clonePlanetColorRef(snap.planetColorRef),
  };
  for (const key of Object.keys(custom)) {
    if (custom[key] === undefined) {
      delete custom[key];
    }
  }
  return {
    id: snap.id,
    position: { ...snap.position },
    linkedPortalId: snap.linkedPortalId ?? null,
    radius: snap.radius,
    custom: Object.keys(custom).length ? custom : null,
  };
}

/** Reconstruye el snapshot canónico desde la forma por-objeto del savegame. */
export function portalSnapshotFromSerialized(serialized: SerializedPortalState): PortalSnapshot {
  const custom = serialized.custom ?? {};
  return {
    id: serialized.id,
    position: cloneVec(serialized.position) ?? { x: 0, y: 0, z: 0 },
    radius: serialized.radius ?? 350,
    linkedPortalId: serialized.linkedPortalId ?? undefined,
    eyeState: cloneEyeState(custom['eyeState']),
    animosity: custom['animosity'],
    concordSealActive: custom['concordSealActive'],
    concordSealActivatedAt: custom['concordSealActivatedAt'],
    preventsLesserIncursions: custom['preventsLesserIncursions'],
    planetColorRef: clonePlanetColorRef(custom['planetColorRef']),
  };
}
