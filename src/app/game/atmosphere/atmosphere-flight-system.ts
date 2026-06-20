import { Vector3 } from '../../types/game.types';
import { Spaceship, PlanetType } from '../game-objects';
import { Camera } from '../Camera';
import { clamp, lerpScalar, vec3Normalize } from '../math/vector-math';
import {
  atmosphereForceAltitudeFactor,
  atmosphereAutoVectorSpeedFactor,
  atmosphereGravityScaleForPlanet,
  atmosphereGravitySpeedFactor,
  ATMOSPHERE_TURBULENCE_SHAKE_THRESHOLD,
  ATMOSPHERE_AUTO_VECTOR_BAND_MIN,
} from './atmosphere-physics';
import { AtmosphereWeatherEffectsState } from './atmosphere-weather-effects-system';

/** Telemetría del auto-vector (sustentación asistida) que el HUD de depuración lee del motor. */
export interface AtmosphereAutoVectorSample {
  altitude: number;
  targetLift: number;
  liftFactor: number;
  autoVectorCurrent: number;
  liftVelocity: number;
}

/** Telemetría de la gravedad atmosférica que el HUD de depuración lee del motor. */
export interface AtmosphereGravitySample {
  altitude: number;
  gravityPerSecond: number;
  finalGravity: number;
  speedFactor: number;
}

/** Geometría del domo atmosférico que la gravedad necesita del motor (null si no hay escena/contexto). */
export interface AtmosphereGravityContext {
  center: Vector3;
  groundRadius: number;
  skyRadius: number;
  planetType?: PlanetType;
}

/**
 * Fuerzas del vuelo atmosférico (docs/ARQUITECTURA.md Fase 5.1): sustentación asistida (auto-vector),
 * deriva por viento, drag/aceleración y la deriva progresiva por turbulencia. Mutan la nave; la lógica
 * es idéntica a la que tenía GameEngine. Las sacudidas de cámara/nave (FX) viven en AtmosphereShakeSystem.
 *
 * El motor implementa `AtmosphereFlightHost` (vía un adaptador cacheado) y se lo pasa en cada llamada;
 * ningún estado privado del motor se filtra al sistema. El host lo comparten ambos sistemas atmosféricos.
 */
export interface AtmosphereFlightHost {
  getSpaceship(): Spaceship | null;
  getCamera(): Camera | null;
  getWeatherEffects(): AtmosphereWeatherEffectsState;
  isAtmosphereSceneActive(): boolean;
  isAtmosphereLandingCinematicShieldActive(): boolean;
  isLandingCinematicCameraHoldActive(): boolean;
  getAtmosphereStabilityForceScale(): number;
  computeAltitudeAboveGround(): number;
  computeAtmosphereUpVector(): Vector3 | null;
  getNowMs(): number;
  isAtmosphereStabilityActive(): boolean;
  isAtmosphereSceneStateActive(): boolean;
  getAtmosphereGroundContactActive(): boolean;
  getAtmosphereGravityContext(): AtmosphereGravityContext | null;
  isAtmosphereGravityLandingHold(): boolean;
}

// Constantes de las fuerzas atmosféricas (gravedad asistida, deriva, drag, sacudida progresiva).
const ATMOSPHERE_DRIFT_FORCE_MULT = 16;
const ATMOSPHERE_TURBULENCE_FORCE = 5.25;
const ATMOSPHERE_AUTO_VECTOR_ASCENT = 1.2;
const ATMOSPHERE_AUTO_VECTOR_BAND_MAX = 60;
const ATMOSPHERE_AUTO_VECTOR_CONTACT_SUPPRESS_MS = 450;
const ATMOSPHERE_DRIFT_TURBULENCE_BONUS = 1.1;
const ATMOSPHERE_PROGRESSIVE_DRIFT_THRESHOLD = 0.45;
const ATMOSPHERE_PROGRESSIVE_DRIFT_FORCE = 22;
const ATMOSPHERE_PROGRESSIVE_DRIFT_WEIGHT_GAIN = 1.3;
const ATMOSPHERE_PROGRESSIVE_DRIFT_WEIGHT_DECAY = 2.4;
const ATMOSPHERE_BASE_DRAG_PER_SEC = 0.28;
const ATMOSPHERE_TURBULENCE_DRAG_BONUS = 0.85;
const ATMOSPHERE_TURBULENCE_ACCEL_PENALTY = 0.35;

