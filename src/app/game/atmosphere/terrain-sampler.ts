import { Vector3 } from '../../types/game.types';

/**
 * FUENTE ÚNICA DE VERDAD del terreno atmosférico (ver docs/ARQUITECTURA.md §4.4, Fase 1).
 *
 * Este módulo define:
 *  - El ruido de terreno CON SEMILLA (por planeta) usado tanto por la malla visual
 *    (AtmosphereSceneManager) como por la física (GameEngine).
 *  - El muestreo de colisión EXACTO contra la malla renderizada: se localiza la celda
 *    lat/lon de la rejilla y se interseca el rayo radial con el mismo triángulo que se
 *    dibuja. Así la superficie física y la visual son idénticas por construcción.
 *
 * Regla dura: ninguna otra parte del código puede contener fórmulas de altura de terreno.
 */

const TWO_PI = Math.PI * 2;

export const ATMOSPHERE_RELIEF_SCALE = 0.08;
export const ATMOSPHERE_DETAIL_EXTRUSION_SCALE = 0.08;
export const ATMOSPHERE_DETAIL_START_ALTITUDE = 600;
export const ATMOSPHERE_DETAIL_FULL_ALTITUDE = 80;

/** Resolución de la rejilla esférica. La malla y la colisión DEBEN usar estos valores. */
export const ATMOSPHERE_TERRAIN_LAT_SEGMENTS = 32;
export const ATMOSPHERE_TERRAIN_LON_SEGMENTS = 64;

export interface SurfaceSampleParams {
  offset: Vector3;
  groundRadius: number;
  detailFactor?: number;
  /** Semilla del terreno del planeta activo (0 = terreno legacy sin semilla). */
  seed?: number;
}

/** Muestra de ruido para un vértice de la rejilla (valores compartidos malla/colisión). */
export interface TerrainVertexSample {
  /** Relieve crudo en [-1, 1] (escala vertical = ATMOSPHERE_RELIEF_SCALE). */
  relief: number;
  /** Bandas/estratos normalizados a [0, 1] (solo coloreado). */
  band01: number;
  /** Micro-detalle normalizado a [0, 1] (extrusión cercana + coloreado). */
  micro01: number;
}

