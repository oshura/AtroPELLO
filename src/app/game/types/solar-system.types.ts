import { Vector3 } from '../../types/game.types';
import { PlanetIntelStatus, PlanetMissionState, PlanetResourceStock } from './planet-intel.types';
import { GameObjectAnimosity } from './animosity.types';

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
  /** Inclinación axial en radianes (persistida para que sobreviva a save/load). */
  axialTiltRad?: number;
  /**
   * Radio original de construcción. `radius` es el radio VISIBLE actual (puede estar
   * encogido por cosecha de void mass); reconstruir con `radius` como initialRadius
   * provocaba doble encogimiento acumulativo en cada save/load o salto de portal.
   */
  initialRadius?: number;
  /**
   * Cinturón de debris a generar en la construcción inicial (p. ej. Saturno). Es una PISTA DE
   * GENERACIÓN, no estado persistente: los objetos de debris se serializan aparte
   * (snapshot.planetDebris), por eso no pasa por el códec de planeta. docs/ARQUITECTURA.md Fase 6.4.
   */
  debrisBelt?: PlanetDebrisBeltConfig;
}

/** Configuración data-driven de un cinturón de debris alrededor de un planeta. */
export interface PlanetDebrisBeltConfig {
  count: number;
  spreadScale?: number;
  yScale?: number;
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

/**
 * Metadatos tipados de un snapshot de sistema (ver docs/ARQUITECTURA.md §4.3, Fase 3).
 * Las claves conocidas están declaradas; el index signature mantiene compatibilidad con
 * accesos sueltos y campos futuros. La IDENTIDAD de un sistema se resuelve ÚNICAMENTE con
 * `system-identity.ts` — no reimplementar precedencias de `proceduralSystemId`/etc. a mano.
 */
export interface SolarSystemMeta {
  /** Clave persistente del sistema (dedup/evicción/memoria de lesser beings). */
  persistentSystemId?: string;
  /** Id procedural derivado de la semilla (estable entre visitas). */
  proceduralSystemId?: string;
  /** Id lógico alternativo. */
  systemId?: string;
  /** Id del snapshot del que derivó esta captura. */
  sourceSystemId?: string;
  /** Etiqueta humana bajo la que PortalPersistence guarda el snapshot. */
  snapshotLabel?: string;
  /** true si es un sistema artesanal (p.ej. el humano), no procedural. */
  handcrafted?: boolean;
  /** Deidad asignada al sistema. */
  elderGod?: string;
  /** Radio del límite del sistema (unidades de mundo). */
  systemRadius?: number;
  /** Memoria de lesser beings errantes embebida en el snapshot. */
  lesserBeingMemory?: unknown[];
  /** Estado de entorno/FX embebido. */
  environment?: Record<string, unknown> | null;
  /** Timestamp de la última captura runtime. */
  lastRuntimeCaptureAt?: number;
  /** true si el snapshot se reconstruyó desde un payload por-objeto. */
  reconstructedFromPayload?: boolean;
  /** Timestamp de archivado en el archivo procedural. */
  archivedAt?: number;
  // Index signature: accesos sueltos y campos futuros siguen compilando.
  [key: string]: any;
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
  meta?: SolarSystemMeta;
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
  animosity?: GameObjectAnimosity;
  concordSealActive?: boolean;
  concordSealActivatedAt?: number;
  preventsLesserIncursions?: boolean;
  /** Color base del planeta de origen capturado durante el Gate Rite (tinte del portal). */
  planetColorRef?: { r: number; g: number; b: number; a?: number };
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
