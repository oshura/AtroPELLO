import { Planet } from '../../game-objects/Planet';
import { AtmosphereBoundarySnapshot } from '../shared-game-context';
import {
  PlanetTerrainSnapshot,
  PlanetTerrainProceduralProfile,
  PlanetTerrainMeshPayload,
  PlanetTerrainLODSpec,
  PlanetTerrainNoiseConfig,
} from './planet-terrain.types';
import { resolveTerrainProfile, hashNoiseSeed } from './planet-terrain-materials';
import { Vector3 } from '../../../types/game.types';

interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

export class PlanetTerrainGenerator {
  generate(planet: Planet | null, boundaries: AtmosphereBoundarySnapshot): PlanetTerrainSnapshot {
    const profile = resolveTerrainProfile(planet?.planetType ?? null);
    const baseRadius = Math.max(5, boundaries.basePlanetRadius);
    const groundRadius = boundaries.groundRadius ?? baseRadius;
    const domeRadius = boundaries.domeRadius;
    const landingEnabled = Boolean(boundaries.landingEnabled && profile.landingEnabledOverride !== false);
    const seed = hashNoiseSeed(planet?.id ?? null);
    const lodMeshes = landingEnabled
      ? this.buildMeshes(profile, groundRadius, seed)
      : [];

    return {
      planetId: planet?.id ?? null,
      planetName: planet?.getDisplayName?.() ?? planet?.customName ?? null,
      planetType: planet?.planetType ?? null,
      landingEnabled,
      baseRadius,
      groundRadius: landingEnabled ? groundRadius : null,
      domeRadius,
      lodMeshes,
      materialProfile: landingEnabled ? profile.materialProfile : null,
      generatedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      noiseSeed: seed,
    };
  }

  private buildMeshes(profile: PlanetTerrainProceduralProfile, radius: number, seed: number): PlanetTerrainMeshPayload[] {
    const meshes: PlanetTerrainMeshPayload[] = [];
    for (const spec of profile.lods) {
      const mesh = this.buildMeshForSpec(spec, radius, profile.noise, seed);
      meshes.push(mesh);
    }
    return meshes;
  }

  private buildMeshForSpec(
    spec: PlanetTerrainLODSpec,
    radius: number,
    noise: PlanetTerrainNoiseConfig,
    seed: number,
  ): PlanetTerrainMeshPayload {
    const ico = this.buildIcoSphere(Math.max(0, spec.subdivisions));
    const vertexCount = ico.positions.length / 3;
    const positions = new Float32Array(ico.positions.length);
    const normals = new Float32Array(ico.positions.length);
    const uvs = new Float32Array(vertexCount * 2);

    for (let i = 0; i < vertexCount; i++) {
      const x = ico.positions[i * 3];
      const y = ico.positions[i * 3 + 1];
      const z = ico.positions[i * 3 + 2];
      const dir = this.normalize({ x, y, z });
      const displacement = this.sampleHeight(dir, noise, seed);
      const finalRadius = radius + displacement;
      positions[i * 3] = dir.x * finalRadius;
      positions[i * 3 + 1] = dir.y * finalRadius;
      positions[i * 3 + 2] = dir.z * finalRadius;
      normals[i * 3] = dir.x;
      normals[i * 3 + 1] = dir.y;
      normals[i * 3 + 2] = dir.z;
      const lon = Math.atan2(dir.z, dir.x);
      const lat = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      uvs[i * 2] = lon / (2 * Math.PI) + 0.5;
      uvs[i * 2 + 1] = lat / Math.PI + 0.5;
    }

    return {
      level: spec.level,
      maxDistance: spec.maxDistance,
      positions,
      normals,
      uvs,
      indices: ico.indices,
      vertexCount,
      radius,
    };
  }

