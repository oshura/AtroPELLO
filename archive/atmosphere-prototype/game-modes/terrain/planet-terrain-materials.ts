import { PlanetType } from '../../game-objects/Planet';
import {
  PlanetTerrainMaterialLayer,
  PlanetTerrainMaterialProfile,
  PlanetTerrainMaterialId,
  PlanetTerrainNoiseConfig,
  PlanetTerrainProceduralProfile,
  PlanetTerrainLODSpec,
} from './planet-terrain.types';

const DEFAULT_LOD_SPECS: PlanetTerrainLODSpec[] = [
  { level: 'near', maxDistance: 50, subdivisions: 5 },
  { level: 'mid', maxDistance: 100, subdivisions: 4 },
  { level: 'far', maxDistance: 260, subdivisions: 3 },
];

const GIANT_LOD_SPECS: PlanetTerrainLODSpec[] = [
  { level: 'near', maxDistance: 120, subdivisions: 5 },
  { level: 'mid', maxDistance: 260, subdivisions: 4 },
  { level: 'far', maxDistance: 520, subdivisions: 3 },
];

const createMaterialLayer = (
  materialId: PlanetTerrainMaterialId,
  minHeight: number,
  maxHeight: number,
  blend: number,
  tint: [number, number, number],
  roughness: number,
  metallic: number,
): PlanetTerrainMaterialLayer => ({
  materialId,
  minHeight,
  maxHeight,
  blend,
  tint,
  roughness,
  metallic,
});

const BASALT_PROFILE: PlanetTerrainMaterialProfile = {
  id: 'basaltic-ridge',
  label: 'Cordilleras basálticas',
  detailScale: 3,
  colorVariance: 0.08,
  layers: [
    createMaterialLayer(PlanetTerrainMaterialId.BASALT, -60, 20, 0.15, [0.32, 0.29, 0.26], 0.85, 0.05),
    createMaterialLayer(PlanetTerrainMaterialId.CRYSTAL, 15, 35, 0.2, [0.55, 0.48, 0.42], 0.6, 0.08),
    createMaterialLayer(PlanetTerrainMaterialId.FROST, 30, 90, 0.25, [0.78, 0.82, 0.88], 0.4, 0.02),
  ],
};

const DUNE_PROFILE: PlanetTerrainMaterialProfile = {
  id: 'dune-fields',
  label: 'Campos de dunas',
  detailScale: 2,
  colorVariance: 0.12,
  layers: [
    createMaterialLayer(PlanetTerrainMaterialId.SAND, -40, 10, 0.2, [0.74, 0.56, 0.32], 0.7, 0.03),
    createMaterialLayer(PlanetTerrainMaterialId.DUNE, 8, 40, 0.3, [0.86, 0.68, 0.42], 0.55, 0.02),
    createMaterialLayer(PlanetTerrainMaterialId.CRYSTAL, 35, 80, 0.18, [0.98, 0.9, 0.65], 0.3, 0.01),
  ],
};

const ICE_PROFILE: PlanetTerrainMaterialProfile = {
  id: 'polar-ice',
  label: 'Llanuras heladas',
  detailScale: 4,
  colorVariance: 0.05,
  layers: [
    createMaterialLayer(PlanetTerrainMaterialId.ICE, -50, 15, 0.25, [0.78, 0.9, 0.97], 0.4, 0.02),
    createMaterialLayer(PlanetTerrainMaterialId.FROST, 10, 60, 0.3, [0.9, 0.96, 0.99], 0.25, 0.01),
    createMaterialLayer(PlanetTerrainMaterialId.CRYSTAL, 55, 120, 0.15, [0.94, 0.98, 0.99], 0.2, 0.01),
  ],
};

const createNoiseConfig = (
  baseFrequency: number,
  frequencyGain: number,
  persistence: number,
  octaves: number,
  amplitude: number,
  ridgeAmplitude: number,
  ridgeSharpness: number,
  ridgeFrequencyMultiplier: number,
): PlanetTerrainNoiseConfig => ({
  baseFrequency,
  frequencyGain,
  persistence,
  octaves,
  amplitude,
  ridgeAmplitude,
  ridgeSharpness,
  ridgeFrequencyMultiplier,
});

const DEFAULT_NOISE = createNoiseConfig(0.9, 1.9, 0.5, 4, 28, 18, 1.6, 2.4);
const DUNE_NOISE = createNoiseConfig(0.45, 2.1, 0.65, 5, 22, 12, 1.3, 2.2);
const ICE_NOISE = createNoiseConfig(1.2, 1.7, 0.55, 4, 18, 32, 2.2, 2.8);
const GIANT_NOISE = createNoiseConfig(0.6, 1.6, 0.58, 5, 90, 45, 1.4, 2.0);

const createProfile = (
  planetType: PlanetType | 'default',
  materialProfile: PlanetTerrainMaterialProfile,
  noise: PlanetTerrainNoiseConfig,
  lods: PlanetTerrainLODSpec[] = DEFAULT_LOD_SPECS,
  landingEnabledOverride?: boolean,
): PlanetTerrainProceduralProfile => ({
  planetType,
  lods,
  materialProfile,
  noise,
  landingEnabledOverride,
});

export const PLANET_TERRAIN_PROFILES: Record<PlanetType | 'default', PlanetTerrainProceduralProfile> = {
  default: createProfile('default', BASALT_PROFILE, DEFAULT_NOISE),
  [PlanetType.Planetoid]: createProfile(PlanetType.Planetoid, BASALT_PROFILE, DEFAULT_NOISE),
  [PlanetType.Protoplanet]: createProfile(PlanetType.Protoplanet, BASALT_PROFILE, DEFAULT_NOISE),
  [PlanetType.Dwarf]: createProfile(PlanetType.Dwarf, ICE_PROFILE, ICE_NOISE),
  [PlanetType.Tierra]: createProfile(PlanetType.Tierra, BASALT_PROFILE, DEFAULT_NOISE),
  [PlanetType.Ringed]: createProfile(PlanetType.Ringed, DUNE_PROFILE, DUNE_NOISE),
  [PlanetType.Giant]: createProfile(PlanetType.Giant, DUNE_PROFILE, GIANT_NOISE, GIANT_LOD_SPECS),
  [PlanetType.Gaseous]: createProfile(PlanetType.Gaseous, DUNE_PROFILE, DUNE_NOISE, GIANT_LOD_SPECS, false),
  [PlanetType.Sun]: createProfile(PlanetType.Sun, DUNE_PROFILE, GIANT_NOISE, GIANT_LOD_SPECS, false),
};

export function resolveTerrainProfile(type: PlanetType | null | undefined): PlanetTerrainProceduralProfile {
  if (!type) {
    return PLANET_TERRAIN_PROFILES.default;
  }
  return PLANET_TERRAIN_PROFILES[type] ?? PLANET_TERRAIN_PROFILES.default;
}

export function hashNoiseSeed(id: string | null | undefined): number {
  if (!id) {
    return 1337;
  }
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    hash >>>= 0;
  }
  return hash >>> 0;
}