/** Fases de ruido derivadas de la semilla. Inmutable; obtener vía getTerrainField(). */
export interface TerrainField {
  readonly seed: number;
  readonly o1t: number; readonly o1p: number;
  readonly o2t: number; readonly o2p: number;
  readonly o3t: number; readonly o3p: number;
  readonly s1: number; readonly s2: number; readonly s3: number; readonly s4: number;
  readonly m1: number; readonly m2: number;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function normalizeNoise(value: number): number {
  return clamp01((value + 1) * 0.5);
}

function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla determinista a partir del id persistido del planeta (FNV-1a). */
export function terrainSeedFromPlanetId(planetId: string | null | undefined): number {
  if (!planetId) {
    return 0;
  }
  let h = 2166136261 >>> 0;
  for (let i = 0; i < planetId.length; i++) {
    h ^= planetId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Con seed=0 las fases reproducen EXACTAMENTE el terreno legacy (las constantes que
 * estaban repartidas entre AtmosphereSceneManager.terrainNoise y este módulo).
 */
function createTerrainField(seed: number): TerrainField {
  if (!seed) {
    return {
      seed: 0,
      o1t: 0, o1p: 0,
      o2t: 1.3, o2p: -0.7,
      o3t: 2.1, o3p: 1.9,
      s1: 0, s2: 0, s3: 0, s4: 0,
      m1: 0, m2: 0,
    };
  }
  const rng = mulberry32(seed >>> 0);
  const phase = () => rng() * TWO_PI;
  return {
    seed: seed >>> 0,
    o1t: phase(), o1p: phase(),
    o2t: phase(), o2p: phase(),
    o3t: phase(), o3p: phase(),
    s1: phase(), s2: phase(), s3: phase(), s4: phase(),
    m1: phase(), m2: phase(),
  };
}

let cachedField: TerrainField | null = null;

/** Devuelve el campo de terreno para una semilla (memoizado: un planeta activo a la vez). */
export function getTerrainField(seed: number): TerrainField {
  const normalized = (seed ?? 0) >>> 0;
  if (cachedField && cachedField.seed === normalized) {
    return cachedField;
  }
  cachedField = createTerrainField(normalized);
  return cachedField;
}

function terrainBaseNoise(field: TerrainField, theta: number, phi: number): number {
  const freq1 = 4.2;
  const freq2 = 11.7;
  const freq3 = 23.5;
  const octave1 = Math.sin(theta * freq1 + field.o1t) * Math.cos(phi * freq1 + field.o1p);
  const octave2 = Math.sin(theta * freq2 + field.o2t) * Math.cos(phi * freq2 + field.o2p) * 0.5;
  const octave3 = Math.sin(theta * freq3 + field.o3t) * Math.cos(phi * freq3 + field.o3p) * 0.25;
  return clamp(octave1 + octave2 + octave3, -1, 1);
}

function strataBaseNoise(field: TerrainField, theta: number, phi: number): number {
  const bands = Math.sin(theta * 3.2 + field.s1 + Math.cos(phi * 1.5 + field.s2));
  const streaks = Math.sin(phi * 14.0 + field.s3 + Math.sin(theta * 2.4 + field.s4));
  return bands * 0.65 + streaks * 0.35;
}

function microDetailBaseNoise(field: TerrainField, theta: number, phi: number): number {
  const highFreq = Math.sin(theta * 27.0 + phi * 13.0 + field.m1);
  const cross = Math.cos(theta * 9.0 - phi * 21.0 + field.m2);
  return clamp(highFreq * 0.7 + cross * 0.3, -1, 1);
}

/** Muestra completa de ruido para un vértice (lo usan la malla y el muestreo de colisión). */
export function sampleTerrainVertex(field: TerrainField, theta: number, phi: number): TerrainVertexSample {
  return {
    relief: terrainBaseNoise(field, theta, phi),
    band01: normalizeNoise(strataBaseNoise(field, theta, phi)),
    micro01: normalizeNoise(microDetailBaseNoise(field, theta, phi)),
  };
}

/** Radio unitario base de un vértice (relieve aplicado, sin micro-detalle). */
export function computeVertexUnitRadius(relief: number): number {
  return 1 + relief * ATMOSPHERE_RELIEF_SCALE;
}

/** Multiplicador de extrusión por micro-detalle (idéntico a applyGroundDetail de la malla). */
export function computeDetailMultiplier(micro01: number, detailFactor: number): number {
  return 1 + (micro01 - 0.5) * ATMOSPHERE_DETAIL_EXTRUSION_SCALE * clamp01(detailFactor);
}

export function computeAtmosphereDetailFactor(altitude: number): number {
  if (altitude <= ATMOSPHERE_DETAIL_FULL_ALTITUDE) {
    return 1;
  }
  if (altitude >= ATMOSPHERE_DETAIL_START_ALTITUDE) {
    return 0;
  }
  const range = ATMOSPHERE_DETAIL_START_ALTITUDE - ATMOSPHERE_DETAIL_FULL_ALTITUDE;
  const normalized = clamp01((altitude - ATMOSPHERE_DETAIL_FULL_ALTITUDE) / range);
  return clamp01(1 - normalized);
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Posición (escala unitaria) del vértice (lat, lon) de la rejilla — réplica exacta de la malla. */
function meshVertexPosition(field: TerrainField, lat: number, lon: number, detailFactor: number): Vec3 {
  const theta = (lat / ATMOSPHERE_TERRAIN_LAT_SEGMENTS) * Math.PI;
  const phi = (lon / ATMOSPHERE_TERRAIN_LON_SEGMENTS) * TWO_PI;
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sample = sampleTerrainVertex(field, theta, phi);
  const radius = computeVertexUnitRadius(sample.relief) * computeDetailMultiplier(sample.micro01, detailFactor);
  return {
    x: cosPhi * sinTheta * radius,
    y: cosTheta * radius,
    z: sinPhi * sinTheta * radius,
  };
}

function vertexUnitRadius(field: TerrainField, lat: number, lon: number, detailFactor: number): number {
  const theta = (lat / ATMOSPHERE_TERRAIN_LAT_SEGMENTS) * Math.PI;
  const phi = (lon / ATMOSPHERE_TERRAIN_LON_SEGMENTS) * TWO_PI;
  const sample = sampleTerrainVertex(field, theta, phi);
  return computeVertexUnitRadius(sample.relief) * computeDetailMultiplier(sample.micro01, detailFactor);
}

/**
 * Radio (escala unitaria) de la SUPERFICIE RENDERIZADA en la dirección dada:
 * localiza la celda de la rejilla, elige el mismo triángulo que dibuja la malla
 * (diagonal first+1 ↔ second) e interseca el rayo radial con su plano.
 */
function sampleUnitRadiusOnMesh(field: TerrainField, dir: Vec3, detailFactor: number): number {
  const theta = Math.acos(clamp(dir.y, -1, 1));
  let phi = Math.atan2(dir.z, dir.x);
  if (phi < 0) {
    phi += TWO_PI;
  }
  const latF = (theta / Math.PI) * ATMOSPHERE_TERRAIN_LAT_SEGMENTS;
  const lonF = (phi / TWO_PI) * ATMOSPHERE_TERRAIN_LON_SEGMENTS;
  const lat0 = clamp(Math.floor(latF), 0, ATMOSPHERE_TERRAIN_LAT_SEGMENTS - 1);
  const lon0 = clamp(Math.floor(lonF), 0, ATMOSPHERE_TERRAIN_LON_SEGMENTS - 1);
  const s = clamp(latF - lat0, 0, 1);
  const t = clamp(lonF - lon0, 0, 1);

  // Triángulos por celda (mismo orden de índices que buildSphere):
  //   A = (lat0,lon0), (lat0+1,lon0), (lat0,lon0+1)        cuando s + t <= 1
  //   B = (lat0+1,lon0), (lat0+1,lon0+1), (lat0,lon0+1)    cuando s + t > 1
  const inA = s + t <= 1;
  const p0 = inA
    ? meshVertexPosition(field, lat0, lon0, detailFactor)
    : meshVertexPosition(field, lat0 + 1, lon0, detailFactor);
  const p1 = inA
    ? meshVertexPosition(field, lat0 + 1, lon0, detailFactor)
    : meshVertexPosition(field, lat0 + 1, lon0 + 1, detailFactor);
  const p2 = meshVertexPosition(field, lat0, lon0 + 1, detailFactor);

  const e1x = p1.x - p0.x, e1y = p1.y - p0.y, e1z = p1.z - p0.z;
  const e2x = p2.x - p0.x, e2y = p2.y - p0.y, e2z = p2.z - p0.z;
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  const denom = nx * dir.x + ny * dir.y + nz * dir.z;
  if (Math.abs(denom) > 1e-9) {
    const r = (nx * p0.x + ny * p0.y + nz * p0.z) / denom;
    if (Number.isFinite(r) && r > 0) {
      return r;
    }
  }

  // Degenerado (polos / triángulo casi tangente): interpolación bilineal de radios.
  const r00 = vertexUnitRadius(field, lat0, lon0, detailFactor);
  const r10 = vertexUnitRadius(field, lat0 + 1, lon0, detailFactor);
  const r01 = vertexUnitRadius(field, lat0, lon0 + 1, detailFactor);
  const r11 = vertexUnitRadius(field, lat0 + 1, lon0 + 1, detailFactor);
  return r00 * (1 - s) * (1 - t) + r10 * s * (1 - t) + r01 * (1 - s) * t + r11 * s * t;
}

/**
 * Radio de la superficie (unidades de mundo) bajo la dirección `offset` (centro → punto).
 * Es EXACTAMENTE la superficie que pinta AtmosphereSceneManager para la misma semilla
 * y el mismo detailFactor.
 */
export function sampleAtmosphereSurfaceRadius(params: SurfaceSampleParams): number {
  const { offset, groundRadius } = params;
  const detailFactor = clamp01(params.detailFactor ?? 1);
  const length = Math.hypot(offset.x, offset.y, offset.z);
  if (!Number.isFinite(length) || length <= 1e-6 || !Number.isFinite(groundRadius)) {
    return groundRadius;
  }
  const field = getTerrainField(params.seed ?? 0);
  const dir = { x: offset.x / length, y: offset.y / length, z: offset.z / length };
  return groundRadius * sampleUnitRadiusOnMesh(field, dir, detailFactor);
}

export function sampleAtmosphereSurfaceRadiusAlongNormal(
  normal: Vector3,
  groundRadius: number,
  detailFactor: number = 1,
  seed: number = 0,
): number {
  return sampleAtmosphereSurfaceRadius({ offset: normal, groundRadius, detailFactor, seed });
}