export class AtmosphereFlightSystem {
  // Estado de las fuerzas. Los campos públicos los lee el motor para el HUD/telemetría.
  autoVectorCurrent = 0;
  autoVectorTelemetry: AtmosphereAutoVectorSample | null = null;
  gravityTelemetry: AtmosphereGravitySample | null = null;
  driftForceApplied: Vector3 = { x: 0, y: 0, z: 0 };
  // El motor (colisión/impacto) también extiende esta supresión; por eso es pública.
  autoVectorSuppressedUntilMs = 0;
  private turbulencePhase = 0;
  private progressiveDriftWeight = 0;
  private progressiveDriftBias: Vector3 = { x: 0, y: 0, z: 0 };

  private forceAltitudeFactor(host: AtmosphereFlightHost, altitude?: number): number {
    return atmosphereForceAltitudeFactor(altitude ?? host.computeAltitudeAboveGround());
  }

  applyAutoVector(deltaTime: number, host: AtmosphereFlightHost): void {
    const spaceship = host.getSpaceship();
    if (!spaceship) {
      return;
    }
    this.autoVectorTelemetry = null;
    if (host.isAtmosphereLandingCinematicShieldActive()) {
      this.autoVectorCurrent = 0;
      return;
    }
    if (host.isAtmosphereStabilityActive()) {
      this.autoVectorCurrent = 0;
      return;
    }
    const up = host.computeAtmosphereUpVector();
    const altitude = Math.max(0, host.computeAltitudeAboveGround());
    const speed = Math.abs(spaceship.currentSpeed ?? 0);
    const smoothing = 1 - Math.exp(-deltaTime * 6);
    const now = host.getNowMs();
    if (host.getAtmosphereGroundContactActive() && ATMOSPHERE_AUTO_VECTOR_CONTACT_SUPPRESS_MS > 0) {
      const target = now + ATMOSPHERE_AUTO_VECTOR_CONTACT_SUPPRESS_MS;
      if (target > this.autoVectorSuppressedUntilMs) {
        this.autoVectorSuppressedUntilMs = target;
      }
    }
    const autoVectorSuppressed = host.getAtmosphereGroundContactActive() || now < this.autoVectorSuppressedUntilMs;
    if (autoVectorSuppressed) {
      this.autoVectorCurrent = lerpScalar(this.autoVectorCurrent, 0, smoothing);
      this.autoVectorTelemetry = {
        altitude,
        targetLift: 0,
        liftFactor: 0,
        autoVectorCurrent: this.autoVectorCurrent,
        liftVelocity: 0,
      };
      return;
    }
    let targetLift = 0;
    if (up && host.isAtmosphereSceneActive() && altitude <= ATMOSPHERE_AUTO_VECTOR_BAND_MAX + 40) {
      if (altitude >= ATMOSPHERE_AUTO_VECTOR_BAND_MIN && altitude <= ATMOSPHERE_AUTO_VECTOR_BAND_MAX) {
        targetLift = ATMOSPHERE_AUTO_VECTOR_ASCENT;
      } else if (altitude < ATMOSPHERE_AUTO_VECTOR_BAND_MIN) {
        const t = altitude / Math.max(1, ATMOSPHERE_AUTO_VECTOR_BAND_MIN);
        targetLift = ATMOSPHERE_AUTO_VECTOR_ASCENT * Math.max(0.2, t * 0.85);
      } else {
        const overshoot = Math.max(0, altitude - ATMOSPHERE_AUTO_VECTOR_BAND_MAX);
        const range = Math.max(1, 40);
        const falloff = Math.max(0, 1 - overshoot / range);
        targetLift = ATMOSPHERE_AUTO_VECTOR_ASCENT * falloff * 0.95;
      }
    }
    const liftSpeedFactor = atmosphereAutoVectorSpeedFactor(speed);
    const targetLiftWithSpeed = targetLift * liftSpeedFactor;
    this.autoVectorCurrent = lerpScalar(this.autoVectorCurrent, targetLiftWithSpeed, smoothing);
    const liftVelocity = this.autoVectorCurrent * deltaTime;
    this.autoVectorTelemetry = {
      altitude,
      targetLift,
      liftFactor: liftSpeedFactor,
      autoVectorCurrent: this.autoVectorCurrent,
      liftVelocity,
    };
    if (!up || this.autoVectorCurrent <= 1e-3) {
      return;
    }
    spaceship.externalForces.x += up.x * liftVelocity;
    spaceship.externalForces.y += up.y * liftVelocity;
    spaceship.externalForces.z += up.z * liftVelocity;
  }

