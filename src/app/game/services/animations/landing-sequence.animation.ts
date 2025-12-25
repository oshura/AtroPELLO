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

export class LandingSequenceAnimation implements GameAnimation {
  public readonly name = 'landing-sequence';

  private context!: LandingApproachContext;
  private blocking = true;
  private elapsed = 0;
  private readonly cinematicDuration = 5.0;
  private readonly cameraHeight = 2.3;
  private readonly cameraForwardOffset = 6.5;
  private readonly cameraDollyRange = 4.5;
  private readonly flareMaxDegrees = 10;
  private readonly atmosphereEntryBlendStart = 0.82;
  private readonly atmosphereEntryBlendEnd = 1;

  private surfaceNormal!: Vector3;
  private contactPoint!: Vector3;
  private approachDir!: Vector3;
  private shipStart!: Vector3;
  private shipEnd!: Vector3;
  private shipEntry!: Vector3;
  private startSpeed = 0;
  private touchdownTriggered = false;

  private prevCameraMode: CameraMode | null = null;
  private inputBlockers: Array<() => void> = [];

  private savedShipDynamics: { acceleration: number; deceleration: number; maxSpeed: number } | null = null;

  public configure(context: LandingApproachContext): void {
    this.context = context;
  }

  public start(engine: GameEngine): void {
    const ship = engine.spaceship;
    if (!ship || !this.context) {
      this.blocking = false;
      return;
    }

    this.savedShipDynamics = {
      acceleration: ship.acceleration,
      deceleration: ship.deceleration,
      maxSpeed: ship.maxSpeed
    };
    ship.acceleration = 5;
    ship.deceleration = 7;
    ship.targetSpeed = 0;
    ship.currentSpeed = Math.min(ship.currentSpeed, 8);
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

    const normal = this.normalize(this.context.surfaceNormal ?? { x: 0, y: 1, z: 0 });
    this.surfaceNormal = normal;
    this.contactPoint = this.resolveContactPoint();
    this.approachDir = this.computeApproachDirection(ship.forwardDirection, normal);
    const startOffset = Math.max(40, (this.context.radius ?? 800) * 0.05);
    const startHeight = Math.max(12, (this.context.radius ?? 800) * 0.02);
    const settleHeight = Math.max(2.4, (this.context.radius ?? 800) * 0.004);
    this.shipStart = {
      x: this.contactPoint.x - this.approachDir.x * startOffset + normal.x * (startHeight + settleHeight),
      y: this.contactPoint.y - this.approachDir.y * startOffset + normal.y * (startHeight + settleHeight),
      z: this.contactPoint.z - this.approachDir.z * startOffset + normal.z * (startHeight + settleHeight)
    };
    this.shipEnd = {
      x: this.contactPoint.x + normal.x * settleHeight,
      y: this.contactPoint.y + normal.y * settleHeight,
      z: this.contactPoint.z + normal.z * settleHeight
    };
    const entryDepth = Math.max(12, (this.context.radius ?? 800) * 0.015);
    this.shipEntry = {
      x: this.contactPoint.x - normal.x * entryDepth,
      y: this.contactPoint.y - normal.y * entryDepth,
      z: this.contactPoint.z - normal.z * entryDepth,
    };
    this.startSpeed = Math.max(6, Math.min(ship.currentSpeed || 0, ship.maxSpeed || 12));
    this.elapsed = 0;
    this.touchdownTriggered = false;

    this.prevCameraMode = engine.camera?.getCurrentMode?.() ?? null;
    this.configureCamera(engine, this.shipStart);
    this.installKeyBlockers();
    this.applyShipPose(ship, this.shipStart, normal, this.approachDir, 0);
    ship.velocity.x = ship.velocity.y = ship.velocity.z = 0;
    ship.thrusterState = ThrusterState.BRAKING;
    ship.currentSpeed = this.startSpeed;
    ship.targetSpeed = this.startSpeed;

    engine.notifyLandingSequenceStarted?.(this.context);
  }

  public update(engine: GameEngine, dt: number): boolean {
    const ship = engine.spaceship;
    if (!ship || !this.context) {
      return true;
    }

    this.elapsed += dt;
    const progress = clamp01(this.elapsed / this.cinematicDuration);
    const eased = smoothstep(progress);
    const shipPos = this.computeBlendedShipPosition(progress);
    const flare = this.computeFlare(progress);
    this.applyShipPose(ship, shipPos, this.surfaceNormal, this.approachDir, flare);
    this.updateShipKinetics(ship, eased);
    this.updateCinematicCamera(engine, ship, eased);

    if (!this.touchdownTriggered && progress >= this.atmosphereEntryBlendStart) {
      this.touchdownTriggered = true;
      try { engine.playLandingCinematicTouchdownFx?.(this.shipEnd, this.surfaceNormal); } catch {}
    }

    if (progress >= 1) {
      this.finish(engine, false);
      return true;
    }
    return false;
  }

