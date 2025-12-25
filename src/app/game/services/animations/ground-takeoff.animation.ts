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

export class GroundTakeoffAnimation implements GameAnimation {
  public readonly name = 'ground-takeoff';
  private context!: LandingApproachContext;
  private blocking = true;
  private elapsed = 0;
  private readonly spoolDuration = 1.2;
  private readonly ascentDuration = 4.0;
  private readonly targetAltitude = 50; // unidades sobre la superficie
  private readonly targetSpeed = 5; // u/s suaves

  private prevCameraMode: CameraMode | null = null;
  private inputBlockers: Array<() => void> = [];
  private overlayAlpha = 1;
  private wingProgressStart = 0;
  private wingProgressEnd = 0;
  private readonly wingUnfoldSpoolShare = 0.65;

  private savedDynamics: { acceleration: number; deceleration: number; maxSpeed: number } | null = null;
  private startPoint!: Vector3;
  private endPoint!: Vector3;
  private upDir!: Vector3;
  private tangentDir!: Vector3;

  public configure(context: LandingApproachContext): void {
    this.context = context;
  }

  public start(engine: GameEngine): void {
    const ship = engine.spaceship;
    if (!ship || !this.context) {
      this.blocking = false;
      return;
    }

    if (typeof ship.getWingDeploymentProgress === 'function') {
      this.wingProgressStart = clamp01(ship.getWingDeploymentProgress());
    } else {
      this.wingProgressStart = 0;
    }
    this.wingProgressEnd = 0;
    this.applyWingDeployment(engine, 0);

    this.savedDynamics = {
      acceleration: ship.acceleration,
      deceleration: ship.deceleration,
      maxSpeed: ship.maxSpeed,
    };

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

    const normal = this.normalize(this.context.surfaceNormal ?? { x: 0, y: 1, z: 0 });
    this.upDir = normal;
    const surfacePoint = this.getSurfacePoint();
    const shipRadius = Math.max(2, ship.boundingSphere?.radius ?? 4);
    const liftPad = Math.max(6, shipRadius * 0.4);
    const basePoint = {
      x: surfacePoint.x + normal.x * liftPad,
      y: surfacePoint.y + normal.y * liftPad,
      z: surfacePoint.z + normal.z * liftPad,
    };
    const targetPoint = {
      x: surfacePoint.x + normal.x * (this.targetAltitude + liftPad),
      y: surfacePoint.y + normal.y * (this.targetAltitude + liftPad),
      z: surfacePoint.z + normal.z * (this.targetAltitude + liftPad),
    };
    this.startPoint = basePoint;
    this.endPoint = targetPoint;
    this.tangentDir = this.computeTangentDirection(ship.forwardDirection, normal);

    this.installKeyBlockers();
    engine.notifyTakeoffSequenceStarted(this.context, 'ground');
  }

  public update(engine: GameEngine, dt: number): boolean {
    const ship = engine.spaceship;
    if (!ship) {
      return true;
    }
    this.elapsed += dt;

    if (this.elapsed <= this.spoolDuration) {
      const t = smoothstep(this.elapsed / Math.max(0.001, this.spoolDuration));
      this.applyShipPose(ship, this.startPoint, this.upDir, this.tangentDir, -8);
      ship.thrusterState = ThrusterState.IDLE;
      ship.targetSpeed = 0;
      ship.currentSpeed = 0;
      this.applyWingDeployment(engine, this.wingUnfoldSpoolShare * t);
      this.overlayAlpha = lerp(1, 0.6, t);
      return false;
    }

    const localT = clamp01((this.elapsed - this.spoolDuration) / Math.max(0.001, this.ascentDuration));
    const eased = smoothstep(localT);
    const pos = this.lerpVec(this.startPoint, this.endPoint, eased);
    this.applyShipPose(ship, pos, this.upDir, this.tangentDir, 4);
    ship.thrusterState = ThrusterState.CRUISING;
    const desiredSpeed = lerp(0, this.targetSpeed, eased);
    ship.targetSpeed = desiredSpeed;
    ship.currentSpeed = desiredSpeed;
    const wingJourney = this.wingUnfoldSpoolShare + (1 - this.wingUnfoldSpoolShare) * eased;
    this.applyWingDeployment(engine, wingJourney);
    this.overlayAlpha = lerp(0.6, 0, eased);

    if (localT >= 1) {
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
    if (ship && this.savedDynamics) {
      ship.acceleration = this.savedDynamics.acceleration;
      ship.deceleration = this.savedDynamics.deceleration;
      ship.maxSpeed = this.savedDynamics.maxSpeed;
      if (aborted) {
        ship.targetSpeed = 0;
        ship.currentSpeed = 0;
        ship.thrusterState = ThrusterState.IDLE;
      } else {
        ship.targetSpeed = this.targetSpeed;
        ship.currentSpeed = this.targetSpeed;
        ship.thrusterState = ThrusterState.CRUISING;
      }
      ship.voidEnergyPaused = false;
    }
    this.savedDynamics = null;

    try { this.inputBlockers.forEach(fn => fn()); } catch {}
    this.inputBlockers = [];

    engine.collisionsDisabled = false;
    if (engine.camera && this.prevCameraMode !== null) {
      try { engine.camera.setCameraMode(this.prevCameraMode); } catch {}
    }
    this.prevCameraMode = null;
    this.overlayAlpha = 0;
    this.blocking = false;
    if (aborted) {
      try { engine.setWingDeploymentProgress(this.wingProgressStart); } catch {}
    } else {
      this.applyWingDeployment(engine, 1);
    }
    const outcome = aborted ? 'aborted' : 'stage-one';
    engine.notifyTakeoffSequenceFinished(outcome as 'aborted' | 'stage-one', this.context, 'ground');
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

  private applyWingDeployment(engine: GameEngine, journeyT: number): void {
    const normalized = clamp01(journeyT);
    try {
      engine.setWingDeploymentProgress(
        lerp(this.wingProgressStart, this.wingProgressEnd, normalized)
      );
    } catch {}
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

  private getSurfacePoint(): Vector3 {
    if (this.context?.surfacePoint) {
      return { ...this.context.surfacePoint };
    }
    const normal = this.normalize(this.context.surfaceNormal ?? { x: 0, y: 1, z: 0 });
    return {
      x: normal.x * Math.max(1, this.context.radius ?? 1),
      y: normal.y * Math.max(1, this.context.radius ?? 1),
      z: normal.z * Math.max(1, this.context.radius ?? 1)
    };
  }
}
