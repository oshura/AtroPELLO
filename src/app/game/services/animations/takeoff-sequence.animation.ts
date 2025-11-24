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

export class TakeoffSequenceAnimation implements GameAnimation {
  public readonly name = 'takeoff-sequence';
  private context!: LandingApproachContext;
  private blocking = true;
  private elapsed = 0;
  private readonly prepDuration = 1.0;
  private readonly ascentDuration = 4.0;
  private readonly exitDuration = 2.0;

  private burrowTarget!: Vector3;
  private ascentTarget!: Vector3;
  private exitTarget!: Vector3;
  private tangentDir!: Vector3;

  private prevCameraMode: CameraMode | null = null;
  private inputBlockers: Array<() => void> = [];
  private overlayAlpha = 1;

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

    ship.acceleration = Math.max(6, ship.acceleration);
    ship.deceleration = Math.max(6, ship.deceleration);
    ship.maxSpeed = Math.max(ship.maxSpeed, 28);
    ship.targetSpeed = 0;
    ship.currentSpeed = 0;
    ship.velocity.x = ship.velocity.y = ship.velocity.z = 0;
    ship.thrusterState = ThrusterState.IDLE;
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

    this.prevCameraMode = engine.camera?.getCurrentMode?.() ?? null;
    engine.camera?.setCameraMode?.(CameraMode.COCKPIT);

    const normal = this.normalize(this.context.surfaceNormal);
    const surfacePoint = { ...this.context.surfacePoint };
    const burrowDepth = Math.max(5, this.context.radius * 0.01);
    const ascendHeight = Math.max(120, this.context.radius * 0.2);
    const exitDrift = Math.max(80, this.context.radius * 0.12);
    this.burrowTarget = {
      x: surfacePoint.x - normal.x * burrowDepth,
      y: surfacePoint.y - normal.y * burrowDepth,
      z: surfacePoint.z - normal.z * burrowDepth
    };
    this.ascentTarget = {
      x: surfacePoint.x + normal.x * ascendHeight,
      y: surfacePoint.y + normal.y * ascendHeight,
      z: surfacePoint.z + normal.z * ascendHeight
    };
    this.tangentDir = this.computeTangentDirection(ship.forwardDirection, normal);
    this.exitTarget = {
      x: this.ascentTarget.x + this.tangentDir.x * exitDrift,
      y: this.ascentTarget.y + this.tangentDir.y * exitDrift,
      z: this.ascentTarget.z + this.tangentDir.z * exitDrift
    };

    this.installKeyBlockers();
    engine.notifyTakeoffSequenceStarted(this.context);
  }

  public update(engine: GameEngine, dt: number): boolean {
    const ship = engine.spaceship;
    if (!ship || !this.context) {
      return true;
    }
    this.elapsed += dt;
    const normal = this.normalize(this.context.surfaceNormal);

    if (this.elapsed <= this.prepDuration) {
      const t = smoothstep(this.elapsed / Math.max(0.001, this.prepDuration));
      const pos = this.lerpVec(this.context.surfacePoint, this.burrowTarget, t);
      this.applyShipPose(ship, pos, normal, normal, -10);
      ship.thrusterState = ThrusterState.BRAKING;
      ship.targetSpeed = 0;
      ship.currentSpeed = lerp(ship.currentSpeed, 0, clamp01(dt * 6));
      this.overlayAlpha = 1;
    } else if (this.elapsed <= this.prepDuration + this.ascentDuration) {
      const localT = (this.elapsed - this.prepDuration) / Math.max(0.001, this.ascentDuration);
      const pos = this.lerpVec(this.burrowTarget, this.ascentTarget, smoothstep(localT));
      this.applyShipPose(ship, pos, normal, this.tangentDir, 8);
      ship.thrusterState = ThrusterState.CRUISING;
      ship.targetSpeed = lerp(0, 18, clamp01(localT));
      ship.currentSpeed = ship.targetSpeed;
      this.overlayAlpha = lerp(1, 0.2, clamp01(localT));
    } else if (this.elapsed <= this.prepDuration + this.ascentDuration + this.exitDuration) {
      const localT = (this.elapsed - (this.prepDuration + this.ascentDuration)) / Math.max(0.001, this.exitDuration);
      const pos = this.lerpVec(this.ascentTarget, this.exitTarget, smoothstep(localT));
      this.applyShipPose(ship, pos, normal, this.tangentDir, 2);
      ship.thrusterState = ThrusterState.CRUISING;
      ship.targetSpeed = lerp(18, this.savedShipDynamics?.maxSpeed ?? 24, clamp01(localT));
      ship.currentSpeed = ship.targetSpeed;
      this.overlayAlpha = lerp(0.2, 0, clamp01(localT));
    } else {
      this.finish(engine, false);
      return true;
    }

    return false;
  }

  public render(engine: GameEngine): void {
    if (this.overlayAlpha <= 0) {
      return;
    }
    const overlay = engine.overlayRenderer as any;
    if (overlay?.drawSolid) {
      try { overlay.drawSolid([0, 0, 0], this.overlayAlpha); } catch {}
    }
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
      ship.targetSpeed = ship.maxSpeed * 0.3;
      ship.currentSpeed = ship.targetSpeed;
      ship.voidEnergyPaused = false;
      ship.thrusterState = ThrusterState.CRUISING;
    }
    this.savedShipDynamics = null;

    try { this.inputBlockers.forEach(fn => fn()); } catch {}
    this.inputBlockers = [];

    engine.collisionsDisabled = false;
    if (engine.camera && this.prevCameraMode !== null) {
      try { engine.camera.setCameraMode(this.prevCameraMode); } catch {}
    }
    this.prevCameraMode = null;

    this.overlayAlpha = 0;
    this.blocking = false;
    const outcome = aborted ? 'aborted' : 'completed';
    try { engine.notifyTakeoffSequenceFinished(outcome as 'completed' | 'aborted', this.context); } catch {}
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

  private computeTangentDirection(forward: Vector3, normal: Vector3): Vector3 {
    const dot = forward.x * normal.x + forward.y * normal.y + forward.z * normal.z;
    let tangent = {
      x: forward.x - normal.x * dot,
      y: forward.y - normal.y * dot,
      z: forward.z - normal.z * dot
    };
    const len = Math.hypot(tangent.x, tangent.y, tangent.z);
    if (len < 1e-3) {
      // choose arbitrary perpendicular vector
      const axis = Math.abs(normal.y) > 0.5 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      tangent = {
        x: normal.y * axis.z - normal.z * axis.y,
        y: normal.z * axis.x - normal.x * axis.z,
        z: normal.x * axis.y - normal.y * axis.x
      };
    }
    return this.normalize(tangent);
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
