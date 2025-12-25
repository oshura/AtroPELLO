import { GameAnimation } from './types';
import { GameEngine } from '../../GameEngine';
import { LandingApproachContext } from '../../types/landing.types';
import { CameraMode } from '../../Camera';
import { ThrusterState } from '../../game-objects/Spaceship';
import { Vector3 } from '../../../types/game.types';

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

export class AtmosphereLandingAnimation implements GameAnimation {
  public readonly name = 'atmosphere-landing';

  private context!: LandingApproachContext;
  private blocking = true;
  private elapsed = 0;
  private readonly descentDuration = 7;
  private readonly settleDuration = 2;
  private readonly rotationPhaseDuration = 2;
  private readonly finalRotationDegrees: number = 90;
  private readonly cameraHeight = 3.2;
  private readonly cameraStandoff = 11;
  private readonly flareMaxDegrees = 7;
  private readonly touchdownClearance = 0.85;
  private readonly landingCueTime = 2;
  private readonly dustLeadSeconds = 1;

  private surfaceNormal!: Vector3;
  private contactPoint!: Vector3;
  private approachDir!: Vector3;
  private shipStart!: Vector3;
  private shipEnd!: Vector3;
  private cameraAnchor!: Vector3;
  private startSpeed = 0;
  private touchdownTriggered = false;
  private preTouchdownFxTriggered = false;
  private landingCueTriggered = false;
  private lastWingDeploymentProgress = -1;

  private prevCameraMode: CameraMode | null = null;
  private inputBlockers: Array<() => void> = [];
  private savedShipDynamics: { acceleration: number; deceleration: number; maxSpeed: number } | null = null;
  private prevCollisionsDisabled = false;

  public configure(context: LandingApproachContext): void {
    this.context = context;
  }

  public start(engine: GameEngine): void {
    const ship = engine.spaceship;
    if (!ship || !this.context) {
      this.blocking = false;
      return;
    }

    this.prevCollisionsDisabled = engine.collisionsDisabled;
    this.savedShipDynamics = {
      acceleration: ship.acceleration,
      deceleration: ship.deceleration,
      maxSpeed: ship.maxSpeed,
    };

    ship.acceleration = 4.2;
    ship.deceleration = 6;
    ship.targetSpeed = 0;
    ship.currentSpeed = Math.min(ship.currentSpeed, 6);
    ship.velocity.x = ship.velocity.y = ship.velocity.z = 0;
    ship.thrusterState = ThrusterState.BRAKING;
    ship.voidEnergyPaused = true;
    ship.controls.forward = false;
    ship.controls.backward = false;
    ship.controls.left = false;
    ship.controls.right = false;
    ship.controls.up = false;
    ship.controls.down = false;
    ship.controls.speedUp = false;
    ship.controls.speedDown = false;
    ship.controls.rollLeft = false;
    ship.controls.rollRight = false;

    engine.collisionsDisabled = true;

    this.surfaceNormal = this.normalize(this.context.surfaceNormal ?? this.deriveNormalFromContext());
    this.contactPoint = this.resolveContactPoint();
    this.approachDir = this.computeApproachDirection(ship.forwardDirection, this.surfaceNormal);

    const radius = Math.max(200, this.context.radius ?? 600);
    const startOffset = Math.max(24, radius * 0.035);
    const glideHeight = Math.max(1.8, radius * 0.0025);
    const arcHeight = glideHeight + Math.max(1.5, radius * 0.002);

    this.shipStart = {
      x: this.contactPoint.x - this.approachDir.x * startOffset + this.surfaceNormal.x * (arcHeight + glideHeight),
      y: this.contactPoint.y - this.approachDir.y * startOffset + this.surfaceNormal.y * (arcHeight + glideHeight),
      z: this.contactPoint.z - this.approachDir.z * startOffset + this.surfaceNormal.z * (arcHeight + glideHeight),
    };
    this.shipEnd = {
      x: this.contactPoint.x + this.surfaceNormal.x * this.touchdownClearance,
      y: this.contactPoint.y + this.surfaceNormal.y * this.touchdownClearance,
      z: this.contactPoint.z + this.surfaceNormal.z * this.touchdownClearance,
    };
    this.cameraAnchor = this.getCameraAnchor();

    this.startSpeed = Math.max(4, Math.min(ship.currentSpeed || 0, ship.maxSpeed || 9));
    this.elapsed = 0;
    this.touchdownTriggered = false;
    this.preTouchdownFxTriggered = false;
    this.landingCueTriggered = false;

    this.prevCameraMode = engine.camera?.getCurrentMode?.() ?? null;
    this.configureCamera(engine, this.shipStart);
    this.installKeyBlockers();
    this.applyShipPose(ship, this.shipStart, this.surfaceNormal, this.approachDir, 0);
    ship.velocity.x = ship.velocity.y = ship.velocity.z = 0;
    ship.thrusterState = ThrusterState.BRAKING;
    ship.currentSpeed = this.startSpeed;
    ship.targetSpeed = this.startSpeed;

    engine.ensureAtmosphereLandingAirRushLoop?.();
    this.lastWingDeploymentProgress = -1;
    this.syncWingDeployment(engine, 0);

    try { engine.notifyAtmosphereLandingCinematicStarted?.(this.context); } catch { /* ignore */ }
  }

