import { Vector3 } from '../../types/game.types';
import { PlanetIntelStatus, PlanetMissionState, PlanetResourceStock } from './planet-intel.types';

export type RNGSeed = number | string;

export interface OrbitParams {
  center: Vector3;
  semiMajor: number; // a
  semiMinor: number; // b
  orientation: number; // radians in-plane rotation
  normal?: Vector3; // optional full 3D plane normal
  u?: Vector3; // optional major-axis basis in world coords
  angle?: number; // current orbital angle (phi)
  angularSpeed?: number; // rad/s
}

export interface SunSnapshot {
  id: string;
  name?: string;
  position: Vector3;
  radius: number; // use world units
}

export interface PlanetSnapshot {
  id: string;
  name?: string;
  kind?: string; // e.g., 'Dwarf' | 'Ringed' | 'Giant' | etc.
  position: Vector3; // current world position
  radius: number; // world units (maps to scale.x)
  orbit?: OrbitParams; // optional if planet is static
  baseColorName?: string; // cosmetic hint
  probabilityOfLifePct?: number; // [0..100]
  inhabitants?: string;
  lesserBeing?: string | null;
  visited?: boolean;
  lifeScanned?: boolean;
  creatureScanned?: boolean;
  hasArtifact?: boolean;
  artifactIntelStatus?: PlanetIntelStatus;
  hasVoidMass?: boolean;
  voidMassCapacity?: number;
  voidMassRemaining?: number;
  voidMassIntelStatus?: PlanetIntelStatus;
  civilizationIntelStatus?: PlanetIntelStatus;
  lesserBeingIntelStatus?: PlanetIntelStatus;
  pendingMission?: PlanetMissionState | null;
  resourceStock?: PlanetResourceStock;
  animosity?: string;
}

export interface ClusterSnapshot {
  id: string;
  center: Vector3;
  direction: Vector3; // normalized drift direction in world space
  speed: number; // units per second for cluster center
  count: number; // number of members (approx)
  includeSuper?: boolean; // include SuperAsteroids among members
  radius?: number; // cluster dispersion radius
  centerSpeedFactor?: number; // 0..1 how strongly center drives members
}

export interface SolarSystemSnapshot {
  id?: string;
  seed?: RNGSeed;
  timestamp?: number;
  sun: SunSnapshot;
  planets: PlanetSnapshot[];
  clusters?: ClusterSnapshot[];
  portals?: PortalSnapshot[];
  planetDebris?: PlanetDebrisSnapshot[]; // optional serialized debris linked to planets
  meta?: Record<string, any>;
  // Parámetros de asteroides efímeros (debris independientes)
  ephemeralDebris?: {
    checkIntervalMs: number;  // Cada cuánto se evalúa probabilidad (default: 10000ms)
    spawnProbability: number; // Probabilidad 0-1 de spawn en cada check (default: 0.05 = 5%)
    spawnCountMin: number;    // Mínimo de asteroides por evento (default: 1)
    spawnCountMax: number;    // Máximo de asteroides por evento (default: 3)
  };
}

// Eye state for the portal's central eye (Ojo)
export interface EyeState {
  gazeTarget?: 'ship' | Vector3; // 'ship' follows player ship, or a fixed point
  eyelidOpen?: number; // 0..1, 0 closed, 1 fully open
  intensity?: number;  // 0..1 emissive/intensity factor
}

// Persistent snapshot for a portal; supports bidirectional pairing
export interface PortalSnapshot {
  id: string;
  position: Vector3;
  radius: number;
  linkedPortalId?: string; // id of the paired portal for two-way travel
  eyeState?: EyeState;
}

// Serialized debris item (e.g., Earth/Saturn belts mega-asteroids)
export interface PlanetDebrisSnapshot {
  id: string; // debris object id
  planetId: string; // parent planet id
  localOffset: Vector3; // local offset relative to planet center
  size?: number; // optional size or scale hint
  type?: string; // future type classification
}

// Generation options to steer procedural system creation (future expansion)
export interface GenerationOptions {
  sunCount?: 1 | 2;
  planetCountRange?: [number, number];
  clusterConfig?: { trailChance?: number; maxTrailClusters?: number };
  lifeChancePct?: number; // probability of planets with >30% habitability
  maxOrbitSemiMajor?: number;
  minOrbitSpacingPct?: number; // minimal spacing between orbits
  // New extended options for refined generation control
  disableTrail?: boolean; // true => no asteroid trail clusters
  minClouds?: number; // ensure at least this many cloud clusters
  staticClouds?: boolean; // clouds have speed=0 & direction=(0,0,0)
  cloudSuperPct?: number; // probability (0..1) each cloud includes super asteroids
  allowCanonicalNames?: boolean; // false => avoid canonical planet names entirely
  maxGiantRadius?: number; // hard cap for any giant/gaseous/ringed planet radius
  colorPaletteOverride?: string[]; // allowed baseColorName palette for planets
  // New: scale number of cloud GROUPS relative to default (e.g., 0.1 -> one tenth)
  cloudGroupScale?: number;
}
