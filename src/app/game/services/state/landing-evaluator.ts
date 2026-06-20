import { Spaceship } from '../../game-objects/Spaceship';
import { Planet } from '../../game-objects/Planet';
import { Vector3 } from '../../../types/game.types';
import { ITargetable } from '../../types/targeting.types';
import { GameObjectAnimosity } from '../../types/animosity.types';
import { LandingApproachContext, LandingStatus, LandingThreatState } from '../../types/landing.types';
import { vec3Normalize } from '../../math/vector-math';

/**
 * Evalúa si la nave puede aterrizar (umbrales de distancia/velocidad/alineación + retención estable)
 * y la amenaza por enemigos cercanos. Antes vivía en GameEngine; la lógica es idéntica. El motor lee
 * el `LandingStatus`/`LandingThreatState` resultante (estado load-bearing) y conserva los helpers de
 * contexto (derive/resolve), que se exponen por el host. docs/ARQUITECTURA.md Fase 5.2.
 */
export interface LandingEvaluatorHost {
  getSpaceship(): Spaceship | null;
  getPlanets(): Planet[];
  isAtmosphereSceneActive(): boolean;
  getAtmosphereContext(): LandingApproachContext | null;
  getAtmosphereGroundRadius(): number;
  computeAltitudeAboveGround(): number;
  deriveLandingNormalFromContext(context: LandingApproachContext): Vector3;
  resolvePlanetCenterFromContext(context: LandingApproachContext): Vector3 | null;
  resolveLandingContactPoint(context: LandingApproachContext): Vector3;
  onThreatCheckFailed(error: unknown): void;
}

interface ThreatTargetLike {
  animosity?: GameObjectAnimosity;
  getDisplayName?: () => string;
  name?: string | number;
  id?: string | number;
}

const LANDING_DISTANCE_THRESHOLD = 50;
const LANDING_SPEED_THRESHOLD = 5;
const LANDING_ALIGNMENT_MAX_DOT = 0.5; // cos(60°) de tolerancia desde el paralelo perfecto
const LANDING_READY_HOLD_MS = 3000; // requiere 3s de estabilidad antes de habilitar el aterrizaje
const LANDING_THREAT_RADIUS = 500;

export class LandingEvaluator {
  private candidateStartMs: number | null = null;
  private candidatePlanetId: string | null = null;

  resetCandidate(): void {
    this.candidateStartMs = null;
    this.candidatePlanetId = null;
  }

  computeStatus(host: LandingEvaluatorHost): LandingStatus {
    const spaceship = host.getSpaceship();
    const planets = host.getPlanets();
    if (!spaceship || !planets.length) {
      this.candidateStartMs = null;
      this.candidatePlanetId = null;
      return { ready: false, context: null };
    }

    const now = performance.now();
    if (host.isAtmosphereSceneActive() && host.getAtmosphereContext()) {
      return this.computeAtmosphereStatus(now, host);
    }

    const shipPos = spaceship.position;
    let bestPlanet: Planet | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestRadius = 0;

    for (const planet of planets) {
      const radius = Math.max(1, planet.scale?.x ?? planet.scale?.y ?? planet.scale?.z ?? 0);
      const dx = planet.position.x - shipPos.x;
      const dy = planet.position.y - shipPos.y;
      const dz = planet.position.z - shipPos.z;
      const centerDist = Math.hypot(dx, dy, dz);
      const surface = centerDist - radius;
      if (surface < bestDistance) {
        bestPlanet = planet;
        bestDistance = surface;
        bestRadius = radius;
      }
    }

    if (!bestPlanet) {
      this.candidateStartMs = null;
      this.candidatePlanetId = null;
      return { ready: false, context: null };
    }

    const planet = bestPlanet;
    const dx = shipPos.x - planet.position.x;
    const dy = shipPos.y - planet.position.y;
    const dz = shipPos.z - planet.position.z;
    const centerDist = Math.hypot(dx, dy, dz);
    const surfaceDistance = centerDist - bestRadius;
    const normal = centerDist > 0 ? vec3Normalize({ x: dx, y: dy, z: dz }) : { x: 0, y: 1, z: 0 };
    const surfacePoint = {
      x: planet.position.x + normal.x * bestRadius,
      y: planet.position.y + normal.y * bestRadius,
      z: planet.position.z + normal.z * bestRadius
    };
    const forward = vec3Normalize({ ...spaceship.forwardDirection });
    const alignmentDot = forward.x * normal.x + forward.y * normal.y + forward.z * normal.z;
    const relativeSpeed = Math.abs(spaceship.currentSpeed);

    const meetsDistance = surfaceDistance <= LANDING_DISTANCE_THRESHOLD;
    const meetsSpeed = relativeSpeed <= LANDING_SPEED_THRESHOLD;
    const meetsAlignment = Math.abs(alignmentDot) <= LANDING_ALIGNMENT_MAX_DOT;
    const meetsAll = meetsDistance && meetsSpeed && meetsAlignment;

    if (!meetsAll) {
      this.candidateStartMs = null;
      this.candidatePlanetId = null;
    } else {
      if (this.candidatePlanetId !== planet.id) {
        this.candidatePlanetId = planet.id;
        this.candidateStartMs = now;
      } else if (this.candidateStartMs == null) {
        this.candidateStartMs = now;
      }
    }

    const ready = Boolean(
      meetsAll &&
      this.candidateStartMs !== null &&
      now - this.candidateStartMs >= LANDING_READY_HOLD_MS
    );

    const context: LandingStatus['context'] = {
      planetId: planet.id,
      planetName: planet.getDisplayName(),
      planetType: planet.planetType,
      radius: bestRadius,
      distanceToSurface: surfaceDistance,
      relativeSpeed,
      alignmentDot,
      surfaceNormal: normal,
      surfacePoint,
      planetCenter: { x: planet.position.x, y: planet.position.y, z: planet.position.z },
      lastUpdatedMs: now
    };

    return { ready, context };
  }