  applyWeatherForces(deltaTime: number, host: AtmosphereFlightHost): void {
    const spaceship = host.getSpaceship();
    if (!spaceship || !host.isAtmosphereSceneActive()) {
      this.driftForceApplied = { x: 0, y: 0, z: 0 };
      return;
    }
    if (host.isAtmosphereLandingCinematicShieldActive()) {
      this.driftForceApplied = { x: 0, y: 0, z: 0 };
      this.resetProgressiveDriftState();
      return;
    }
    const state = host.getWeatherEffects();
    const altitude = Math.max(0, host.computeAltitudeAboveGround());
    const altitudeFactor = this.forceAltitudeFactor(host, altitude);
    const turbulenceBoost = 1 + Math.max(0, state.turbulenceCurrent - ATMOSPHERE_TURBULENCE_SHAKE_THRESHOLD) * ATMOSPHERE_DRIFT_TURBULENCE_BONUS;
    const driftMultiplier = ATMOSPHERE_DRIFT_FORCE_MULT * altitudeFactor * turbulenceBoost;
    const stabilityScale = host.getAtmosphereStabilityForceScale();
    const driftForcePerSecond: Vector3 = {
      x: state.driftVector.x * driftMultiplier * stabilityScale,
      y: state.driftVector.y * driftMultiplier * 0.45 * stabilityScale,
      z: state.driftVector.z * driftMultiplier * stabilityScale,
    };
    this.driftForceApplied = state.active ? driftForcePerSecond : { x: 0, y: 0, z: 0 };
    if (state.active) {
      spaceship.externalForces.x += driftForcePerSecond.x * deltaTime;
      spaceship.externalForces.y += driftForcePerSecond.y * deltaTime;
      spaceship.externalForces.z += driftForcePerSecond.z * deltaTime;
    }
    const up = host.computeAtmosphereUpVector();
    if (!up || !state.active || state.turbulenceCurrent <= 0) {
      return;
    }
    this.turbulencePhase += deltaTime * (1.5 + state.turbulenceCurrent * 6);
    const noise = Math.sin(this.turbulencePhase) + Math.sin(this.turbulencePhase * 0.6 + 0.7);
    const normalizedNoise = Math.max(-1, Math.min(1, noise * 0.5));
    const turbulenceForce = normalizedNoise * ATMOSPHERE_TURBULENCE_FORCE * state.turbulenceCurrent * altitudeFactor * stabilityScale * deltaTime;
    spaceship.externalForces.x += up.x * turbulenceForce;
    spaceship.externalForces.y += up.y * turbulenceForce;
    spaceship.externalForces.z += up.z * turbulenceForce;

    this.applyProgressiveDrift(deltaTime, state, altitudeFactor, host);
  }

  applyDragAndAcceleration(deltaTime: number, host: AtmosphereFlightHost): void {
    const spaceship = host.getSpaceship();
    if (!spaceship) {
      return;
    }
    if (!host.isAtmosphereSceneActive() || !host.isAtmosphereSceneStateActive()) {
      try { spaceship.resetAtmosphereSpeedControlGain(); } catch {}
      return;
    }
    if (host.isAtmosphereLandingCinematicShieldActive()) {
      try { spaceship.resetAtmosphereSpeedControlGain(); } catch {}
      return;
    }
    const altitudeFactor = this.forceAltitudeFactor(host);
    const state = host.getWeatherEffects();
    const turbulence = clamp(state.turbulenceCurrent ?? 0, 0, 1);
    const stabilityScale = host.getAtmosphereStabilityForceScale();
    const baseDrag = ATMOSPHERE_BASE_DRAG_PER_SEC * altitudeFactor;
    const turbulenceDrag = turbulence * ATMOSPHERE_TURBULENCE_DRAG_BONUS * altitudeFactor;
    const stabilityMitigation = lerpScalar(0.7, 1, stabilityScale);
    const dragPerSecond = (baseDrag + turbulenceDrag) * stabilityMitigation;
    const dragDelta = dragPerSecond * deltaTime;
    if (dragDelta > 0 && spaceship.targetSpeed > 0) {
      spaceship.targetSpeed = Math.max(0, spaceship.targetSpeed - dragDelta);
    }
    const turbulenceScale = 1 - turbulence * ATMOSPHERE_TURBULENCE_ACCEL_PENALTY;
    const stabilityRelief = 1 + (1 - stabilityScale) * 0.2;
    const accelScale = clamp(turbulenceScale * stabilityRelief, 0.4, 1);
    try { spaceship.setAtmosphereSpeedControlGain(accelScale); } catch {}
  }

