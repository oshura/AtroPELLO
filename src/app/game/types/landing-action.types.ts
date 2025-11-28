import { PlanetIntelStatus } from './planet-intel.types';

export enum LandingActionKind {
  REST = 'rest',
  EXPLORE = 'explore',
  DIPLOMACY = 'diplomacy'
}

export enum LandingExploreObjective {
  ARTIFACT = 'artifact',
  VOID_MASS = 'void_mass',
  CIVILIZATION = 'civilization',
  LESSER_BEING = 'lesser_being'
}

export type LandingNarrativeTone = 'info' | 'success' | 'warning' | 'danger';

export interface LandingActionLogEntry {
  tone: LandingNarrativeTone;
  text: string;
}

export interface LandingActionIntelDelta {
  artifact?: PlanetIntelStatus;
  voidMass?: PlanetIntelStatus;
  civilization?: PlanetIntelStatus;
  lesserBeing?: PlanetIntelStatus;
}

export interface LandingReward {
  id: string;
  label: string;
  type: 'artifact' | 'void_mass' | 'intel' | 'resource' | 'memory';
  quantity?: number;
}

export interface LandingActionEffects {
  sanityDelta?: number;
  healthDelta?: number;
  voidEnergyDelta?: number;
  voidMassDrained?: number;
  planetVoidMassRemaining?: number;
  planetCollapsed?: boolean;
  ageDaysDelta?: number;
  experienceDelta?: number;
  intel?: LandingActionIntelDelta;
  itemsAwarded?: LandingReward[];
  interrupted?: boolean;
  needsRetry?: boolean;
  blockedReason?: string;
}

export interface LandingActionRequest {
  planetId: string;
  action: LandingActionKind;
  objective?: LandingExploreObjective;
}

export interface LandingEventResult {
  id: string;
  planetId: string;
  action: LandingActionKind;
  objective?: LandingExploreObjective;
  success: boolean;
  blocked?: boolean;
  probability?: number;
  roll?: number;
  title: string;
  narrative: LandingActionLogEntry[];
  effects: LandingActionEffects;
  timestamp: number;
  metadata?: Record<string, any>;
}
