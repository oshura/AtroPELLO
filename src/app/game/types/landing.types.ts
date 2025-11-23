import { Vector3 } from '../../types/game.types';
import { PlanetType } from '../game-objects/Planet';

/** Snapshot of the ship-to-planet geometry when evaluating a landing window. */
export interface LandingApproachContext {
  planetId: string;
  planetName: string;
  planetType?: PlanetType;
  radius: number;
  distanceToSurface: number;
  relativeSpeed: number;
  alignmentDot: number;
  surfaceNormal: Vector3;
  surfacePoint: Vector3;
  lastUpdatedMs: number;
}

/** Result of the landing readiness evaluation shown on the HUD. */
export interface LandingStatus {
  ready: boolean;
  context: LandingApproachContext | null;
}

/** Reasons why landing is currently unsafe (red pilot indicator). */
export interface LandingThreatState {
  active: boolean;
  reasons: string[];
}

/** Minimal data snapshot consumed by the HUD pilot lights. */
export interface LandingIndicatorsSnapshot {
  landingReady: boolean;
  threatActive: boolean;
}
