import { Vector3 } from '../../../types/game.types';
import { StellarSeedBeing } from '../../game-objects/lesser-beings/stellar-seed-being';
import { TransluminalShoggothBeing } from '../../game-objects/lesser-beings/transluminal-shoggoth-being';
import { RiftVampireBeing } from '../../game-objects/lesser-beings/rift-vampire-being';
import { LesserBeingBase } from '../../game-objects/lesser-beings/lesser-being-base';
import { GameEngine } from '../../GameEngine';
import { Planet } from '../../game-objects/Planet';

type KnownBeing = StellarSeedBeing | TransluminalShoggothBeing | RiftVampireBeing;

enum LesserBeingState {
  IDLE = 'IDLE',
  SEEKING_PLANET = 'SEEKING_PLANET',
  ORBITING_PLANET = 'ORBITING_PLANET',
  ENGAGING_SHIP = 'ENGAGING_SHIP',
  FLEEING = 'FLEEING',
  LANDING = 'LANDING',
  DESPAWNING = 'DESPAWNING'
}

type TargetDescriptor =
  | { kind: 'planet'; planetId: string; position: Vector3; radius: number }
  | { kind: 'ship'; position: Vector3 }
  | { kind: 'orbit'; position: Vector3; radius: number };

interface BeingContext {
  being: KnownBeing;
  state: LesserBeingState;
  target: TargetDescriptor | null;
  timeSinceLastAttack: number;
}

export class LesserBeingController {
  private contexts: Map<string, BeingContext> = new Map();

  constructor(private readonly engine: GameEngine) {}

  public registerBeing(being: KnownBeing): void {
    if (this.contexts.has(being.id)) {
      return;
    }
    this.contexts.set(being.id, {
      being,
      state: LesserBeingState.IDLE,
      target: null,
      timeSinceLastAttack: 0
    });
  }

  public unregisterBeing(beingId: string): void {
    this.contexts.delete(beingId);
  }

  public update(deltaTime: number): void {
    for (const context of this.contexts.values()) {
      this.advanceContext(context, deltaTime);
    }
  }

  private advanceContext(context: BeingContext, deltaTime: number): void {
    const { being } = context;
    if (!being.active) {
      context.state = LesserBeingState.DESPAWNING;
      return;
    }

    context.timeSinceLastAttack += deltaTime * 1000;

    switch (context.state) {
      case LesserBeingState.IDLE:
        this.acquireInitialState(context);
        break;
      case LesserBeingState.SEEKING_PLANET:
        this.updateSeekingPlanet(context, deltaTime);
        break;
      case LesserBeingState.ORBITING_PLANET:
        this.updateOrbiting(context, deltaTime);
        break;
      case LesserBeingState.ENGAGING_SHIP:
        this.updateEngaging(context, deltaTime);
        break;
      case LesserBeingState.FLEEING:
        this.updateFleeing(context, deltaTime);
        break;
      case LesserBeingState.LANDING:
        this.updateLanding(context, deltaTime);
        break;
      case LesserBeingState.DESPAWNING:
        this.cleanupContext(context);
        break;
    }
  }

  private acquireInitialState(context: BeingContext): void {
    const target = this.findPlanetTarget(context);
    if (target) {
      context.target = target;
      context.state = LesserBeingState.SEEKING_PLANET;
    } else if (!this.shouldIgnoreShip(context)) {
      context.target = this.makeShipTarget();
      context.state = LesserBeingState.ENGAGING_SHIP;
    } else {
      context.state = LesserBeingState.ORBITING_PLANET;
      context.target = this.makeOrbitTarget(context);
    }
  }

  private updateSeekingPlanet(context: BeingContext, deltaTime: number): void {
    const { being, target } = context;
    if (!target || target.kind !== 'planet') {
      this.acquireInitialState(context);
      return;
    }

    const direction = this.directionTo(being, target.position);
    being.steerTowards(direction, deltaTime);
    being.adjustSpeed(being.stats.maxSpeed * 0.85, deltaTime);

    const distance = this.distanceTo(being, target.position);
      const landingRadius = target.radius + (being.boundingSphere?.radius ?? 2);
      if (distance < landingRadius) {
      context.state = LesserBeingState.LANDING;
    }
  }

