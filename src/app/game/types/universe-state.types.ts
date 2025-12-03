import { Vector3 } from '../../types/game.types';
import { GameObjectType } from './game-object.types';
import { OrientationSnapshot, RespawnAnchorMetadata } from './respawn.types';

/** Origin describing how a runtime solar-system entry was obtained. */
export enum RuntimeStateSource {
  LIVE = 'LIVE',
  SNAPSHOT = 'SNAPSHOT',
  ARCHIVE = 'ARCHIVE'
}

/** Minimal health descriptor kept for serialized objects. */
export interface HealthSnapshot {
  current: number;
  max: number;
}

/** Generic payload for any game object serialized out of the live store. */
export interface SerializedGameObjectState {
  id: string;
  type: GameObjectType;
  position: Vector3;
  velocity?: Vector3 | null;
  scale?: Vector3 | null;
  orientation?: OrientationSnapshot | null;
  health?: HealthSnapshot | null;
  custom?: Record<string, any> | null;
}

/** Serialized portal info for systems reinstated from persistence. */
export interface SerializedPortalState {
  id: string;
  position: Vector3;
  linkedPortalId?: string | null;
  radius?: number;
  custom?: Record<string, any> | null;
}

/** Minimal representation of NPC / lesser being state. */
export interface SerializedLesserBeingState {
  id: string;
  archetype: string;
  position: Vector3;
  velocity?: Vector3 | null;
  custom?: Record<string, any> | null;
}

/** Environmental and FX toggles associated with a system snapshot. */
export interface RuntimeEnvironmentState {
  ambientScene?: string | null;
  activeEffects?: string[];
  weatherSeed?: number | null;
  custom?: Record<string, any> | null;
}

/** Aggregate payload used when a system must be reconstructed from disk. */
export interface SerializedUniversePayload {
  objects: SerializedGameObjectState[];
  portals?: SerializedPortalState[];
  lesserBeings?: SerializedLesserBeingState[];
  environment?: RuntimeEnvironmentState | null;
  custom?: Record<string, any> | null;
}

/** Descriptor returned by UniverseStateSnapshotService.ensureSystemState(). */
export interface RuntimeSolarSystemState {
  systemId: string;
  snapshotId?: string | null;
  source: RuntimeStateSource;
  capturedAt: number;
  payload?: SerializedUniversePayload | null;
}

/** Reason passed to GameRestartService when restarting the loop. */
export type GameRestartReason = 'RESPAWN' | 'LOAD_GAME' | 'DEBUG';

/** Values applied to the spaceship/player when respawning or loading. */
export interface PlayerResetState {
  position: Vector3;
  velocity: Vector3;
  orientation?: OrientationSnapshot | null;
  shipHealth: HealthSnapshot;
  voidEnergy: number;
  sanity: number;
  vitality: number;
  restoredStat: 'health' | 'sanity' | 'void' | null;
}

/** Context object consumed by GameRestartService.restartWithContext(). */
export interface GameStartContext {
  targetSystemId: string;
  runtimeState: RuntimeSolarSystemState;
  playerState: PlayerResetState;
  respawnAnchor?: RespawnAnchorMetadata | null;
  restartReason: GameRestartReason;
}
