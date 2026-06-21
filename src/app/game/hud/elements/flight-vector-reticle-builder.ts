import { mat4, vec4 } from 'gl-matrix';
import { Vector3 } from '../../../types/game.types';
import { FlightVectorReticleState } from './FlightVectorReticle';

export interface FlightVectorReticleHost {
  /** ¿Hay nave y cámara listas? (puerta barata antes de proyectar). */
  isReady(): boolean;
  getShipPosition(): Vector3;
  getShipForward(): Vector3;
  getShipSpeed(): number;
  getShipWeaponsCount(): number;
  getCameraViewMatrix(): mat4;
  getCameraProjectionMatrix(): mat4;
  isCinematicAnimationRunning(): boolean;
  isPrecisionRotationActive(): boolean;
}

/**
 * Calcula el estado de la retícula de "vector de vuelo" (el punto de fuga de la nave proyectado al HUD).
 * Antes en GameEngine. Posee los scratch buffers (mat4 + vec4) para proyectar SIN allocar por frame (es
 * HOT: se llama una vez por frame en el render del HUD). El DIBUJO vive en `FlightVectorReticle`.
 * docs/ARQUITECTURA.md Fase 5.7.
 */
export class FlightVectorReticleBuilder {
  private readonly viewProjection = mat4.create();
  private readonly clipVec = vec4.create();

  build(host: FlightVectorReticleHost, speedGaugeValue: number): FlightVectorReticleState | null {
    if (!host.isReady() || host.isCinematicAnimationRunning()) {
      return null;
    }
    const position = host.getShipPosition();
    const forward = host.getShipForward();
    const projectionDistance = this.projectionDistance(host.getShipSpeed());
    const samplePoint: Vector3 = {
      x: position.x + forward.x * projectionDistance,
      y: position.y + forward.y * projectionDistance,
      z: position.z + forward.z * projectionDistance,
    };
    const projection = this.project(samplePoint, host.getCameraViewMatrix(), host.getCameraProjectionMatrix());
    if (!projection || !projection.inFront || !projection.visible) {
      return null;
    }
    const hasWeapons = host.getShipWeaponsCount() > 0;
    const speedRatio = Math.max(0, Math.min(1, speedGaugeValue / 200));
    const edgeAttenuation = Math.max(0, 1 - Math.min(1, Math.max(Math.abs(projection.ndcX), Math.abs(projection.ndcY))));
    return {
      visible: true,
      normalizedX: projection.normalizedX,
      normalizedY: projection.normalizedY,
      edgeFade: edgeAttenuation,
      speedRatio,
      mode: hasWeapons ? 'combat' : 'navigation',
      precisionActive: host.isPrecisionRotationActive(),
    };
  }

  /** Distancia de proyección del punto de fuga, escalada con la velocidad (clamp 250..1800). */
  projectionDistance(speed: number): number {
    const dynamic = 450 + Math.max(0, speed) * 2.5;
    return Math.max(250, Math.min(1800, dynamic));
  }

  /** Proyecta un punto del mundo a NDC/normalizado del HUD usando los scratch buffers propios (sin alloc). */
  project(point: Vector3, view: mat4, proj: mat4): {
    ndcX: number; ndcY: number; ndcZ: number;
    normalizedX: number; normalizedY: number;
    inFront: boolean; visible: boolean;
  } | null {
    mat4.multiply(this.viewProjection, proj, view);
    this.clipVec[0] = point.x;
    this.clipVec[1] = point.y;
    this.clipVec[2] = point.z;
    this.clipVec[3] = 1;
    vec4.transformMat4(this.clipVec, this.clipVec, this.viewProjection);
    const w = this.clipVec[3];
    if (!isFinite(w) || Math.abs(w) < 1e-5) {
      return null;
    }
    const ndcX = this.clipVec[0] / w;
    const ndcY = this.clipVec[1] / w;
    const ndcZ = this.clipVec[2] / w;
    const normalizedX = Math.max(0, Math.min(1, (ndcX + 1) * 0.5));
    const normalizedY = Math.max(0, Math.min(1, (1 - ndcY) * 0.5));
    const inFront = w > 0;
    // NDC válido está en [-1, 1]; tolerancia ligera para evitar clipping temprano.
    const zInRange = ndcZ >= -1.1 && ndcZ <= 1.1;
    const visible = inFront && zInRange;
    return { ndcX, ndcY, ndcZ, normalizedX, normalizedY, inFront, visible };
  }
}
