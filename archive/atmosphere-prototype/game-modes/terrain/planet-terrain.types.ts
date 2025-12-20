import { PlanetType } from '../../game-objects/Planet';

export type PlanetTerrainLODLevel = 'near' | 'mid' | 'far';

export interface PlanetTerrainLODSpec {
  readonly level: PlanetTerrainLODLevel;
  readonly maxDistance: number;
  readonly subdivisions: number;
}

export enum PlanetTerrainMaterialId {
  BASALT = 'basalt',
  SAND = 'sand',
  ICE = 'ice',
  DUNE = 'dune',
  FROST = 'frost',
  CRYSTAL = 'crystal',
}

export interface PlanetTerrainMaterialLayer {
  readonly materialId: PlanetTerrainMaterialId;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly blend: number;
  readonly tint: [number, number, number];
  readonly roughness: number;
  readonly metallic: number;
}

export interface PlanetTerrainMaterialProfile {
  readonly id: string;
  readonly label: string;
  readonly layers: PlanetTerrainMaterialLayer[];
  readonly detailScale: number;
  readonly colorVariance: number;
}

export interface PlanetTerrainNoiseConfig {
  readonly baseFrequency: number;
  readonly frequencyGain: number;
  readonly persistence: number;
  readonly octaves: number;
  readonly amplitude: number;
  readonly ridgeAmplitude: number;
  readonly ridgeSharpness: number;
  readonly ridgeFrequencyMultiplier: number;
}

export interface PlanetTerrainProceduralProfile {
  readonly planetType: PlanetType | 'default';
  readonly lods: PlanetTerrainLODSpec[];
  readonly materialProfile: PlanetTerrainMaterialProfile;
  readonly noise: PlanetTerrainNoiseConfig;
  readonly landingEnabledOverride?: boolean;
}

export interface PlanetTerrainMeshPayload {
  readonly level: PlanetTerrainLODLevel;
  readonly maxDistance: number;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  readonly radius: number;
}

export interface PlanetTerrainSnapshot {
  readonly planetId: string | null;
  readonly planetName: string | null;
  readonly planetType: PlanetType | null;
  readonly landingEnabled: boolean;
  readonly baseRadius: number;
  readonly groundRadius: number | null;
  readonly domeRadius: number;
  readonly lodMeshes: PlanetTerrainMeshPayload[];
  readonly materialProfile: PlanetTerrainMaterialProfile | null;
  readonly generatedAt: number;
  readonly noiseSeed: number;
}
