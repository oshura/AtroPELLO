import {
  MissionClueToken,
  MissionSubTaskStatus,
  PlanetIntelStatus,
  PlanetMissionStatus,
  PlanetResourceStock
} from './planet-intel.types';
import { CargoCompositionKind } from './inventory.types';

export enum LandingActionKind {
  REST = 'rest',
  EXPLORE = 'explore',
  DIPLOMACY = 'diplomacy'
}

export enum LandingDiplomacyAction {
  OFFER_BRIBE = 'offer_bribe',
  RUN_SUBTASK = 'run_subtask',
  REQUEST_VISION = 'request_vision',
  COMPLETE_MISSION = 'complete_mission',
  ACCEPT_MISSION = 'accept_mission',
  REVIEW_MISSION = 'review_mission',
  REPAIR_SHIP = 'repair_ship',
  HEAL_CREW = 'heal_crew',
  ALLY_FULL_REPAIR = 'ally_full_repair',
  ALLY_WISDOM_RITE = 'ally_wisdom_rite',
  ALLY_SHARE_LIFESPAN = 'ally_share_lifespan',
  ENEMY_CONFRONT_LESSER = 'enemy_confront_lesser'
}

export interface LandingDiplomacyRequest {
  action: LandingDiplomacyAction;
  subTaskId?: string;
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
  clueTokensAwarded?: MissionClueToken[];
  missionStatus?: PlanetMissionStatus;
  subTaskUpdate?: {
    id: string;
    status: MissionSubTaskStatus;
  };
  resourcesSpent?: Partial<PlanetResourceStock>;
  shipHealthDelta?: number;
  shipHealthSnapshot?: { current: number; max: number };
  cargoSpent?: Array<{ kind: CargoCompositionKind; units: number }>;
  memoryDelta?: number;
}

export interface LandingActionRequest {
  planetId: string;
  action: LandingActionKind;
  objective?: LandingExploreObjective;
  diplomacy?: LandingDiplomacyRequest;
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
