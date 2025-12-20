import { Planet, PlanetType } from '../../game-objects/Planet';

export interface AtmosphereBoundaryPreset {
  groundScale: number;
  groundOffset: number;
  domeScale: number;
  domeOffset: number;
  landingEnabled: boolean;
  minSeparation: number;
  nearGroundThreshold: number;
}

export interface AtmosphereBoundaryMetrics {
  basePlanetRadius: number;
  landingEnabled: boolean;
  groundRadius: number | null;
  domeRadius: number;
  minSeparation: number;
  nearGroundThreshold: number;
  preset: AtmosphereBoundaryPreset;
}

export const MIN_BOUNDARY_SEPARATION = 50;
export const DEFAULT_NEAR_GROUND_THRESHOLD = 35;

const DEFAULT_BOUNDARY_PRESET: AtmosphereBoundaryPreset = {
  groundScale: 1.08,
  groundOffset: 30,
  domeScale: 1.32,
  domeOffset: 80,
  landingEnabled: true,
  minSeparation: 60,
  nearGroundThreshold: DEFAULT_NEAR_GROUND_THRESHOLD,
};

const PLANET_BOUNDARY_PRESETS: Partial<Record<PlanetType, AtmosphereBoundaryPreset>> = {
  [PlanetType.Planetoid]: {
    groundScale: 1.0,
    groundOffset: 24,
    domeScale: 1.28,
    domeOffset: 70,
    landingEnabled: true,
    minSeparation: 60,
    nearGroundThreshold: 28,
  },
  [PlanetType.Protoplanet]: {
    groundScale: 0.72,
    groundOffset: 18,
    domeScale: 1.05,
    domeOffset: 65,
    landingEnabled: true,
    minSeparation: 55,
    nearGroundThreshold: 22,
  },
  [PlanetType.Dwarf]: {
    groundScale: 0.85,
    groundOffset: 20,
    domeScale: 1.1,
    domeOffset: 70,
    landingEnabled: true,
    minSeparation: 55,
    nearGroundThreshold: 24,
  },
  [PlanetType.Tierra]: {
    groundScale: 1.0,
    groundOffset: 32,
    domeScale: 1.4,
    domeOffset: 90,
    landingEnabled: true,
    minSeparation: 70,
    nearGroundThreshold: 35,
  },
  [PlanetType.Ringed]: {
    groundScale: 1.05,
    groundOffset: 36,
    domeScale: 1.46,
    domeOffset: 110,
    landingEnabled: true,
    minSeparation: 70,
    nearGroundThreshold: 40,
  },
  [PlanetType.Giant]: {
    groundScale: 3.0,
    groundOffset: 180,
    domeScale: 3.6,
    domeOffset: 240,
    landingEnabled: true,
    minSeparation: 120,
    nearGroundThreshold: 110,
  },
  [PlanetType.Gaseous]: {
    groundScale: 2.5,
    groundOffset: 0,
    domeScale: 3.2,
    domeOffset: 260,
    landingEnabled: false,
    minSeparation: 140,
    nearGroundThreshold: 999,
  },
  [PlanetType.Sun]: {
    groundScale: 4.5,
    groundOffset: 400,
    domeScale: 5.0,
    domeOffset: 520,
    landingEnabled: false,
    minSeparation: 200,
    nearGroundThreshold: 999,
  },
};

export function resolveBoundaryPreset(type: PlanetType | null | undefined): AtmosphereBoundaryPreset {
  if (!type) {
    return DEFAULT_BOUNDARY_PRESET;
  }
  return PLANET_BOUNDARY_PRESETS[type] ?? DEFAULT_BOUNDARY_PRESET;
}

export function computeBoundaryMetrics(planet: Planet | null | undefined): AtmosphereBoundaryMetrics {
  const basePlanetRadius = Math.max(
    planet?.boundingSphere?.radius ?? planet?.scale?.x ?? planet?.initialRadius ?? 200,
    20,
  );
  const preset = resolveBoundaryPreset(planet?.planetType ?? null);
  const landingEnabled = preset.landingEnabled;
  const resolvedGroundRadius = landingEnabled
    ? Math.max(1, basePlanetRadius * preset.groundScale + preset.groundOffset)
    : null;
  const groundReference = resolvedGroundRadius ?? Math.max(1, basePlanetRadius * preset.groundScale + preset.groundOffset);
  const minSeparation = Math.max(MIN_BOUNDARY_SEPARATION, preset.minSeparation);
  const domeRadius = Math.max(
    groundReference + minSeparation,
    basePlanetRadius * preset.domeScale + preset.domeOffset,
  );
  const nearGroundThreshold = preset.nearGroundThreshold ?? DEFAULT_NEAR_GROUND_THRESHOLD;
  return {
    basePlanetRadius,
    landingEnabled,
    groundRadius: resolvedGroundRadius,
    domeRadius,
    minSeparation,
    nearGroundThreshold,
    preset,
  };
}
