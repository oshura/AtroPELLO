import { Vector3 } from '../../types/game.types';
import { OrientationBasis, sanitizeBasis } from '../targeting/compass-direction.util';

export interface AtmosphereAttitudeInput {
  shipBasis: OrientationBasis;
  shipPosition: Vector3;
  planetCenter: Vector3;
}

export interface AtmosphereAttitudeResult {
  pitch: number;
  roll: number;
  upVector: Vector3;
}

const DEFAULT_UP: Vector3 = { x: 0, y: 1, z: 0 };
const EPSILON = 1e-6;

export function calculateAtmosphereAttitude(input: AtmosphereAttitudeInput): AtmosphereAttitudeResult {
  const upVector = normalize(subtract(input.shipPosition, input.planetCenter), DEFAULT_UP);
  const { forward, right, up } = sanitizeBasis(input.shipBasis);

  const forwardVertical = clamp(dot(forward, upVector), -1, 1);
  const forwardLateral = subtract(forward, scale(upVector, forwardVertical));
  const lateralMagnitude = Math.max(EPSILON, length(forwardLateral));
  const pitch = radiansToDegrees(Math.atan2(forwardVertical, lateralMagnitude));

  const rightVertical = clamp(dot(right, upVector), -1, 1);
  const upVertical = clamp(dot(up, upVector), -1, 1);
  const roll = radiansToDegrees(Math.atan2(rightVertical, upVertical));

  return {
    pitch,
    roll,
    upVector,
  };
}

function subtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vec: Vector3, scalar: number): Vector3 {
  return { x: vec.x * scalar, y: vec.y * scalar, z: vec.z * scalar };
}

function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(vec: Vector3): number {
  return Math.hypot(vec.x, vec.y, vec.z);
}

function normalize(vec: Vector3, fallback: Vector3): Vector3 {
  const len = length(vec);
  if (!isFinite(len) || len < EPSILON) {
    return { ...fallback };
  }
  const inv = 1 / len;
  return { x: vec.x * inv, y: vec.y * inv, z: vec.z * inv };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function radiansToDegrees(rad: number): number {
  return rad * (180 / Math.PI);
}
