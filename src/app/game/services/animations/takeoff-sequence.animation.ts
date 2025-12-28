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

type TakeoffPhase = 'ground' | 'atmo-exit';

export class TakeoffSequenceAnimation implements GameAnimation {
  public readonly name = 'takeoff-sequence';
  private context!: LandingApproachContext;
  private blocking = true;
  private elapsed = 0;
  private readonly prepDuration = 1.0;
  private readonly ascentDuration = 4.0;
  private readonly exitDuration = 2.0;
  private readonly phaseTwoStartAltitude = 1000;

  private burrowTarget!: Vector3;
  private ascentTarget!: Vector3;
  private exitTarget!: Vector3;
  private tangentDir!: Vector3;
  private coreStart!: Vector3;
  private phase: TakeoffPhase = 'ground';

  private prevCameraMode: CameraMode | null = null;
  private inputBlockers: Array<() => void> = [];
  private overlayAlpha = 1;
  private overlaySuppressed = false;

  private savedShipDynamics: { acceleration: number; deceleration: number; maxSpeed: number } | null = null;

  public configure(
    context: LandingApproachContext,
    options?: { phase?: TakeoffPhase; suppressOverlay?: boolean },
  ): void {
    this.context = context;
    this.phase = options?.phase ?? 'ground';
    this.overlaySuppressed = !!options?.suppressOverlay;
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
    const center = this.getPlanetCenter();
    this.coreStart = { ...center };
    const surfacePoint = this.getSurfacePoint();
    const clearance = this.computeClearanceDistance();
    const burrowDepth = Math.max(5, Math.min(this.context.radius * 0.05, clearance * 0.15));
    const ascendHeight = Math.max(120, clearance);
    const exitDrift = Math.max(120, clearance * 0.6);
    const interiorRadius = Math.max(0, this.context.radius - burrowDepth);
    this.burrowTarget = {
      x: center.x + normal.x * interiorRadius,
      y: center.y + normal.y * interiorRadius,
      z: center.z + normal.z * interiorRadius
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

    if (this.phase === 'atmo-exit') {
      this.configureForAtmosphereExit(surfacePoint, normal, clearance);
    }

    this.installKeyBlockers();
    engine.notifyTakeoffSequenceStarted(this.context, this.phase);
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
      const pos = this.lerpVec(this.coreStart, this.burrowTarget, t);
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
    if (this.overlaySuppressed || this.overlayAlpha <= 0) {
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
      this.ensureShipClearOfPlanet(ship);
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
    try { engine.notifyTakeoffSequenceFinished(outcome as 'completed' | 'aborted', this.context, this.phase); } catch {}
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

  private computeClearanceDistance(): number {
    const baseRadius = Math.max(10, this.context?.radius ?? 0);
    return Math.max(250, baseRadius * 0.35);
  }

  private configureForAtmosphereExit(surfacePoint: Vector3, normal: Vector3, clearance: number): void {
    const boundaryAltitude = Math.max(this.phaseTwoStartAltitude, clearance);
    const startPoint = {
      x: surfacePoint.x + normal.x * boundaryAltitude,
      y: surfacePoint.y + normal.y * boundaryAltitude,
      z: surfacePoint.z + normal.z * boundaryAltitude
    };
    const ascentAltitude = boundaryAltitude + Math.max(300, clearance * 0.6);
    const exitDrift = Math.max(400, clearance);
    this.coreStart = { ...startPoint };
    this.burrowTarget = { ...startPoint };
    this.ascentTarget = {
      x: surfacePoint.x + normal.x * ascentAltitude,
      y: surfacePoint.y + normal.y * ascentAltitude,
      z: surfacePoint.z + normal.z * ascentAltitude
    };
    this.exitTarget = {
      x: this.ascentTarget.x + this.tangentDir.x * exitDrift,
      y: this.ascentTarget.y + this.tangentDir.y * exitDrift,
      z: this.ascentTarget.z + this.tangentDir.z * exitDrift
    };
  }

  private getSurfacePoint(): Vector3 {
    if (this.context?.surfacePoint) {
      return { ...this.context.surfacePoint };
    }
    const normal = this.normalize(this.context?.surfaceNormal ?? { x: 0, y: 1, z: 0 });
    return {
      x: normal.x * Math.max(1, this.context?.radius ?? 1),
      y: normal.y * Math.max(1, this.context?.radius ?? 1),
      z: normal.z * Math.max(1, this.context?.radius ?? 1)
    };
  }

  private ensureShipClearOfPlanet(ship: any): void {
    if (!this.context) {
      return;
    }
    const normal = this.normalize(this.context.surfaceNormal);
    const center = this.getPlanetCenter();
    const dx = ship.position.x - center.x;
    const dy = ship.position.y - center.y;
    const dz = ship.position.z - center.z;
    const distance = Math.hypot(dx, dy, dz);
    const clearance = this.computeClearanceDistance();
    const minDistance = this.context.radius + clearance;
    if (distance >= minDistance) {
      return;
    }
    const dir = distance > 1e-3 ? { x: dx / distance, y: dy / distance, z: dz / distance } : normal;
    ship.position.x = center.x + dir.x * minDistance;
    ship.position.y = center.y + dir.y * minDistance;
    ship.position.z = center.z + dir.z * minDistance;
    ship.updateModelMatrix();
    if (ship.boundingSphere?.center) {
      ship.boundingSphere.center.x = ship.position.x;
      ship.boundingSphere.center.y = ship.position.y;
      ship.boundingSphere.center.z = ship.position.z;
    }
  }

  private getPlanetCenter(): Vector3 {
    if (this.context?.planetCenter) {
      return { ...this.context.planetCenter };
    }
    const normal = this.normalize(this.context.surfaceNormal);
    return {
      x: this.context.surfacePoint.x - normal.x * this.context.radius,
      y: this.context.surfacePoint.y - normal.y * this.context.radius,
      z: this.context.surfacePoint.z - normal.z * this.context.radius
    };
  }
}