  private computeAtmosphereStatus(now: number, host: LandingEvaluatorHost): LandingStatus {
    const spaceship = host.getSpaceship();
    const context = host.getAtmosphereContext();
    if (!spaceship || !context) {
      return { ready: false, context: null };
    }
    const altitude = host.computeAltitudeAboveGround();
    const relativeSpeed = Math.abs(spaceship.currentSpeed);
    const meetsDistance = altitude <= LANDING_DISTANCE_THRESHOLD;
    const meetsSpeed = relativeSpeed <= LANDING_SPEED_THRESHOLD;
    const storedNormal = vec3Normalize(context.surfaceNormal ?? host.deriveLandingNormalFromContext(context));
    const forward = vec3Normalize({ ...spaceship.forwardDirection });
    const planetCenter = context.planetCenter ?? host.resolvePlanetCenterFromContext(context);
    const radius = Number.isFinite(context.radius) ? context.radius : 0;
    const groundRadius = Math.max(0, host.getAtmosphereGroundRadius() ?? 0);
    const targetRadius = groundRadius > 0 ? groundRadius : radius;
    const shipPos = spaceship.position;
    let landingNormal = storedNormal;
    let surfacePoint = context.surfacePoint ? { ...context.surfacePoint } : host.resolveLandingContactPoint(context);
    if (planetCenter) {
      const toShip = {
        x: shipPos.x - planetCenter.x,
        y: shipPos.y - planetCenter.y,
        z: shipPos.z - planetCenter.z,
      };
      const distance = Math.hypot(toShip.x, toShip.y, toShip.z);
      if (distance > 1e-4) {
        landingNormal = {
          x: toShip.x / distance,
          y: toShip.y / distance,
          z: toShip.z / distance,
        };
        if (targetRadius > 0) {
          surfacePoint = {
            x: planetCenter.x + landingNormal.x * targetRadius,
            y: planetCenter.y + landingNormal.y * targetRadius,
            z: planetCenter.z + landingNormal.z * targetRadius,
          };
        } else {
          surfacePoint = { x: shipPos.x, y: shipPos.y, z: shipPos.z };
        }
      }
    }
    const alignmentDot = forward.x * landingNormal.x + forward.y * landingNormal.y + forward.z * landingNormal.z;
    const meetsAlignment = Math.abs(alignmentDot) <= LANDING_ALIGNMENT_MAX_DOT;
    const meetsAll = meetsDistance && meetsSpeed && meetsAlignment;

    if (!meetsAll) {
      this.candidateStartMs = null;
      this.candidatePlanetId = null;
    } else {
      if (this.candidatePlanetId !== context.planetId) {
        this.candidatePlanetId = context.planetId;
        this.candidateStartMs = now;
      } else if (this.candidateStartMs == null) {
        this.candidateStartMs = now;
      }
    }

    const ready = Boolean(
      meetsAll &&
      this.candidateStartMs !== null &&
      now - this.candidateStartMs >= LANDING_READY_HOLD_MS
    );

    const statusContext: LandingStatus['context'] = {
      ...context,
      radius: targetRadius > 0 ? targetRadius : radius,
      surfacePoint,
      surfaceNormal: { ...landingNormal },
      planetCenter: planetCenter ? { ...planetCenter } : surfacePoint,
      distanceToSurface: altitude,
      relativeSpeed,
      alignmentDot,
      lastUpdatedMs: now,
    };

    return { ready, context: statusContext };
  }

  computeThreat(availableTargets: ITargetable[], host: LandingEvaluatorHost): LandingThreatState {
    const spaceship = host.getSpaceship();
    if (!spaceship) {
      return { active: false, reasons: [] };
    }

    try {
      const shipPos = spaceship.position;
      let nearestThreat: { label: string; distance: number } | null = null;

      for (const target of availableTargets) {
        if (!target || !target.position) {
          continue;
        }
        const animosity = (target as ThreatTargetLike).animosity;
        if (animosity !== GameObjectAnimosity.ENEMY) {
          continue;
        }
        const dx = target.position.x - shipPos.x;
        const dy = target.position.y - shipPos.y;
        const dz = target.position.z - shipPos.z;
        const distance = Math.hypot(dx, dy, dz);
        if (distance > LANDING_THREAT_RADIUS) {
          continue;
        }
        if (!nearestThreat || distance < nearestThreat.distance) {
          nearestThreat = {
            label: this.resolveThreatLabel(target),
            distance
          };
        }
      }

      if (!nearestThreat) {
        return { active: false, reasons: [] };
      }

      const roundedDistance = Math.max(1, Math.round(nearestThreat.distance));
      return {
        active: true,
        reasons: [`${nearestThreat.label} a ${roundedDistance}u`]
      };
    } catch (e) {
      host.onThreatCheckFailed(e);
      return { active: false, reasons: [] };
    }
  }

  private resolveThreatLabel(target: ITargetable): string {
    try {
      const like = target as ThreatTargetLike;
      const displayNameFn = like.getDisplayName;
      if (typeof displayNameFn === 'function') {
        const value = displayNameFn.call(target);
        if (value) {
          return String(value);
        }
      }
      const explicitName = like.name ?? like.id;
      if (explicitName) {
        return String(explicitName);
      }
    } catch {}
    return 'Hostil detectado';
  }
}
