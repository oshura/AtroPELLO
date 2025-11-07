import { Vector3 } from '../../types/game.types';

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
  meta?: Record<string, any>;
}
