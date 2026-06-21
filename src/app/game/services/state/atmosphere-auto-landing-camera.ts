import { Vector3 } from '../../../types/game.types';
import { CameraMode } from '../../Camera';
import { LandingApproachContext } from '../../types/landing.types';
import { vec3Normalize, vec3Length, vec3Dot } from '../../math/vector-math';

interface AutoLandingCameraLike {
  position: Vector3;
  target: Vector3;
  up: Vector3;
  getCurrentMode?(): CameraMode;
  setCameraMode(mode: CameraMode): void;
  seedManualTransform?(pos: Vector3, target: Vector3, up: Vector3): void;
  markDirty(): void;
}

interface AutoLandingShipLike {
  position: Vector3;
  velocity?: Vector3;
  forwardDirection?: Vector3;
}

export interface AtmosphereAutoLandingCameraHost {
  getCamera(): AutoLandingCameraLike | null;
  getSpaceship(): AutoLandingShipLike | null;
  getLandingContext(): LandingApproachContext | null;
  hasCinematicCameraHold(): boolean;
  deriveLandingNormal(context: LandingApproachContext): Vector3;
  resolveContactPoint(context: LandingApproachContext): Vector3;
  buildPerpendicularGroundDirection(normal: Vector3): Vector3;
  spawnAutoLandingDust(spawnPoint: Vector3): void;
  startAutoLandingCue(): void;
  stopAutoLandingCue(): void;
}

/**
 * Cámara de auto-aterrizaje en atmósfera: encuadra la nave desde atrás/arriba mientras desciende sola y
 * se libera cuando la velocidad lateral baja. Antes vivía en GameEngine. Su `update` corre en el LOOP
 * (HOT) pero con early-return barato cuando no está activa (sólo trabaja durante el breve auto-aterrizaje).
 * Math directa de `vector-math` (sin indirección de host en el hot path). docs/ARQUITECTURA.md Fase 5.2 (sub-rebanada 2).
 */
export class AtmosphereAutoLandingCamera {
  private active = false;
  private prevMode: CameraMode | null = null;
  private normal: Vector3 | null = null;
  private contactPoint: Vector3 | null = null;
  private startedAt = 0;
  private dustTriggered = false;
  /** Contexto diferido cuando había un hold cinemático activo al pedir la cámara (bridge con el hold). */
  private pendingContext: LandingApproachContext | null = null;

  private readonly MIN_HOLD_MS = 900;
  private readonly RELEASE_SPEED = 0.4;
  private readonly BACK_OFFSET = 32;
  private readonly UP_OFFSET = 8;
  private readonly TARGET_LIFT = 3;

  get isActive(): boolean {
    return this.active;
  }

  /** Devuelve y limpia el contexto diferido (lo usa el motor al liberar el hold cinemático). */
  takePending(): LandingApproachContext | null {
    const pending = this.pendingContext;
    this.pendingContext = null;
    return pending;
  }

  clearPending(): void {
    this.pendingContext = null;
  }

  start(host: AtmosphereAutoLandingCameraHost, context: LandingApproachContext): void {
    if (host.hasCinematicCameraHold()) {
      this.pendingContext = context;
      return;
    }
    const camera = host.getCamera();
    const ship = host.getSpaceship();
    if (!camera || !ship) {
      return;
    }
    this.pendingContext = null;
    const normal = vec3Normalize(context.surfaceNormal ?? host.deriveLandingNormal(context));
    const contactPoint = host.resolveContactPoint(context);
    const now = performance?.now?.() ?? Date.now();
    if (!this.active) {
      this.prevMode = camera.getCurrentMode?.() ?? null;
      const seedPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
      const seedTarget = { x: camera.target.x, y: camera.target.y, z: camera.target.z };
      const seedUp = { x: camera.up.x, y: camera.up.y, z: camera.up.z };
      try {
        camera.setCameraMode(CameraMode.MANUAL);
        camera.seedManualTransform?.(seedPos, seedTarget, seedUp);
      } catch { /* ignore */ }
    } else if (camera.getCurrentMode?.() !== CameraMode.MANUAL) {
      try { camera.setCameraMode(CameraMode.MANUAL); } catch { /* ignore */ }
    }
    this.active = true;
    this.startedAt = now;
    this.normal = normal;
    this.contactPoint = contactPoint;
    this.dustTriggered = false;
    this.applyPose(host, normal);
    this.triggerDust(host, contactPoint, normal);
  }

