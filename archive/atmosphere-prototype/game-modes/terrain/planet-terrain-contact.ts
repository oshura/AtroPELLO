import { PlanetTerrainSnapshot, PlanetTerrainMeshPayload } from './planet-terrain.types';
import { Vector3 } from '../../../types/game.types';

export interface PlanetTerrainContactResult {
  readonly hit: boolean;
  readonly radius: number | null;
  readonly altitude: number | null;
  readonly distanceToCenter: number | null;
  readonly surfacePoint: Vector3 | null;
  readonly surfaceNormal: Vector3 | null;
}

export function computePlanetTerrainContact(
  snapshot: PlanetTerrainSnapshot | null | undefined,
  shipPosition: Vector3 | null | undefined,
  planetCenter: Vector3 | null | undefined,
): PlanetTerrainContactResult {
  if (!snapshot || !snapshot.landingEnabled || !shipPosition || !planetCenter) {
    return defaultResult(snapshot, shipPosition, planetCenter, null);
  }

  const preferredMesh = selectPreferredMesh(snapshot.lodMeshes);
  if (!preferredMesh) {
    return defaultResult(snapshot, shipPosition, planetCenter, null);
  }

  const shipVector = subtract(shipPosition, planetCenter);
  const shipDistance = vectorLength(shipVector);
  const shipDirection = normalize(shipVector);

  let bestIndex = -1;
  let bestDot = -Infinity;
  let bestNormal: Vector3 | null = null;
  let bestRadius: number | null = null;

  for (let i = 0; i < preferredMesh.vertexCount; i++) {
    const vx = preferredMesh.positions[i * 3];
    const vy = preferredMesh.positions[i * 3 + 1];
    const vz = preferredMesh.positions[i * 3 + 2];
    const radius = vectorLength({ x: vx, y: vy, z: vz });
    if (radius === null || !Number.isFinite(radius) || radius <= 1e-3) {
      continue;
    }
    const normal = { x: vx / radius, y: vy / radius, z: vz / radius };
    const dot = normal.x * shipDirection.x + normal.y * shipDirection.y + normal.z * shipDirection.z;
    if (dot > bestDot) {
      bestDot = dot;
      bestIndex = i;
      bestNormal = normal;
      bestRadius = radius;
    }
  }

  if (bestIndex === -1 || !bestNormal || bestRadius === null) {
    return defaultResult(snapshot, shipPosition, planetCenter, shipDistance);
  }

  const altitude = shipDistance !== null && Number.isFinite(shipDistance)
    ? shipDistance - bestRadius
    : null;
  const surfacePoint = add(planetCenter, scale(bestNormal, bestRadius));

  return {
    hit: true,
    radius: bestRadius,
    altitude,
    distanceToCenter: shipDistance,
    surfacePoint,
    surfaceNormal: bestNormal,
  };
}

function selectPreferredMesh(meshes: PlanetTerrainMeshPayload[] | null | undefined): PlanetTerrainMeshPayload | null {
  if (!meshes || meshes.length === 0) {
    return null;
  }
  const byPriority = ['near', 'mid', 'far'];
  for (const level of byPriority) {
    const match = meshes.find(mesh => mesh.level === level);
    if (match) {
      return match;
    }
  }
  return meshes[0];
}

function defaultResult(
  snapshot: PlanetTerrainSnapshot | null | undefined,
  shipPosition: Vector3 | null | undefined,
  planetCenter: Vector3 | null | undefined,
  shipDistance: number | null,
): PlanetTerrainContactResult {
  const groundRadius = snapshot?.groundRadius ?? snapshot?.baseRadius ?? null;
  const fallbackNormal = planetCenter && shipPosition ? normalize(subtract(shipPosition, planetCenter)) : null;
  const surfacePoint = groundRadius && planetCenter && fallbackNormal
    ? add(planetCenter, scale(fallbackNormal, groundRadius))
    : null;
  const altitude = groundRadius !== null && shipDistance !== null
    ? shipDistance - groundRadius
    : null;
  return {
    hit: false,
    radius: groundRadius,
    altitude,
    distanceToCenter: shipDistance,
    surfacePoint,
    surfaceNormal: fallbackNormal,
  };
}

function subtract(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

function add(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  };
}

function scale(vec: Vector3, scalar: number): Vector3 {
  return {
    x: vec.x * scalar,
    y: vec.y * scalar,
    z: vec.z * scalar,
  };
}

function vectorLength(vec: Vector3 | null | undefined): number | null {
  if (!vec) {
    return null;
  }
  const length = Math.hypot(vec.x, vec.y, vec.z);
  return Number.isFinite(length) ? length : null;
}

function normalize(vec: Vector3 | null | undefined): Vector3 {
  const length = vectorLength(vec) ?? 1;
  if (length <= 1e-6) {
    return { x: 0, y: 1, z: 0 };
  }
  const inv = 1 / length;
  return {
    x: (vec?.x ?? 0) * inv,
    y: (vec?.y ?? 0) * inv,
    z: (vec?.z ?? 0) * inv,
  };
}
