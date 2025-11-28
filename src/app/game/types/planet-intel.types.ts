import { GameObjectAnimosity } from './animosity.types';
import { LesserBeing, PlanetInhabitants } from './cosmic-life.types';

export const PLANET_INTEL_STATUS = {
  UNKNOWN: 'unknown',
  CONFIRMED_PRESENT: 'confirmed_present',
  CONFIRMED_ABSENT: 'confirmed_absent'
} as const;

export type PlanetIntelStatus = typeof PLANET_INTEL_STATUS[keyof typeof PLANET_INTEL_STATUS];

export interface PlanetIntelState {
  hasArtifact: boolean;
  artifactIntelStatus: PlanetIntelStatus;
  hasVoidMass: boolean;
  voidMassIntelStatus: PlanetIntelStatus;
  /** Total void mass the planet once held (units). */
  voidMassCapacity: number;
  /** Remaining void mass after harvests (units). */
  voidMassRemaining: number;
  civilizationIntelStatus: PlanetIntelStatus;
  lesserBeingIntelStatus: PlanetIntelStatus;
}

export type PlanetMissionType = 'artifact' | 'material';
export type PlanetMissionStatus =
  | 'offered'
  | 'accepted'
  | 'in-progress'
  | 'ready-to-turn-in'
  | 'completed'
  | 'failed';

export type MissionClueTier = 'minor' | 'major' | 'final';

export interface MissionClueToken {
  id: string;
  tier: MissionClueTier;
  summary: string;
  method: 'bribe' | 'subtask' | 'vision' | 'reward' | 'other';
  obtainedAt: number;
  cost?: Partial<PlanetResourceStock>;
}

export type MissionSubTaskStatus = 'available' | 'in-progress' | 'completed' | 'failed';

export interface MissionSubTask {
  id: string;
  label: string;
  description?: string;
  status: MissionSubTaskStatus;
  rewardTier: MissionClueTier;
  cooldownMs?: number;
  lastUpdatedAt: number;
  cost?: Partial<PlanetResourceStock>;
  healthCost?: number;
  sanityCost?: number;
  failDamage?: number;
}

export interface PlanetMissionTarget {
  systemId: string;
  planetId?: string;
  clusterId?: string;
}

export interface PlanetMissionReward {
  memorySharePct?: number;
  resources?: Partial<PlanetResourceStock>;
  experience?: number;
  uniqueGlyphId?: string;
}

export interface PlanetMissionLogEntry {
  timestamp: number;
  event: string;
  payload?: Record<string, any>;
}

export interface PlanetMissionState {
  id: string;
  race: PlanetInhabitants;
  type: PlanetMissionType;
  targetLocation: PlanetMissionTarget;
  itemId: string;
  description?: string;
  dialogueScriptId?: string;
  status: PlanetMissionStatus;
  reward?: PlanetMissionReward;
  log: PlanetMissionLogEntry[];
  missionName?: string;
  requestedBy?: PlanetInhabitants;
  clueTokens: MissionClueToken[];
  requiredClueTiers?: MissionClueTier[];
  subTasks?: MissionSubTask[];
}

export const PLANET_RESOURCE_KINDS = ['metal', 'non_metal', 'organic', 'void_matter'] as const;
export type PlanetResourceKind = typeof PLANET_RESOURCE_KINDS[number];
export type PlanetResourceStock = Partial<Record<PlanetResourceKind, number>>;

export interface PlanetIntelSnapshot extends PlanetIntelState {
  planetId: string;
  planetName?: string;
  inhabitants?: PlanetInhabitants;
  lesserBeing?: LesserBeing | null;
  pendingMission?: PlanetMissionState | null;
  resourceStock: PlanetResourceStock;
  visited: boolean;
  lifeScanned: boolean;
  creatureScanned: boolean;
  animosity?: GameObjectAnimosity;
  updatedAt: number;
}

export function createEmptyResourceStock(): PlanetResourceStock {
  const stock: PlanetResourceStock = {};
  for (const kind of PLANET_RESOURCE_KINDS) {
    stock[kind] = 0;
  }
  return stock;
}

export function createDefaultPlanetIntelState(): PlanetIntelState {
  return {
    hasArtifact: false,
    artifactIntelStatus: PLANET_INTEL_STATUS.UNKNOWN,
    hasVoidMass: false,
    voidMassIntelStatus: PLANET_INTEL_STATUS.UNKNOWN,
    voidMassCapacity: 0,
    voidMassRemaining: 0,
    civilizationIntelStatus: PLANET_INTEL_STATUS.UNKNOWN,
    lesserBeingIntelStatus: PLANET_INTEL_STATUS.UNKNOWN
  };
}

export function createEmptyPlanetIntelSnapshot(planetId: string): PlanetIntelSnapshot {
  return {
    planetId,
    planetName: undefined,
    inhabitants: undefined,
    lesserBeing: null,
    pendingMission: null,
    resourceStock: createEmptyResourceStock(),
    visited: false,
    lifeScanned: false,
    creatureScanned: false,
    animosity: undefined,
    updatedAt: Date.now(),
    ...createDefaultPlanetIntelState()
  };
}
