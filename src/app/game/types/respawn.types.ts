import { Vector3 } from '../../types/game.types';

/** Snapshot of ship orientation stored during respawn-related events. */
export interface OrientationSnapshot {
  /** Quaternion components [x, y, z, w] matching gl-matrix order. */
  quaternion?: [number, number, number, number] | null;
  /** Optional 4x4 matrix (column-major) flattened to length 16. */
  matrix?: number[] | null;
  /** Forward vector derived from the ship at capture time. */
  forward?: Vector3 | null;
  /** Up vector to help reconstruct banking. */
  up?: Vector3 | null;
}

/**
 * Metadata persisted when the player engraves a Respawn Sigillum while landed.
 * The data is intentionally lightweight so it can be reused by future respawn flows
 * or exposed in UI overlays/dialogs.
 */
export interface RespawnAnchorMetadata {
  /** Unique identifier for the anchor (usually timestamp-based). */
  anchorId: string;
  /** Solar system identifier resolved from the active snapshot. */
  systemId: string;
  /** Optional snapshot identifier (human/procedural/portal). */
  snapshotId?: string | null;
  /** Optional label stored in PortalPersistence to rehydrate the system. */
  snapshotLabel?: string | null;
  /** Planet identifier where the sigil was written (if any). */
  planetId?: string | null;
  /** Human-readable label for the landing site. */
  planetName?: string | null;
  /** Unix timestamp (ms) when the sigil was committed. */
  createdAt: number;
  /** Optional friendly tag to show in UI components. */
  label?: string | null;
  /** Raw ship position captured when the sigil completed. */
  shipPosition: Vector3;
  /** Forward vector snapshot for the ship (normalized). */
  shipForward?: Vector3 | null;
  /** Velocity snapshot to smoothly reintroduce motion if desired. */
  shipVelocity?: Vector3 | null;
  /** Full orientation state to rebuild quaternion/matrix. */
  shipOrientation?: OrientationSnapshot | null;
  /** Landing surface metadata taken from the touchdown context. */
  landingSite?: {
    surfacePoint: Vector3;
    surfaceNormal: Vector3;
    radius: number;
  };
  /** Whether the sigil seared while airborne (no landing context). */
  airborneCapture?: boolean;
  /** Additional free-form metadata. */
  notes?: string | null;
}