  public render(engine: GameEngine): void {
    // Cinematic uses cámara física; no overlay necesario.
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

    try { this.inputBlockers.forEach(fn => fn()); } catch {}
    this.inputBlockers = [];

    // Keep collisions disabled through landed state; only re-enable if sequence aborts
    if (aborted) {
      engine.collisionsDisabled = false;
    } else {
      engine.collisionsDisabled = true;
    }
    if (engine.camera && this.prevCameraMode !== null) {
      try { engine.camera.setCameraMode(this.prevCameraMode); } catch {}
    }
    this.prevCameraMode = null;

    const outcome = aborted ? 'aborted' : 'landed';
    try { engine.notifyLandingSequenceFinished?.(outcome, aborted ? null : this.context); } catch {}
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

  private computeBlendedShipPosition(progress: number): Vector3 {
    if (progress < this.atmosphereEntryBlendStart) {
      const local = clamp01(progress / Math.max(1e-3, this.atmosphereEntryBlendStart));
      const eased = smoothstep(local);
      return this.lerpVec(this.shipStart, this.shipEnd, eased);
    }
    const span = Math.max(1e-3, this.atmosphereEntryBlendEnd - this.atmosphereEntryBlendStart);
    const local = clamp01((progress - this.atmosphereEntryBlendStart) / span);
    const eased = smoothstep(local);
    return this.lerpVec(this.shipEnd, this.shipEntry, eased);
  }

  private lerpVec(a: Vector3, b: Vector3, t: number): Vector3 {
    const k = clamp01(t);
    return {
      x: lerp(a.x, b.x, k),
      y: lerp(a.y, b.y, k),
      z: lerp(a.z, b.z, k)
    };
  }

  private normalize(v: Vector3): Vector3 {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
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

  private configureCamera(engine: GameEngine, shipPosition: Vector3): void {
    const camera = engine.camera;
    if (!camera) {
      return;
    }
    try { camera.setCameraMode(CameraMode.MANUAL); } catch {}
    const position = this.getCameraPosition(0);
    const target = this.getCameraTarget(shipPosition);
    try {
      camera.seedManualTransform?.(position, target, this.surfaceNormal);
      camera.markDirty?.();
    } catch {}
  }

  private updateCinematicCamera(engine: GameEngine, ship: any, progress: number): void {
    const camera = engine.camera;
    if (!camera) {
      return;
    }
    const position = this.getCameraPosition(progress);
    const target = this.getCameraTarget(ship.position);
    try {
      camera.seedManualTransform?.(position, target, this.surfaceNormal);
      camera.markDirty?.();
    } catch {}
  }

  private getCameraPosition(progress: number): Vector3 {
    const eased = smoothstep(progress);
    const dolly = this.cameraForwardOffset + this.cameraDollyRange * eased;
    const heightBoost = this.cameraHeight + 0.8 * (1 - eased);
    return {
      x: this.contactPoint.x + this.approachDir.x * dolly + this.surfaceNormal.x * heightBoost,
      y: this.contactPoint.y + this.approachDir.y * dolly + this.surfaceNormal.y * heightBoost,
      z: this.contactPoint.z + this.approachDir.z * dolly + this.surfaceNormal.z * heightBoost,
    };
  }

  private getCameraTarget(shipPosition: Vector3): Vector3 {
    return {
      x: shipPosition.x + this.surfaceNormal.x * 0.4,
      y: shipPosition.y + this.surfaceNormal.y * 0.4,
      z: shipPosition.z + this.surfaceNormal.z * 0.4,
    };
  }

  private computeFlare(progress: number): number {
    const flareBoost = smoothstep(1 - Math.max(0, 1 - progress * 1.3));
    return this.flareMaxDegrees * flareBoost;
  }

  private updateShipKinetics(ship: any, eased: number): void {
    const remainingSpeed = clamp(this.startSpeed * (1 - eased * 0.98), 0, this.startSpeed);
    ship.currentSpeed = remainingSpeed;
    ship.targetSpeed = remainingSpeed;
    ship.thrusterState = remainingSpeed > 0.35 ? ThrusterState.BRAKING : ThrusterState.IDLE;
    ship.isThrusting = false;
    ship.controls.forward = false;
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
      z: forward.z * Math.cos(flareRad) + up.z * Math.sin(flareRad)
    });
    const lookTarget = {
      x: ship.position.x + dir.x,
      y: ship.position.y + dir.y,
      z: ship.position.z + dir.z
    };
    ship.lookAt(lookTarget, up);
    ship.updateModelMatrix();
    if (ship.boundingSphere?.center) {
      ship.boundingSphere.center.x = ship.position.x;
      ship.boundingSphere.center.y = ship.position.y;
      ship.boundingSphere.center.z = ship.position.z;
    }
  }
}
