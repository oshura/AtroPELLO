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
  civilizationIntelStatus: PlanetIntelStatus;
  lesserBeingIntelStatus: PlanetIntelStatus;
}

export type PlanetMissionType = 'artifact' | 'material';
export type PlanetMissionProgress = 'offered' | 'in-progress' | 'ready-to-turn-in' | 'completed';

export interface PlanetMissionTarget {
  systemId: string;
  planetId?: string;
  clusterId?: string;
}

export interface PlanetMissionState {
  id: string;
  type: PlanetMissionType;
  targetLocation: PlanetMissionTarget;
  itemId: string;
  description?: string;
  dialogueScriptId?: string;
  status: PlanetMissionProgress;
  memoryRewardPercent?: number;
  requestedBy?: PlanetInhabitants;
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