  private updateOrbiting(context: BeingContext, deltaTime: number): void {
    const { being } = context;
    const orbitTarget = context.target ?? this.makeOrbitTarget(context);
    context.target = orbitTarget;

    if (!orbitTarget || orbitTarget.kind !== 'orbit') {
      this.acquireInitialState(context);
      return;
    }

    const tangential = this.tangentialDirection(being.position, orbitTarget.position);
    being.steerTowards(tangential, deltaTime);
    being.adjustSpeed(Math.min(being.stats.maxSpeed * 0.5, 30), deltaTime);

    const shipTarget = this.makeShipTarget();
    if (shipTarget && this.shouldEngageShip(context, shipTarget.position)) {
      context.state = LesserBeingState.ENGAGING_SHIP;
      context.target = shipTarget;
    }
  }

  private updateEngaging(context: BeingContext, deltaTime: number): void {
    const { being } = context;
    const shipTarget = this.makeShipTarget();
    if (!shipTarget) {
      this.acquireInitialState(context);
      return;
    }
    context.target = shipTarget;

    const direction = this.directionTo(being, shipTarget.position);
    being.steerTowards(direction, deltaTime);

    const desiredRange = this.computeDesiredRange(context);
    const distance = this.distanceTo(being, shipTarget.position);

    if (distance > desiredRange[1]) {
      being.adjustSpeed(Math.min(being.stats.maxSpeed, being.stats.maxSpeed * 0.9), deltaTime);
    } else if (distance < desiredRange[0]) {
      being.adjustSpeed(Math.max(0, being.stats.maxSpeed * 0.4), deltaTime);
    } else {
      being.adjustSpeed(being.stats.maxSpeed * 0.6, deltaTime);
    }

    if (this.shouldFlee(context, distance)) {
      context.state = LesserBeingState.FLEEING;
      return;
    }

    this.tryAttack(context, direction, distance);
  }

  private updateFleeing(context: BeingContext, deltaTime: number): void {
    const { being } = context;
    const shipTarget = this.makeShipTarget();
    if (!shipTarget) {
      this.acquireInitialState(context);
      return;
    }

    const awayDirection = this.directionFrom(being, shipTarget.position);
    being.steerTowards(awayDirection, deltaTime);
    being.adjustSpeed(being.stats.maxSpeed, deltaTime);

    const distance = this.distanceTo(being, shipTarget.position);
      const [, disengageRange] = this.computeDesiredRange(context);
      if (distance > Math.max(disengageRange, 500)) {
      context.state = LesserBeingState.ORBITING_PLANET;
      context.target = this.makeOrbitTarget(context);
    }
  }

  private updateLanding(context: BeingContext, deltaTime: number): void {
    const { being, target } = context;
    if (!target || target.kind !== 'planet') {
      this.acquireInitialState(context);
      return;
    }

    const planet = this.getPlanetById(target.planetId);
    if (!planet) {
      this.acquireInitialState(context);
      return;
    }

    const direction = this.directionTo(being, target.position);
    being.steerTowards(direction, deltaTime);
    being.adjustSpeed(Math.max(0, being.currentSpeed - being.stats.deceleration * deltaTime), deltaTime);

    const distance = this.distanceTo(being, target.position);
    const landingRadius = target.radius + (being.boundingSphere?.radius ?? 2);
    if (distance <= landingRadius) {
      this.completeLanding(context, planet);
    }
  }

  private cleanupContext(context: BeingContext): void {
    this.contexts.delete(context.being.id);
  }

  private makeShipTarget(): TargetDescriptor | null {
    const ship = this.engine.getPlayerShip?.();
    if (!ship) {
      return null;
    }
    return { kind: 'ship', position: { ...ship.position } };
  }

  private makeOrbitTarget(context: BeingContext): TargetDescriptor | null {
    const anchor: Vector3 = { x: 0, y: 0, z: 0 };
    const radius = context.being.behaviorProfile.orbitDistance ?? 50;
    return { kind: 'orbit', position: anchor, radius };
  }

  private findPlanetTarget(context: BeingContext): TargetDescriptor | null {
    const planet = this.engine.findNearestFreePlanet?.(context.being.position);
    if (!planet) {
      return null;
    }
    return {
      kind: 'planet',
      planetId: planet.id,
      position: { ...planet.position },
      radius: planet.boundingSphere?.radius ?? 20
    };
  }

  private shouldIgnoreShip(context: BeingContext): boolean {
    return context.being.behaviorProfile.ignoresShipWhilePlanetHunting ?? false;
  }