  private applyProgressiveDrift(
    deltaTime: number,
    state: AtmosphereWeatherEffectsState,
    altitudeFactor: number,
    host: AtmosphereFlightHost,
  ): void {
    if (host.isAtmosphereLandingCinematicShieldActive()) {
      this.resetProgressiveDriftState();
      return;
    }
    const spaceship = host.getSpaceship();
    if (!spaceship) {
      this.resetProgressiveDriftState();
      return;
    }
    const decay = 1 - Math.exp(-deltaTime * 3.5);
    if (!host.isAtmosphereSceneActive() || !state.active) {
      this.progressiveDriftWeight = lerpScalar(
        this.progressiveDriftWeight,
        0,
        1 - Math.exp(-deltaTime * ATMOSPHERE_PROGRESSIVE_DRIFT_WEIGHT_DECAY)
      );
      this.progressiveDriftBias.x = lerpScalar(this.progressiveDriftBias.x, 0, decay);
      this.progressiveDriftBias.y = lerpScalar(this.progressiveDriftBias.y, 0, decay);
      this.progressiveDriftBias.z = lerpScalar(this.progressiveDriftBias.z, 0, decay);
      return;
    }
    const driftLen = Math.hypot(state.driftVector.x, state.driftVector.y, state.driftVector.z);
    const severity = Math.max(0, state.turbulenceCurrent - ATMOSPHERE_PROGRESSIVE_DRIFT_THRESHOLD);
    const hasTarget = severity > 1e-3 && driftLen > 1e-3;
    const targetWeight = hasTarget ? Math.min(1, severity * 1.35) : 0;
    const weightSmoothing = 1 - Math.exp(
      -deltaTime * (hasTarget ? ATMOSPHERE_PROGRESSIVE_DRIFT_WEIGHT_GAIN : ATMOSPHERE_PROGRESSIVE_DRIFT_WEIGHT_DECAY)
    );
    this.progressiveDriftWeight = lerpScalar(
      this.progressiveDriftWeight,
      targetWeight,
      weightSmoothing
    );
    if (!hasTarget || this.progressiveDriftWeight <= 1e-4) {
      this.progressiveDriftBias.x = lerpScalar(this.progressiveDriftBias.x, 0, decay);
      this.progressiveDriftBias.y = lerpScalar(this.progressiveDriftBias.y, 0, decay);
      this.progressiveDriftBias.z = lerpScalar(this.progressiveDriftBias.z, 0, decay);
      return;
    }
    const up = host.computeAtmosphereUpVector() ?? { x: 0, y: 1, z: 0 };
    const driftDir = vec3Normalize({ ...state.driftVector });
    const dotUp = driftDir.x * up.x + driftDir.y * up.y + driftDir.z * up.z;
    const lateral = vec3Normalize({
      x: driftDir.x - up.x * dotUp,
      y: driftDir.y - up.y * dotUp,
      z: driftDir.z - up.z * dotUp,
    });
    const liftScale = Math.min(0.45, severity * 0.8);
    const lift = { x: up.x * liftScale, y: up.y * liftScale, z: up.z * liftScale };
    const biasTarget = vec3Normalize({
      x: lateral.x + lift.x,
      y: lateral.y + lift.y,
      z: lateral.z + lift.z,
    });
    const biasSmoothing = 1 - Math.exp(-deltaTime * 4);
    this.progressiveDriftBias.x = lerpScalar(
      this.progressiveDriftBias.x,
      biasTarget.x,
      biasSmoothing
    );
    this.progressiveDriftBias.y = lerpScalar(
      this.progressiveDriftBias.y,
      biasTarget.y,
      biasSmoothing
    );
    this.progressiveDriftBias.z = lerpScalar(
      this.progressiveDriftBias.z,
      biasTarget.z,
      biasSmoothing
    );
    const magnitude = ATMOSPHERE_PROGRESSIVE_DRIFT_FORCE * this.progressiveDriftWeight * altitudeFactor * host.getAtmosphereStabilityForceScale();
    if (magnitude <= 1e-4) {
      return;
    }
    const applied = magnitude * deltaTime;
    spaceship.externalForces.x += this.progressiveDriftBias.x * applied;
    spaceship.externalForces.y += this.progressiveDriftBias.y * applied;
    spaceship.externalForces.z += this.progressiveDriftBias.z * applied;
  }