  public update(engine: GameEngine, dt: number): boolean {
    const ship = engine.spaceship;
    if (!ship || !this.context) {
      return true;
    }

    this.elapsed += dt;

    const descentProgress = clamp01(this.elapsed / this.descentDuration);
    const eased = smoothstep(descentProgress);
    const shipPos = this.lerpVec(this.shipStart, this.shipEnd, eased);
    const rotationProgress = this.computeRotationProgress();
    const easedRotation = smoothstep(rotationProgress);
    const heading = this.getRotatedApproachDirection(easedRotation);
    const flare = this.computeAdaptiveFlare(descentProgress, easedRotation);
    this.applyShipPose(ship, shipPos, this.surfaceNormal, heading, flare);
    this.syncWingDeployment(engine, easedRotation);
    this.updateShipKinetics(ship, descentProgress);
    this.updateCinematicCamera(engine, ship);

    if (!this.landingCueTriggered && this.elapsed >= this.landingCueTime) {
      this.landingCueTriggered = true;
      try { engine.playAtmosphereLandingApproachCue?.(); } catch { /* ignore */ }
    }

    const dustTriggerTime = this.descentDuration - this.dustLeadSeconds;
    if (!this.preTouchdownFxTriggered && this.elapsed >= dustTriggerTime) {
      this.preTouchdownFxTriggered = true;
      try { engine.spawnAtmosphereLandingDustSheets?.(this.contactPoint, this.surfaceNormal); } catch { /* ignore */ }
    }

    if (!this.touchdownTriggered && descentProgress >= 1) {
      this.touchdownTriggered = true;
      try { engine.playLandingCinematicTouchdownFx?.(this.shipEnd, this.surfaceNormal, { skipAudio: true }); } catch { /* ignore */ }
    }

    const totalDuration = this.descentDuration + this.settleDuration;
    if (this.elapsed >= totalDuration) {
      this.finish(engine, false);
      return true;
    }
    return false;
  }

  public render(_engine: GameEngine): void {
    // Cámara física, no se requieren overlays.
  }

  public isBlockingInputs(): boolean {
    return this.blocking;
  }

  public cleanup(engine: GameEngine): void {
    this.finish(engine, true);
  }

  private finish(engine: GameEngine, aborted: boolean): void {
    if (!this.blocking) {
      return;
    }
    const ship = engine.spaceship;
    if (ship && this.savedShipDynamics) {
      ship.acceleration = this.savedShipDynamics.acceleration;
      ship.deceleration = this.savedShipDynamics.deceleration;
      ship.maxSpeed = this.savedShipDynamics.maxSpeed;
      ship.targetSpeed = 0;
      ship.currentSpeed = 0;
      ship.velocity.x = ship.velocity.y = ship.velocity.z = 0;
      ship.voidEnergyPaused = false;
      ship.thrusterState = ThrusterState.IDLE;
    }
    this.savedShipDynamics = null;

    try { this.inputBlockers.forEach(fn => fn()); } catch { /* ignore */ }
    this.inputBlockers = [];

    engine.collisionsDisabled = this.prevCollisionsDisabled;

    if (engine.camera && this.prevCameraMode !== null) {
      try { engine.camera.setCameraMode(this.prevCameraMode); } catch { /* ignore */ }
    }
    this.prevCameraMode = null;

    const outcome = aborted ? 'aborted' : 'completed';
    this.syncWingDeployment(engine, aborted ? 0 : 1);
    try { engine.notifyAtmosphereLandingCinematicFinished?.(outcome, aborted ? null : this.context); } catch { /* ignore */ }
    this.blocking = false;
  }