  private buildIcoSphere(subdivisions: number): MeshData {
    const t = (1 + Math.sqrt(5)) / 2;
    const initialVertices: Vector3[] = [
      { x: -1, y: t, z: 0 },
      { x: 1, y: t, z: 0 },
      { x: -1, y: -t, z: 0 },
      { x: 1, y: -t, z: 0 },
      { x: 0, y: -1, z: t },
      { x: 0, y: 1, z: t },
      { x: 0, y: -1, z: -t },
      { x: 0, y: 1, z: -t },
      { x: t, y: 0, z: -1 },
      { x: t, y: 0, z: 1 },
      { x: -t, y: 0, z: -1 },
      { x: -t, y: 0, z: 1 },
    ];

    const faces: number[][] = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];

    const vertices: Vector3[] = [];
    const midpointCache = new Map<string, number>();

    const addVertex = (v: Vector3): number => {
      const normalized = this.normalize(v);
      vertices.push(normalized);
      return vertices.length - 1;
    };

    const getMidPoint = (a: number, b: number): number => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const cached = midpointCache.get(key);
      if (typeof cached === 'number') {
        return cached;
      }
      const va = vertices[a];
      const vb = vertices[b];
      const mid = this.normalize({
        x: (va.x + vb.x) * 0.5,
        y: (va.y + vb.y) * 0.5,
        z: (va.z + vb.z) * 0.5,
      });
      const index = addVertex(mid);
      midpointCache.set(key, index);
      return index;
    };

    initialVertices.forEach(v => addVertex(v));
    let currentFaces = faces;

    for (let i = 0; i < subdivisions; i++) {
      const subdivided: number[][] = [];
      for (const face of currentFaces) {
        const [a, b, c] = face;
        const ab = getMidPoint(a, b);
        const bc = getMidPoint(b, c);
        const ca = getMidPoint(c, a);
        subdivided.push([a, ab, ca]);
        subdivided.push([b, bc, ab]);
        subdivided.push([c, ca, bc]);
        subdivided.push([ab, bc, ca]);
      }
      currentFaces = subdivided;
    }

    const positions = new Float32Array(vertices.length * 3);
    for (let i = 0; i < vertices.length; i++) {
      positions[i * 3] = vertices[i].x;
      positions[i * 3 + 1] = vertices[i].y;
      positions[i * 3 + 2] = vertices[i].z;
    }

    const indices = new Uint32Array(currentFaces.length * 3);
    for (let i = 0; i < currentFaces.length; i++) {
      indices[i * 3] = currentFaces[i][0];
      indices[i * 3 + 1] = currentFaces[i][1];
      indices[i * 3 + 2] = currentFaces[i][2];
    }

    return { positions, indices };
  }

  private normalize(v: Vector3): Vector3 {
    const len = Math.max(1e-6, Math.hypot(v.x, v.y, v.z));
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  private sampleHeight(dir: Vector3, noise: PlanetTerrainNoiseConfig, seed: number): number {
    const fbm = this.fbmNoise(dir, noise, seed);
    const ridge = this.ridgeNoise(dir, noise, seed + 97);
    return fbm * noise.amplitude + ridge * noise.ridgeAmplitude;
  }

  private fbmNoise(dir: Vector3, noise: PlanetTerrainNoiseConfig, seed: number): number {
    let frequency = noise.baseFrequency;
    let amplitude = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < noise.octaves; i++) {
      const value = this.simpleNoise(dir, frequency, seed + i * 17.17);
      sum += value * amplitude;
      norm += amplitude;
      frequency *= noise.frequencyGain;
      amplitude *= noise.persistence;
    }
    return norm > 0 ? sum / norm : 0;
  }

  private ridgeNoise(dir: Vector3, noise: PlanetTerrainNoiseConfig, seed: number): number {
    const base = this.simpleNoise(dir, noise.baseFrequency * noise.ridgeFrequencyMultiplier, seed);
    const ridge = 1 - Math.abs(base);
    return Math.pow(ridge, noise.ridgeSharpness);
  }

  private simpleNoise(dir: Vector3, frequency: number, seed: number): number {
    const x = dir.x * frequency + seed * 0.001;
    const y = dir.y * frequency + seed * 0.0021;
    const z = dir.z * frequency + seed * 0.00073;
    const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return value - Math.floor(value + 0.5);
  }
}