  stop(host: AtmosphereAutoLandingCameraHost): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    this.pendingContext = null;
    this.normal = null;
    this.contactPoint = null;
    this.dustTriggered = false;
    host.stopAutoLandingCue();
    const prevMode = this.prevMode;
    this.prevMode = null;
    const camera = host.getCamera();
    if (camera && prevMode !== null) {
      try { camera.setCameraMode(prevMode); } catch { /* ignore */ }
    }
  }

  /** HOT: corre en el loop. Early-return barato si no está activa. */
  update(host: AtmosphereAutoLandingCameraHost): void {
    if (!this.active) {
      return;
    }
    const camera = host.getCamera();
    const ship = host.getSpaceship();
    if (!camera || !ship) {
      this.stop(host);
      return;
    }
    const context = host.getLandingContext();
    if (!context?.autoLand) {
      this.stop(host);
      return;
    }
    const normalSource = context.surfaceNormal ?? this.normal ?? host.deriveLandingNormal(context);
    const normal = vec3Normalize(normalSource);
    this.normal = normal;
    this.applyPose(host, normal);
    if (this.shouldRelease(host, normal)) {
      this.stop(host);
    }
  }

  private shouldRelease(host: AtmosphereAutoLandingCameraHost, normal: Vector3): boolean {
    const now = performance?.now?.() ?? Date.now();
    if ((now - this.startedAt) < this.MIN_HOLD_MS) {
      return false;
    }
    return this.computeLateralSpeed(host, normal) <= this.RELEASE_SPEED;
  }

  private applyPose(host: AtmosphereAutoLandingCameraHost, normal: Vector3): void {
    const camera = host.getCamera();
    const ship = host.getSpaceship();
    if (!camera || !ship) {
      return;
    }
    const forward = vec3Normalize(ship.forwardDirection || normal);
    let tangent = this.projectOntoPlane(forward, normal);
    if (vec3Length(tangent) < 1e-3) {
      tangent = host.buildPerpendicularGroundDirection(normal);
    } else {
      tangent = vec3Normalize(tangent);
    }
    const shipPos = ship.position;
    const cameraPos = {
      x: shipPos.x - tangent.x * this.BACK_OFFSET + normal.x * this.UP_OFFSET,
      y: shipPos.y - tangent.y * this.BACK_OFFSET + normal.y * this.UP_OFFSET,
      z: shipPos.z - tangent.z * this.BACK_OFFSET + normal.z * this.UP_OFFSET,
    };
    const target = {
      x: shipPos.x + normal.x * this.TARGET_LIFT,
      y: shipPos.y + normal.y * this.TARGET_LIFT,
      z: shipPos.z + normal.z * this.TARGET_LIFT,
    };
    try {
      camera.seedManualTransform?.(cameraPos, target, normal);
      camera.markDirty();
    } catch { /* ignore */ }
  }

  private computeLateralSpeed(host: AtmosphereAutoLandingCameraHost, normal: Vector3): number {
    const ship = host.getSpaceship();
    if (!ship) {
      return 0;
    }
    const velocity = ship.velocity || { x: 0, y: 0, z: 0 };
    const verticalComponent = vec3Dot(velocity, normal);
    const lateral = {
      x: velocity.x - normal.x * verticalComponent,
      y: velocity.y - normal.y * verticalComponent,
      z: velocity.z - normal.z * verticalComponent,
    };
    return vec3Length(lateral);
  }

  private projectOntoPlane(v: Vector3, n: Vector3): Vector3 {
    const dot = vec3Dot(v, n);
    return { x: v.x - dot * n.x, y: v.y - dot * n.y, z: v.z - dot * n.z };
  }

  private triggerDust(host: AtmosphereAutoLandingCameraHost, contactPoint: Vector3, normal: Vector3): void {
    if (this.dustTriggered) {
      return;
    }
    this.dustTriggered = true;
    const spawnPoint = {
      x: contactPoint.x + normal.x * 2,
      y: contactPoint.y + normal.y * 2,
      z: contactPoint.z + normal.z * 2,
    };
    host.spawnAutoLandingDust(spawnPoint);
    host.startAutoLandingCue();
  }
}