  private installKeyBlockers(): void {
    const handler = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    ['keydown', 'keyup', 'keypress'].forEach(evt => {
      document.addEventListener(evt, handler, { capture: true });
      this.inputBlockers.push(() => document.removeEventListener(evt, handler, { capture: true }));
    });
  }

  private updateCinematicCamera(engine: GameEngine, ship: any): void {
    const camera = engine.camera;
    if (!camera) {
      return;
    }
    const position = this.cameraAnchor;
    const target = this.getCameraTarget(ship.position);
    try {
      camera.seedManualTransform?.(position, target, this.surfaceNormal);
      camera.markDirty?.();
    } catch { /* ignore */ }
  }

  private configureCamera(engine: GameEngine, shipPosition: Vector3): void {
    const camera = engine.camera;
    if (!camera) {
      return;
    }
    try { camera.setCameraMode(CameraMode.MANUAL); } catch { /* ignore */ }
    const position = this.cameraAnchor;
    const target = this.getCameraTarget(shipPosition);
    try {
      camera.seedManualTransform?.(position, target, this.surfaceNormal);
      camera.markDirty?.();
    } catch { /* ignore */ }
  }

  private getCameraAnchor(): Vector3 {
    return {
      x: this.contactPoint.x + this.approachDir.x * this.cameraStandoff + this.surfaceNormal.x * this.cameraHeight,
      y: this.contactPoint.y + this.approachDir.y * this.cameraStandoff + this.surfaceNormal.y * this.cameraHeight,
      z: this.contactPoint.z + this.approachDir.z * this.cameraStandoff + this.surfaceNormal.z * this.cameraHeight,
    };
  }

  private getCameraTarget(shipPosition: Vector3): Vector3 {
    return {
      x: shipPosition.x + this.surfaceNormal.x * 0.35,
      y: shipPosition.y + this.surfaceNormal.y * 0.35,
      z: shipPosition.z + this.surfaceNormal.z * 0.35,
    };
  }

  private computeFlare(progress: number): number {
    const early = smoothstep(Math.min(1, progress * 0.65));
    const late = Math.max(0, 1 - progress);
    const flareBoost = early * late;
    return this.flareMaxDegrees * flareBoost;
  }

  private computeAdaptiveFlare(descentProgress: number, rotationProgress: number): number {
    const base = this.computeFlare(descentProgress);
    const damping = clamp(1 - rotationProgress * 0.85, 0.2, 1);
    return base * damping;
  }

  private updateShipKinetics(ship: any, descentProgress: number): void {
    const brakeRatio = clamp(1 - descentProgress, 0, 1);
    const remainingSpeed = this.startSpeed * brakeRatio * 0.98;
    ship.currentSpeed = remainingSpeed;
    ship.targetSpeed = remainingSpeed;
    ship.thrusterState = remainingSpeed > 0.2 ? ThrusterState.BRAKING : ThrusterState.IDLE;
    ship.isThrusting = false;
    ship.controls.forward = false;
    if (descentProgress >= 1) {
      ship.currentSpeed = 0;
      ship.targetSpeed = 0;
      ship.velocity.x = ship.velocity.y = ship.velocity.z = 0;
      ship.thrusterState = ThrusterState.IDLE;
    }
  }

  private applyShipPose(
    ship: any,
    position: Vector3,
    up: Vector3,
    forward: Vector3,
    flareDegrees: number
  ): void {
    ship.position.x = position.x;
    ship.position.y = position.y;
    ship.position.z = position.z;

    const flareRad = flareDegrees * Math.PI / 180;
    const dir = this.normalize({
      x: forward.x * Math.cos(flareRad) + up.x * Math.sin(flareRad),
      y: forward.y * Math.cos(flareRad) + up.y * Math.sin(flareRad),
      z: forward.z * Math.cos(flareRad) + up.z * Math.sin(flareRad),
    });
    const lookTarget = {
      x: ship.position.x + dir.x,
      y: ship.position.y + dir.y,
      z: ship.position.z + dir.z,
    };
    ship.lookAt(lookTarget, up);
    ship.updateModelMatrix();
    if (ship.boundingSphere?.center) {
      ship.boundingSphere.center.x = ship.position.x;
      ship.boundingSphere.center.y = ship.position.y;
      ship.boundingSphere.center.z = ship.position.z;
    }
  }

  private resolveContactPoint(): Vector3 {
    if (this.context.surfacePoint) {
      return { ...this.context.surfacePoint };
    }
    const normal = this.surfaceNormal;
    const radius = Number.isFinite(this.context.radius) ? this.context.radius : 0;
    const center = this.context.planetCenter
      ? { ...this.context.planetCenter }
      : { x: 0, y: 0, z: 0 };
    return {
      x: center.x + normal.x * radius,
      y: center.y + normal.y * radius,
      z: center.z + normal.z * radius,
    };
  }

