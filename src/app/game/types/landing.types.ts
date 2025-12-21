import { Vector3 } from '../../types/game.types';
import { PlanetType } from '../game-objects/Planet';

export interface LandingPlanetIntel {
  planetInhabitantsDisplay: string;
  planetLesserBeingDisplay: string;
  planetLifeIntelKnown: boolean;
  planetCreatureIntelKnown: boolean;
  planetHasKnownSpecies: boolean;
  planetVisited: boolean;
}

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
  planetCenter: Vector3;
  lastUpdatedMs: number;
  planetIntel?: LandingPlanetIntel;
  probabilityOfLifePct?: number;
  /** Flag set when the touchdown was auto-triggered by a soft contact in la atmósfera */
  autoLand?: boolean;
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