  resetProgressiveDriftState(): void {
    this.progressiveDriftWeight = 0;
    this.progressiveDriftBias = { x: 0, y: 0, z: 0 };
  }

  applyGravity(deltaTime: number, host: AtmosphereFlightHost): void {
    this.gravityTelemetry = null;
    const spaceship = host.getSpaceship();
    const geom = host.getAtmosphereGravityContext();
    if (!spaceship || !geom) {
      return;
    }
    if (host.isAtmosphereGravityLandingHold()) {
      const speed = Math.abs(spaceship.currentSpeed ?? 0);
      const speedFactor = atmosphereGravitySpeedFactor(speed);
      this.gravityTelemetry = {
        altitude: 0,
        gravityPerSecond: 0,
        finalGravity: 0,
        speedFactor,
      };
      return;
    }
    const { center, groundRadius, skyRadius, planetType } = geom;
    const gravityScale = atmosphereGravityScaleForPlanet(planetType);

    // Vector desde el centro del domo hasta la nave; la gravedad apunta hacia el centro.
    const dx = spaceship.position.x - center.x;
    const dy = spaceship.position.y - center.y;
    const dz = spaceship.position.z - center.z;
    const distFromCenter = Math.hypot(dx, dy, dz);

    if (distFromCenter < 1e-6) {
      return;
    }

    const shellAltitude = distFromCenter - groundRadius;
    const atmosphereThickness = Math.max(1, skyRadius - groundRadius);

    // La gravedad solo actúa mientras la nave permanezca dentro del domo atmosférico
    if (shellAltitude > atmosphereThickness) {
      const speed = Math.abs(spaceship.currentSpeed ?? 0);
      const speedFactor = atmosphereGravitySpeedFactor(speed);
      this.gravityTelemetry = {
        altitude: shellAltitude,
        gravityPerSecond: 0,
        finalGravity: 0,
        speedFactor,
      };
      return;
    }

    // Altitud real respecto a la superficie procedural (incluye relieve y radio del ship)
    const altitude = Math.max(0, host.computeAltitudeAboveGround());

    // Factor de intensidad: máxima (1.0) cerca de la superficie, decae hacia el límite del cielo
    const maxHeight = atmosphereThickness;
    const MIN_FALL_RATE = 10.0; // unidades/segundo base a 1000u (se multiplica por gravityScale)
    const MAX_FALL_RATE = 30.0; // unidades/segundo base cerca del suelo (se multiplica por gravityScale)
    const lowReference = 1;
    const highReference = Math.max(lowReference + 1, Math.min(1000, maxHeight));
    const interiorRange = Math.max(1, highReference - lowReference);
    const clampedAltitude = Math.min(Math.max(altitude, lowReference), highReference);
    const descentProgress = 1 - (clampedAltitude - lowReference) / interiorRange;
    const easedProgress = Math.pow(Math.max(0, Math.min(1, descentProgress)), 0.85);
    const innerFallRate = MIN_FALL_RATE + (MAX_FALL_RATE - MIN_FALL_RATE) * easedProgress;
    const aboveReference = Math.max(0, altitude - highReference);
    const outerRange = Math.max(1, maxHeight - highReference);
    const outerFalloff = outerRange <= 0 ? 1 : 1 - Math.min(1, aboveReference / outerRange);
    const gravityPerSecond = innerFallRate * outerFalloff;
    const speed = Math.abs(spaceship.currentSpeed ?? 0);
    const speedFactor = atmosphereGravitySpeedFactor(speed);
    const scaledGravity = gravityPerSecond * speedFactor * gravityScale;
    const finalGravity = Math.max(0, scaledGravity);
    this.gravityTelemetry = {
      altitude,
      gravityPerSecond,
      finalGravity,
      speedFactor,
    };
    if (gravityPerSecond <= 0 || finalGravity <= 0) {
      return;
    }

    // Acumular hacia el centro en externalForces (se integra en spaceship.update).
    const dirX = -dx / distFromCenter;
    const dirY = -dy / distFromCenter;
    const dirZ = -dz / distFromCenter;
    const velocityChange = finalGravity * deltaTime;
    spaceship.externalForces.x += dirX * velocityChange;
    spaceship.externalForces.y += dirY * velocityChange;
    spaceship.externalForces.z += dirZ * velocityChange;
  }
}
