import { Vector3 } from '../../../types/game.types';
import { StellarSeedBeing } from '../../game-objects/lesser-beings/stellar-seed-being';
import { TransluminalShoggothBeing } from '../../game-objects/lesser-beings/transluminal-shoggoth-being';
import { RiftVampireBeing } from '../../game-objects/lesser-beings/rift-vampire-being';
import { LesserBeingBase } from '../../game-objects/lesser-beings/lesser-being-base';
import { GameEngine } from '../../GameEngine';
import { Planet } from '../../game-objects/Planet';
import { LesserBeing } from '../../types/cosmic-life.types';

type KnownBeing = StellarSeedBeing | TransluminalShoggothBeing | RiftVampireBeing;

enum LesserBeingState {
  IDLE = 'IDLE',
  SEEKING_PLANET = 'SEEKING_PLANET',
  ORBITING_PLANET = 'ORBITING_PLANET',
  ENGAGING_SHIP = 'ENGAGING_SHIP',
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
  private planetReservations: Map<string, string> = new Map();

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
    const context = this.contexts.get(beingId);
    if (context) {
      this.releasePlanetReservation(context);
    }
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
      case LesserBeingState.LANDING:
        this.updateLanding(context, deltaTime);
        break;
      case LesserBeingState.DESPAWNING:
        this.cleanupContext(context);
        break;
    }
  }

  private acquireInitialState(context: BeingContext): void {
    this.releasePlanetReservation(context);
    const shipTarget = this.makeShipTarget();
    if (shipTarget && this.isShipPriorityTarget(context, shipTarget.position)) {
      this.lockOnShip(context, shipTarget, true);
      return;
    }

    const planetTarget = this.findPlanetTarget(context);
    if (planetTarget) {
      context.target = planetTarget;
      context.state = LesserBeingState.SEEKING_PLANET;
      return;
    }

    if (shipTarget && !this.shouldIgnoreShip(context)) {
      this.lockOnShip(context, shipTarget, true);
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

    const shipTarget = this.makeShipTarget();
    if (shipTarget && this.isShipPriorityTarget(context, shipTarget.position)) {
      this.lockOnShip(context, shipTarget, true);
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
    if (shipTarget && this.isShipPriorityTarget(context, shipTarget.position)) {
      this.lockOnShip(context, shipTarget, true);
    }
  }

  private updateEngaging(context: BeingContext, deltaTime: number): void {
    const { being } = context;
    const shipTarget = this.makeShipTarget();
    if (!shipTarget) {
      this.acquireInitialState(context);
      return;
    }

    this.lockOnShip(context, shipTarget);
    const distance = this.distanceTo(being, shipTarget.position);
    const desiredRange = this.computeDesiredRange(context);
    const minRange = desiredRange[0] ?? 0;
    const maxRange = desiredRange[1] ?? Math.max(minRange + 100, 300);
    const directionToShip = this.directionTo(being, shipTarget.position);
    const wantsStandOff = being.attackProfile.kind === 'projectile';

    if (distance > maxRange) {
      being.steerTowards(directionToShip, deltaTime);
      being.adjustSpeed(Math.min(being.stats.maxSpeed, being.stats.maxSpeed), deltaTime);
    } else if (distance < minRange && wantsStandOff) {
      const away = this.directionFrom(being, shipTarget.position);
      being.steerTowards(away, deltaTime);
      being.adjustSpeed(Math.min(being.stats.maxSpeed, being.stats.maxSpeed * 0.9), deltaTime);
    } else {
      being.steerTowards(directionToShip, deltaTime);
      if (distance < minRange) {
        being.adjustSpeed(Math.max(0, being.stats.maxSpeed * 0.5), deltaTime);
      } else {
        being.adjustSpeed(being.stats.maxSpeed * 0.6, deltaTime);
      }
    }

    this.tryAttack(context, directionToShip, distance);
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
    this.releasePlanetReservation(context);
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
    const planet = this.pickAvailablePlanet(context);
    if (!planet) {
      return null;
    }
    this.planetReservations.set(planet.id, context.being.id);
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
    this.releasePlanetReservation(context);
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

  private isShipPriorityTarget(context: BeingContext, shipPos: Vector3): boolean {
    if (this.shouldIgnoreShip(context)) {
      return false;
    }
    const distance = this.distanceTo(context.being, shipPos);
    return distance <= this.getShipAggroDistance(context);
  }

  private getShipAggroDistance(context: BeingContext): number {
    const preferredMax = context.being.behaviorProfile.preferredEngagementRange?.[1];
    const base = preferredMax ? preferredMax * 1.5 : 600;
    return Math.max(150, base);
  }

  private pickAvailablePlanet(context: BeingContext): Planet | null {
    const planets = this.engine.gameState?.planets ?? [];
    let best: Planet | null = null;
    let bestDistance = Infinity;
    for (const candidate of planets) {
      if (!(candidate instanceof Planet)) {
        continue;
      }
      if (this.isPlanetOccupied(candidate)) {
        continue;
      }
      const reservedBy = this.planetReservations.get(candidate.id);
      if (reservedBy && reservedBy !== context.being.id) {
        continue;
      }
      const dist = this.distanceTo(context.being, candidate.position);
      if (dist < bestDistance) {
        bestDistance = dist;
        best = candidate;
      }
    }
    return best;
  }

  private isPlanetOccupied(planet: Planet): boolean {
    const occupant = (planet as any).lesserBeing as LesserBeing | null | undefined;
    return !!occupant && occupant !== LesserBeing.NONE;
  }

  private releasePlanetReservation(context: BeingContext): void {
    if (!context || !context.being) {
      return;
    }
    if (context.target?.kind === 'planet') {
      const owner = this.planetReservations.get(context.target.planetId);
      if (owner === context.being.id) {
        this.planetReservations.delete(context.target.planetId);
      }
    } else {
      for (const [planetId, owner] of this.planetReservations.entries()) {
        if (owner === context.being.id) {
          this.planetReservations.delete(planetId);
        }
      }
    }
  }

  private lockOnShip(context: BeingContext, shipTarget: TargetDescriptor, immediateAttack = false): void {
    this.releasePlanetReservation(context);
    context.state = LesserBeingState.ENGAGING_SHIP;
    context.target = shipTarget;
    if (immediateAttack) {
      const readyValue = context.being.attackProfile.cooldownMs ?? 0;
      if (context.timeSinceLastAttack < readyValue) {
        context.timeSinceLastAttack = readyValue;
      }
    }
  }

  private distanceTo(being: LesserBeingBase, target: Vector3): number {
    return Math.hypot(
      target.x - being.position.x,
      target.y - being.position.y,
      target.z - being.position.z
    );
  }
}
