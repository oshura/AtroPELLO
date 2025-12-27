import { Vector3 } from '../../types/game.types';

const TWO_PI = Math.PI * 2;

export const ATMOSPHERE_RELIEF_SCALE = 0.08;
export const ATMOSPHERE_DETAIL_EXTRUSION_SCALE = 0.08;
export const ATMOSPHERE_DETAIL_START_ALTITUDE = 600;
export const ATMOSPHERE_DETAIL_FULL_ALTITUDE = 80;

interface SurfaceSampleParams {
  offset: Vector3;
  groundRadius: number;
  detailFactor?: number;
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

function computeTerrainBaseNoise(theta: number, phi: number): number {
  const freq1 = 4.2;
  const freq2 = 11.7;
  const freq3 = 23.5;
  const octave1 = Math.sin(theta * freq1) * Math.cos(phi * freq1);
  const octave2 = Math.sin(theta * freq2 + 1.3) * Math.cos(phi * freq2 - 0.7) * 0.5;
  const octave3 = Math.sin(theta * freq3 + 2.1) * Math.cos(phi * freq3 + 1.9) * 0.25;
  const raw = octave1 + octave2 + octave3;
  return clamp(raw, -0.5, 1);
}

function computeMicroDetailBaseNoise(theta: number, phi: number): number {
  const highFreq = Math.sin(theta * 27 + phi * 13);
  const cross = Math.cos(theta * 9 - phi * 21);
  return clamp(highFreq * 0.7 + cross * 0.3, -1, 1);
}

function toAngles(offset: Vector3): { theta: number; phi: number } | null {
  const length = Math.hypot(offset.x, offset.y, offset.z);
  if (!Number.isFinite(length) || length <= 1e-6) {
    return null;
  }
  const nx = offset.x / length;
  const ny = offset.y / length;
  const nz = offset.z / length;
  const theta = Math.acos(clamp(ny, -1, 1));
  let phi = Math.atan2(nz, nx);
  if (phi < 0) {
    phi += TWO_PI;
  }
  return { theta, phi };
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

export function sampleAtmosphereSurfaceRadius(params: SurfaceSampleParams): number {
  const { offset, groundRadius } = params;
  const detailFactor = clamp01(params.detailFactor ?? 1);
  const angles = toAngles(offset);
  if (!angles) {
    return groundRadius;
  }
  const relief = computeTerrainBaseNoise(angles.theta, angles.phi);
  const baseScale = 1 + relief * ATMOSPHERE_RELIEF_SCALE;
  let radius = groundRadius * baseScale;
  if (detailFactor > 1e-3) {
    const detailNoise = computeMicroDetailBaseNoise(angles.theta, angles.phi);
    const detailCentered = normalizeNoise(detailNoise) - 0.5;
    const detailScale = 1 + detailCentered * ATMOSPHERE_DETAIL_EXTRUSION_SCALE * detailFactor;
    radius *= detailScale;
  }
  return radius;
}

export function sampleAtmosphereSurfaceRadiusAlongNormal(
  normal: Vector3,
  groundRadius: number,
  detailFactor: number = 1,
): number {
  return sampleAtmosphereSurfaceRadius({ offset: normal, groundRadius, detailFactor });
}