  private deriveNormalFromContext(): Vector3 {
    if (this.context.planetCenter && this.context.surfacePoint) {
      const dir = {
        x: this.context.surfacePoint.x - this.context.planetCenter.x,
        y: this.context.surfacePoint.y - this.context.planetCenter.y,
        z: this.context.surfacePoint.z - this.context.planetCenter.z,
      };
      return this.normalize(dir);
    }
    return { x: 0, y: 1, z: 0 };
  }

  private computeApproachDirection(forward: Vector3, normal: Vector3): Vector3 {
    const projected = this.projectOntoPlane(forward, normal);
    if (this.vectorLength(projected) < 1e-3) {
      return this.buildPerpendicular(normal);
    }
    return this.normalize(projected);
  }

  private projectOntoPlane(vector: Vector3, normal: Vector3): Vector3 {
    const dot = vector.x * normal.x + vector.y * normal.y + vector.z * normal.z;
    return {
      x: vector.x - normal.x * dot,
      y: vector.y - normal.y * dot,
      z: vector.z - normal.z * dot,
    };
  }

  private computeRotationProgress(): number {
    if (!Number.isFinite(this.rotationPhaseDuration) || this.rotationPhaseDuration <= 0) {
      return 0;
    }
    const rotationStart = Math.max(0, this.descentDuration - this.rotationPhaseDuration);
    const elapsedInRotation = this.elapsed - rotationStart;
    return clamp01(elapsedInRotation / this.rotationPhaseDuration);
  }

  private getRotatedApproachDirection(rotationProgress: number): Vector3 {
    if (!this.approachDir) {
      return { x: 0, y: 0, z: 1 };
    }
    if (rotationProgress <= 1e-4 || this.finalRotationDegrees === 0) {
      return this.approachDir;
    }
    const radians = (this.finalRotationDegrees * rotationProgress) * Math.PI / 180;
    const rotated = this.rotateAroundAxis(this.approachDir, this.surfaceNormal, radians);
    return this.normalize(rotated);
  }

  private rotateAroundAxis(vector: Vector3, axis: Vector3, radians: number): Vector3 {
    if (Math.abs(radians) <= 1e-4) {
      return { ...vector };
    }
    const normalizedAxis = this.normalize(axis);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dot = vector.x * normalizedAxis.x + vector.y * normalizedAxis.y + vector.z * normalizedAxis.z;
    const cross = {
      x: normalizedAxis.y * vector.z - normalizedAxis.z * vector.y,
      y: normalizedAxis.z * vector.x - normalizedAxis.x * vector.z,
      z: normalizedAxis.x * vector.y - normalizedAxis.y * vector.x,
    };
    return {
      x: vector.x * cos + cross.x * sin + normalizedAxis.x * dot * (1 - cos),
      y: vector.y * cos + cross.y * sin + normalizedAxis.y * dot * (1 - cos),
      z: vector.z * cos + cross.z * sin + normalizedAxis.z * dot * (1 - cos),
    };
  }

  private syncWingDeployment(engine: GameEngine, progress: number): void {
    const clamped = clamp01(progress);
    if (!engine?.setWingDeploymentProgress) {
      return;
    }
    if (Math.abs(clamped - this.lastWingDeploymentProgress) <= 1e-3) {
      return;
    }
    try { engine.setWingDeploymentProgress(clamped); } catch { /* ignore */ }
    this.lastWingDeploymentProgress = clamped;
  }

  private vectorLength(v: Vector3): number {
    return Math.hypot(v.x, v.y, v.z);
  }

  private buildPerpendicular(normal: Vector3): Vector3 {
    const ref = Math.abs(normal.y) > 0.6 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const cross = {
      x: normal.y * ref.z - normal.z * ref.y,
      y: normal.z * ref.x - normal.x * ref.z,
      z: normal.x * ref.y - normal.y * ref.x,
    };
    const len = this.vectorLength(cross) || 1;
    return { x: cross.x / len, y: cross.y / len, z: cross.z / len };
  }

  private lerpVec(a: Vector3, b: Vector3, t: number): Vector3 {
    const k = clamp01(t);
    return {
      x: lerp(a.x, b.x, k),
      y: lerp(a.y, b.y, k),
      z: lerp(a.z, b.z, k),
    };
  }

  private normalize(v: Vector3): Vector3 {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }
}
