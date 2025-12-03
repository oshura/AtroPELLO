import { Vector3 } from '../../types/game.types';

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
  /** Landing surface metadata taken from the touchdown context. */
  landingSite?: {
    surfacePoint: Vector3;
    surfaceNormal: Vector3;
    radius: number;
  };
  /** Additional free-form metadata. */
  notes?: string | null;
}