  private shouldEngageShip(context: BeingContext, shipPos: Vector3): boolean {
    if (this.shouldIgnoreShip(context)) {
      return false;
    }
    const distance = this.distanceTo(context.being, shipPos);
    const [, maxRange] = this.computeDesiredRange(context);
    return distance <= maxRange;
  }

  private shouldFlee(context: BeingContext, distance: number): boolean {
    const fleeDistance = context.being.behaviorProfile.fleeDistance;
    return typeof fleeDistance === 'number' && distance < fleeDistance;
  }

  private computeDesiredRange(context: BeingContext): [number, number] {
    return context.being.behaviorProfile.preferredEngagementRange ?? [30, 150];
  }

  private tryAttack(context: BeingContext, direction: Vector3, distance: number): void {
    const { being } = context;
    const attack = being.attackProfile;
    if (context.timeSinceLastAttack < attack.cooldownMs) {
      return;
    }
    if (attack.maxRange && distance > attack.maxRange) {
      return;
    }

    const combat = this.engine.getLesserBeingCombat?.();
    if (!combat) {
      return;
    }

    const executed = (() => {
      switch (attack.kind) {
        case 'projectile':
          if (!(being instanceof StellarSeedBeing)) {
            return false;
          }
          if (!this.isWithinAttackCone(
            being.forwardDirection,
            direction,
            (attack.metadata?.['coneDegrees'] as number | undefined) ?? 15
          )) {
            return false;
          }
          combat.fireAcidSpit(being, direction);
          return true;
        case 'radial-burst':
          if (!(being instanceof TransluminalShoggothBeing)) {
            return false;
          }
          combat.spawnOrbBurst(being);
          return true;
        case 'aura':
          if (!(being instanceof RiftVampireBeing)) {
            return false;
          }
          combat.triggerAuraPulse(being);
          return true;
        default:
          return false;
      }
    })();

    if (executed) {
      context.timeSinceLastAttack = 0;
    }
  }

  private isWithinAttackCone(forward: Vector3, targetDirection: Vector3, coneDegrees: number): boolean {
    if (!coneDegrees || coneDegrees <= 0) {
      return true;
    }
    const dot = forward.x * targetDirection.x + forward.y * targetDirection.y + forward.z * targetDirection.z;
    const clampDot = Math.max(-1, Math.min(1, dot));
    const angle = Math.acos(clampDot);
    const halfCone = (coneDegrees * Math.PI) / 180;
    return angle <= halfCone;
  }

  private getPlanetById(planetId: string): Planet | null {
    if (!planetId) {
      return null;
    }
    const planets = this.engine.gameState?.planets ?? [];
    for (const planet of planets) {
      if (planet.id === planetId) {
        return planet;
      }
    }
    return null;
  }

  private completeLanding(context: BeingContext, planet: Planet): void {
    const { being } = context;
    planet.setLesserBeing(being.beingType);
    planet.creatureScanned = false;
    being.hasLanded = true;
    being.landedPlanetId = planet.id;
    being.active = false;
    being.visible = false;
    context.state = LesserBeingState.DESPAWNING;
    this.engine.unregisterLesserBeing(being.id);
  }

  private tangentialDirection(position: Vector3, center: Vector3): Vector3 {
    const radial = {
      x: position.x - center.x,
      y: position.y - center.y,
      z: position.z - center.z
    };
    const tangent = { x: -radial.z, y: 0, z: radial.x };
    const norm = Math.hypot(tangent.x, tangent.y, tangent.z) || 1;
    tangent.x /= norm;
    tangent.y /= norm;
    tangent.z /= norm;
    return tangent;
  }

  private directionTo(being: LesserBeingBase, target: Vector3): Vector3 {
    const dir = {
      x: target.x - being.position.x,
      y: target.y - being.position.y,
      z: target.z - being.position.z
    };
    const norm = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= norm;
    dir.y /= norm;
    dir.z /= norm;
    return dir;
  }

  private directionFrom(being: LesserBeingBase, target: Vector3): Vector3 {
    const dir = {
      x: being.position.x - target.x,
      y: being.position.y - target.y,
      z: being.position.z - target.z
    };
    const norm = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= norm;
    dir.y /= norm;
    dir.z /= norm;
    return dir;
  }

  private distanceTo(being: LesserBeingBase, target: Vector3): number {
    return Math.hypot(
      target.x - being.position.x,
      target.y - being.position.y,
      target.z - being.position.z
    );
  }
}
