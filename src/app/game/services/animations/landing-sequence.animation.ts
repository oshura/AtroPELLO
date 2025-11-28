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
  private readonly approachDuration = 2.4; // seconds to glide toward anchor point
  private readonly diveDuration = 0.8; // dip beneath the surface
  private readonly interiorDuration = 5.0; // surf along the inner shell
  private readonly fadeDuration = 1.0; // fade to black once aligned
  private readonly surfSpeed = 60;
  private readonly surfFlareDegrees = 16;

  private shipStart!: Vector3;
  private approachEnd!: Vector3;
  private glideEnd!: Vector3;
  private glideDir!: Vector3;
  private interiorStart!: Vector3;
  private planetCenter!: Vector3;
  private interiorRadius = 0;
  private interiorArcAngle = 0;
  private surfaceNormal!: Vector3;
  private finalForward!: Vector3;
  private finalNormal!: Vector3;
  private fadeGlideDistance = 0;

  private prevCameraMode: CameraMode | null = null;
  private inputBlockers: Array<() => void> = [];
  private overlayAlpha = 0;

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

    this.prevCameraMode = engine.camera?.getCurrentMode?.() ?? null;
    engine.camera?.setCameraMode?.(CameraMode.COCKPIT);

    this.shipStart = { ...ship.position };
    const normal = this.normalize(this.context.surfaceNormal);
    this.surfaceNormal = normal;
    const altitude = Math.max(6, Math.min(60, this.context.radius * 0.04));
    this.approachEnd = {
      x: this.context.surfacePoint.x + normal.x * altitude,
      y: this.context.surfacePoint.y + normal.y * altitude,
      z: this.context.surfacePoint.z + normal.z * altitude
    };

    this.glideDir = this.computeGlideDirection(ship.forwardDirection, normal);
    this.planetCenter = this.getPlanetCenter();
    const interiorDepth = clamp(this.context.radius * 0.015, 8, Math.max(10, this.context.radius - 5));
    this.interiorRadius = Math.max(1, this.context.radius - interiorDepth);
    this.interiorStart = {
      x: this.planetCenter.x + normal.x * this.interiorRadius,
      y: this.planetCenter.y + normal.y * this.interiorRadius,
      z: this.planetCenter.z + normal.z * this.interiorRadius
    };
    const desiredArcLength = this.surfSpeed * this.interiorDuration;
    const rawAngle = desiredArcLength / Math.max(1, this.interiorRadius);
    this.interiorArcAngle = clamp(rawAngle, Math.PI / 36, Math.PI / 2);
    const finalState = this.computeInteriorSurfState(1);
    this.glideEnd = finalState.position;
    this.finalForward = finalState.forward;
    this.finalNormal = finalState.normal;

    this.installKeyBlockers();
    this.fadeGlideDistance = 0;
    engine.notifyLandingSequenceStarted?.(this.context);
  }

  public update(engine: GameEngine, dt: number): boolean {
    const ship = engine.spaceship;
    if (!ship || !this.context) {
      return true;
    }

    this.elapsed += dt;
    const normal = this.normalize(this.context.surfaceNormal);

    const diveEndTime = this.approachDuration + this.diveDuration;
    const interiorEndTime = diveEndTime + this.interiorDuration;

    if (this.elapsed <= this.approachDuration) {
      const k = smoothstep(this.elapsed / Math.max(0.001, this.approachDuration));
      const pos = this.lerpVec(this.shipStart, this.approachEnd, k);
      this.overlayAlpha = 0;
      this.applyShipPose(ship, pos, normal, this.glideDir, 0);
      ship.thrusterState = ThrusterState.BRAKING;
      ship.currentSpeed = lerp(ship.currentSpeed, 0, clamp01(dt * 4));
      ship.targetSpeed = 0;
    } else if (this.elapsed <= diveEndTime) {
      const localT = (this.elapsed - this.approachDuration) / Math.max(0.001, this.diveDuration);
      const eased = smoothstep(localT);
      const pos = this.lerpVec(this.approachEnd, this.interiorStart, eased);
      this.overlayAlpha = 0;
      this.applyShipPose(ship, pos, normal, this.glideDir, this.surfFlareDegrees * 0.5 * eased);
      ship.thrusterState = ThrusterState.BRAKING;
      ship.targetSpeed = lerp(0, this.surfSpeed * 0.6, eased);
      ship.currentSpeed = ship.targetSpeed;
    } else if (this.elapsed <= interiorEndTime) {
      const localT = (this.elapsed - diveEndTime) / Math.max(0.001, this.interiorDuration);
      const surf = this.computeInteriorSurfState(localT);
      this.overlayAlpha = 0;
      this.applyShipPose(ship, surf.position, surf.normal, surf.forward, this.surfFlareDegrees);
      ship.thrusterState = ThrusterState.CRUISING;
      ship.targetSpeed = this.surfSpeed;
      ship.currentSpeed = this.surfSpeed;
    } else {
      const fadeT = (this.elapsed - interiorEndTime) / Math.max(0.001, this.fadeDuration);
      this.overlayAlpha = clamp01(fadeT);
      this.fadeGlideDistance += this.surfSpeed * 0.6 * dt;
      const glidePosition = {
        x: this.glideEnd.x + this.finalForward.x * this.fadeGlideDistance,
        y: this.glideEnd.y + this.finalForward.y * this.fadeGlideDistance,
        z: this.glideEnd.z + this.finalForward.z * this.fadeGlideDistance
      };
      this.applyShipPose(ship, glidePosition, this.finalNormal, this.finalForward, this.surfFlareDegrees);
      ship.thrusterState = ThrusterState.CRUISING;
      ship.currentSpeed = this.surfSpeed * 0.6;
      ship.targetSpeed = ship.currentSpeed;
    }

    if (this.elapsed >= interiorEndTime + this.fadeDuration) {
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

  private computeGlideDirection(forward: Vector3, normal: Vector3): Vector3 {
    const dot = forward.x * normal.x + forward.y * normal.y + forward.z * normal.z;
    let tangent = {
      x: forward.x - normal.x * dot,
      y: forward.y - normal.y * dot,
      z: forward.z - normal.z * dot
    };
    const len = Math.hypot(tangent.x, tangent.y, tangent.z);
    if (len < 1e-3) {
      // build arbitrary perpendicular vector
      const axis = Math.abs(normal.y) > 0.5 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      tangent = {
        x: normal.y * axis.z - normal.z * axis.y,
        y: normal.z * axis.x - normal.x * axis.z,
        z: normal.x * axis.y - normal.y * axis.x
      };
    }
    return this.normalize(tangent);
  }

  private computeInteriorSurfState(progress: number): { position: Vector3; forward: Vector3; normal: Vector3 } {
    const t = clamp01(progress);
    const eased = smoothstep(t);
    const angle = this.interiorArcAngle * eased;
    const cosT = Math.cos(angle);
    const sinT = Math.sin(angle);
    const r = this.interiorRadius;
    const n = this.surfaceNormal;
    const g = this.glideDir;
    const position = {
      x: this.planetCenter.x + n.x * r * cosT + g.x * r * sinT,
      y: this.planetCenter.y + n.y * r * cosT + g.y * r * sinT,
      z: this.planetCenter.z + n.z * r * cosT + g.z * r * sinT
    };
    const normal = this.normalize({
      x: position.x - this.planetCenter.x,
      y: position.y - this.planetCenter.y,
      z: position.z - this.planetCenter.z
    });
    const forward = this.normalize({
      x: -n.x * r * sinT + g.x * r * cosT,
      y: -n.y * r * sinT + g.y * r * cosT,
      z: -n.z * r * sinT + g.z * r * cosT
    });
    return { position, forward, normal };
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
