import { Vector3 } from '../../types/game.types';

export interface OrientationBasis {
  forward: Vector3;
  right: Vector3;
  up: Vector3;
}

export interface RelativeBearingResult {
  distance: number;
  bearing: number;
  elevation: number;
}

const WORLD_FORWARD: Vector3 = { x: 0, y: 0, z: 1 };
const WORLD_RIGHT: Vector3 = { x: 1, y: 0, z: 0 };
const WORLD_UP: Vector3 = { x: 0, y: 1, z: 0 };
const EPSILON = 1e-6;

export function computeHeadingFromForward(forward: Vector3 | null | undefined): number {
  const dir = normalize(forward ?? WORLD_FORWARD, WORLD_FORWARD);
  const headingRad = Math.atan2(dir.x, dir.z);
  return wrapDegrees(radiansToDegrees(headingRad));
}

export function calculateRelativeBearing(origin: Vector3, target: Vector3, basis?: OrientationBasis | null): RelativeBearingResult {
  const delta = subtract(target, origin);
  const distance = length(delta);
  if (distance < EPSILON) {
    return { distance: 0, bearing: 0, elevation: 0 };
  }

  const orthoBasis = sanitizeBasis(basis);
  const forwardProjection = dot(delta, orthoBasis.forward);
  const rightProjection = dot(delta, orthoBasis.right);
  const upProjection = dot(delta, orthoBasis.up);

  const bearingRad = Math.atan2(rightProjection, forwardProjection);
  const planarMagnitude = Math.hypot(forwardProjection, rightProjection);
  const elevationRad = Math.atan2(upProjection, planarMagnitude);

  return {
    distance,
    bearing: wrapDegrees(radiansToDegrees(bearingRad)),
    elevation: radiansToDegrees(elevationRad)
  };
}

export function sanitizeBasis(basis?: OrientationBasis | null): OrientationBasis {
  const forward = normalize(basis?.forward ?? WORLD_FORWARD, WORLD_FORWARD);
  const right = normalize(resolveRightVector(forward, basis?.right, basis?.up), WORLD_RIGHT);
  const up = normalize(resolveUpVector(forward, right, basis?.up), WORLD_UP);
  return { forward, right, up };
}

function resolveRightVector(forward: Vector3, candidateRight?: Vector3 | null, candidateUp?: Vector3 | null): Vector3 {
  if (candidateRight) {
    const orthRight = reject(candidateRight, forward);
    if (length(orthRight) >= EPSILON) {
      return orthRight;
    }
  }

  if (candidateUp) {
    const crossRight = cross(candidateUp, forward);
    if (length(crossRight) >= EPSILON) {
      return crossRight;
    }
  }

  const upCross = cross(WORLD_UP, forward);
  if (length(upCross) >= EPSILON) {
    return upCross;
  }

  const forwardCross = cross(forward, WORLD_RIGHT);
  if (length(forwardCross) >= EPSILON) {
    return forwardCross;
  }

  return { ...WORLD_RIGHT };
}

function resolveUpVector(forward: Vector3, right: Vector3, candidateUp?: Vector3 | null): Vector3 {
  const crossUp = cross(forward, right);
  if (length(crossUp) >= EPSILON) {
    return crossUp;
  }

  if (candidateUp) {
    const orthUp = reject(candidateUp, forward);
    if (length(orthUp) >= EPSILON) {
      return orthUp;
    }
  }

  return { ...WORLD_UP };
}

function subtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vec: Vector3, scalar: number): Vector3 {
  return { x: vec.x * scalar, y: vec.y * scalar, z: vec.z * scalar };
}

function reject(vec: Vector3, normal: Vector3): Vector3 {
  const projection = scale(normal, dot(vec, normal));
  return subtract(vec, projection);
}

function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
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

function radiansToDegrees(rad: number): number {
  return rad * (180 / Math.PI);
}

function wrapDegrees(value: number): number {
  const wrapped = (value % 360 + 360) % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}
