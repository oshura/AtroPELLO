import { Vector3 } from '../../../types/game.types';
import { LandingApproachContext } from '../../types/landing.types';
import { AtmosphereCameraPosePayload } from '../shared-game-context';

export interface AtmosphereCameraRigOptions {
  surfaceOffset?: number;
  cameraElevation?: number;
  cameraBackstep?: number;
  targetLift?: number;
}

export interface AtmosphereCameraRigSnapshot {
  anchor: Vector3;
  surfaceNormal: Vector3;
  tangent: Vector3;
  bitangent: Vector3;
  cameraPose: AtmosphereCameraPosePayload;
  surfaceOffset: number;
}

const WORLD_UP: Vector3 = { x: 0, y: 1, z: 0 };
const WORLD_Z: Vector3 = { x: 0, y: 0, z: 1 };

const DEFAULT_OPTIONS: Required<AtmosphereCameraRigOptions> = {
  surfaceOffset: 12,
  cameraElevation: 8,
  cameraBackstep: 22,
  targetLift: 2,
};

export class AtmosphereCameraRig {
  public static create(
    context: LandingApproachContext,
    opts: AtmosphereCameraRigOptions = {},
  ): AtmosphereCameraRigSnapshot | null {
    if (!context?.surfacePoint || !context?.surfaceNormal) {
      return null;
    }

    const options = { ...DEFAULT_OPTIONS, ...opts };
    const normal = normalize(context.surfaceNormal);
    const anchor = add(context.surfacePoint, scale(normal, options.surfaceOffset));
    const tangent = AtmosphereCameraRig.buildTangent(normal);
    const bitangent = normalize(cross(normal, tangent));

    const cameraPosition = add(
      add(anchor, scale(normal, options.cameraElevation)),
      scale(tangent, -options.cameraBackstep),
    );
    const target = add(context.surfacePoint, scale(normal, options.targetLift));

    return {
      anchor,
      surfaceNormal: normal,
      tangent,
      bitangent,
      surfaceOffset: options.surfaceOffset,
      cameraPose: {
        position: cameraPosition,
        target,
        up: normal,
        mode: 'atmosphere-manual',
      },
    };
  }

  private static buildTangent(normal: Vector3): Vector3 {
    const reference = Math.abs(dot(normal, WORLD_UP)) > 0.85 ? WORLD_Z : WORLD_UP;
    const tangent = cross(reference, normal);
    const normalized = normalize(tangent);
    if (!Number.isFinite(normalized.x)) {
      return { x: 1, y: 0, z: 0 };
    }
    return normalized;
  }
}

function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(vec: Vector3, scalar: number): Vector3 {
  return { x: vec.x * scalar, y: vec.y * scalar, z: vec.z * scalar };
}

function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(vec: Vector3): Vector3 {
  const len = Math.hypot(vec.x, vec.y, vec.z) || 1;
  return { x: vec.x / len, y: vec.y / len, z: vec.z / len };
}
