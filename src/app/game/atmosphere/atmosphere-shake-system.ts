import { clamp, lerpScalar, vec3Normalize } from '../math/vector-math';
import {
  atmosphereForceAltitudeFactor,
  ATMOSPHERE_TURBULENCE_SHAKE_THRESHOLD,
  WEATHER_DRIFT_OFFSET_MAX,
} from './atmosphere-physics';
import { AtmosphereFlightHost } from './atmosphere-flight-system';

/**
 * Sacudidas de cámara y nave por turbulencia atmosférica (docs/ARQUITECTURA.md Fase 5.1). Sólo FX:
 * muta cámara/nave y no expone estado al resto del motor. La lógica es idéntica a la que tenía
 * GameEngine; sólo cambió de hogar. Comparte `AtmosphereFlightHost` con AtmosphereFlightSystem.
 */

// Constantes exclusivas del jitter/shake (las compartidas viven en atmosphere-physics).
const ATMOSPHERE_TURBULENCE_SHAKE_BASE = 0.12;
const ATMOSPHERE_TURBULENCE_SHAKE_GAIN = 0.9;
const ATMOSPHERE_CAMERA_DRIFT_TURBULENCE_PUSH = 0.35;
const ATMOSPHERE_CAMERA_JITTER_MAX = 0.75;
const ATMOSPHERE_CAMERA_DRIFT_MAX = 5;
const ATMOSPHERE_CAMERA_SHAKE_MIN_INTERVAL = 3;
const ATMOSPHERE_CAMERA_SHAKE_MAX_INTERVAL = 6;
const ATMOSPHERE_CAMERA_SHAKE_DURATION = 0.9;
const ATMOSPHERE_CAMERA_SHAKE_MAX_DEGREES = 4;
const ATMOSPHERE_SHIP_JITTER_THRESHOLD = 0.35;
const ATMOSPHERE_SHIP_JITTER_FORCE = 6;

export class AtmosphereShakeSystem {
  // Estado transitorio de la sacudida de cámara.
  private cameraJitterStrength = 0;
  private cameraDriftStrength = 0;
  private cameraJitterPhase = 0;
  private cameraShakeActive = false;
  private cameraShakeElapsed = 0;
  private cameraShakeCooldown = 3 + Math.random() * 3;
  private cameraShakeDirection = 1;

  // Estado transitorio de la sacudida de la nave.
  private shipJitterStrength = 0;
  private shipJitterPhase = 0;

  private forceAltitudeFactor(host: AtmosphereFlightHost, altitude?: number): number {
    return atmosphereForceAltitudeFactor(altitude ?? host.computeAltitudeAboveGround());
  }

  applyCameraJitter(deltaTime: number, host: AtmosphereFlightHost): void {
    const camera = host.getCamera();
    if (!camera) {
      return;
    }
    if (host.isAtmosphereLandingCinematicShieldActive()) {
      this.cameraJitterStrength = 0;
      this.cameraDriftStrength = 0;
      this.suspendCameraShake();
      return;
    }
    if (host.isLandingCinematicCameraHoldActive()) {
      this.cameraJitterStrength = 0;
      this.cameraDriftStrength = 0;
      this.suspendCameraShake();
      return;
    }
    const state = host.getWeatherEffects();
    const altitude = Math.max(0, host.computeAltitudeAboveGround());
    const altitudeFactor = this.forceAltitudeFactor(host, altitude);
    const turbulenceNormalized = state.turbulenceCurrent * altitudeFactor;
    const stabilityScale = host.getAtmosphereStabilityForceScale();
    const severityBonus = turbulenceNormalized >= ATMOSPHERE_TURBULENCE_SHAKE_THRESHOLD
      ? ATMOSPHERE_TURBULENCE_SHAKE_BASE + (turbulenceNormalized - ATMOSPHERE_TURBULENCE_SHAKE_THRESHOLD) * ATMOSPHERE_TURBULENCE_SHAKE_GAIN
      : 0;
    const targetJitter = host.isAtmosphereSceneActive()
      ? clamp(Math.pow(turbulenceNormalized, 0.85) + severityBonus, 0, 1.35)
      : 0;
    const scaledTargetJitter = targetJitter * stabilityScale;
    const smoothing = 1 - Math.exp(-deltaTime * 5);
    this.cameraJitterStrength = lerpScalar(this.cameraJitterStrength, scaledTargetJitter, smoothing);
    const driftMagnitude = state.active ? Math.min(1, Math.hypot(state.driftOffset.x, state.driftOffset.y, state.driftOffset.z) / WEATHER_DRIFT_OFFSET_MAX) : 0;
    const driftTurbulencePush = turbulenceNormalized >= ATMOSPHERE_TURBULENCE_SHAKE_THRESHOLD
      ? (turbulenceNormalized - ATMOSPHERE_TURBULENCE_SHAKE_THRESHOLD) * ATMOSPHERE_CAMERA_DRIFT_TURBULENCE_PUSH
      : 0;
    const driftTarget = Math.min(1, driftMagnitude + driftTurbulencePush) * stabilityScale;
    this.cameraDriftStrength = lerpScalar(this.cameraDriftStrength, driftTarget, smoothing * 0.7);
    const shakeAngleDeg = this.updateCameraPeriodicShake(deltaTime, turbulenceNormalized, stabilityScale, host);
    const cameraOffset = {
      x: camera.target.x - camera.position.x,
      y: camera.target.y - camera.position.y,
      z: camera.target.z - camera.position.z,
    };
    const cameraDistance = Math.hypot(cameraOffset.x, cameraOffset.y, cameraOffset.z) || 1;
    const forward = vec3Normalize(cameraOffset);
    let up = vec3Normalize({ ...camera.up });
    let right = {
      x: forward.y * up.z - forward.z * up.y,
      y: forward.z * up.x - forward.x * up.z,
      z: forward.x * up.y - forward.y * up.x,
    };
    const rightLen = Math.hypot(right.x, right.y, right.z);
    if (rightLen < 1e-5) {
      right = { x: 1, y: 0, z: 0 };
    } else {
      right.x /= rightLen; right.y /= rightLen; right.z /= rightLen;
    }
    up = vec3Normalize({
      x: right.y * forward.z - right.z * forward.y,
      y: right.z * forward.x - right.x * forward.z,
      z: right.x * forward.y - right.y * forward.x,
    });
    let cameraDirty = false;
    const hasTranslationOffset = this.cameraJitterStrength > 1e-3 || this.cameraDriftStrength > 1e-3;
    if (hasTranslationOffset) {
      this.cameraJitterPhase += deltaTime * (2.5 + state.turbulenceCurrent * 6);
      const jitterNoiseX = Math.sin(this.cameraJitterPhase) + Math.sin(this.cameraJitterPhase * 0.6 + 1.1);
      const jitterNoiseY = Math.cos(this.cameraJitterPhase * 0.9 + 0.4);
      const jitterScale = ATMOSPHERE_CAMERA_JITTER_MAX * this.cameraJitterStrength;
      const jitterOffset = {
        x: right.x * (jitterNoiseX * jitterScale) + up.x * (jitterNoiseY * jitterScale * 0.6),
        y: right.y * (jitterNoiseX * jitterScale) + up.y * (jitterNoiseY * jitterScale * 0.6),
        z: right.z * (jitterNoiseX * jitterScale) + up.z * (jitterNoiseY * jitterScale * 0.6),
      };

      let driftOffset = { x: 0, y: 0, z: 0 };
      const driftLen = Math.hypot(state.driftOffset.x, state.driftOffset.y, state.driftOffset.z);
      if (state.active && driftLen > 1e-3) {
        const driftScale = ATMOSPHERE_CAMERA_DRIFT_MAX * this.cameraDriftStrength;
        driftOffset = {
          x: (state.driftOffset.x / driftLen) * driftScale,
          y: (state.driftOffset.y / driftLen) * driftScale * 0.4,
          z: (state.driftOffset.z / driftLen) * driftScale,
        };
      }

      const totalOffset = {
        x: jitterOffset.x + driftOffset.x,
        y: jitterOffset.y + driftOffset.y,
        z: jitterOffset.z + driftOffset.z,
      };

      if (Math.abs(totalOffset.x) + Math.abs(totalOffset.y) + Math.abs(totalOffset.z) > 1e-5) {
        camera.position.x += totalOffset.x;
        camera.position.y += totalOffset.y;
        camera.position.z += totalOffset.z;
        camera.target.x += totalOffset.x;
        camera.target.y += totalOffset.y;
        camera.target.z += totalOffset.z;
        cameraDirty = true;
      }
    }

    if (cameraDistance > 1e-4 && Math.abs(shakeAngleDeg) > 1e-3) {
      const angleRad = shakeAngleDeg * (Math.PI / 180);
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      const rotatedForward = {
        x: forward.x * cosA + up.x * sinA,
        y: forward.y * cosA + up.y * sinA,
        z: forward.z * cosA + up.z * sinA,
      };
      const rotatedUp = {
        x: up.x * cosA - forward.x * sinA,
        y: up.y * cosA - forward.y * sinA,
        z: up.z * cosA - forward.z * sinA,
      };
      const normalizedForward = vec3Normalize(rotatedForward);
      const normalizedUp = vec3Normalize(rotatedUp);
      camera.target.x = camera.position.x + normalizedForward.x * cameraDistance;
      camera.target.y = camera.position.y + normalizedForward.y * cameraDistance;
      camera.target.z = camera.position.z + normalizedForward.z * cameraDistance;
      camera.up.x = normalizedUp.x;
      camera.up.y = normalizedUp.y;
      camera.up.z = normalizedUp.z;
      cameraDirty = true;
    }

    if (cameraDirty) {
      camera.markDirty();
    }
  }

  private updateCameraPeriodicShake(
    deltaTime: number,
    turbulenceNormalized: number,
    stabilityScale: number,
    host: AtmosphereFlightHost,
  ): number {
    if (!host.isAtmosphereSceneActive()) {
      this.cameraShakeActive = false;
      this.cameraShakeElapsed = 0;
      return 0;
    }
    const severity = clamp(
      (turbulenceNormalized - ATMOSPHERE_TURBULENCE_SHAKE_THRESHOLD)
        / Math.max(1e-3, 1 - ATMOSPHERE_TURBULENCE_SHAKE_THRESHOLD),
      0,
      1,
    );
    if (severity <= 0 || stabilityScale <= 1e-3) {
      this.cameraShakeActive = false;
      this.cameraShakeElapsed = 0;
      return 0;
    }
    if (this.cameraShakeActive) {
      this.cameraShakeElapsed += deltaTime;
      const progress = this.cameraShakeElapsed / ATMOSPHERE_CAMERA_SHAKE_DURATION;
      if (progress >= 1) {
        this.cameraShakeActive = false;
        this.cameraShakeElapsed = 0;
        return 0;
      }
      const envelope = Math.sin(progress * Math.PI);
      const angleDeg = ATMOSPHERE_CAMERA_SHAKE_MAX_DEGREES * envelope * severity * stabilityScale;
      return angleDeg * this.cameraShakeDirection;
    }
    this.cameraShakeCooldown = Math.max(0, this.cameraShakeCooldown - deltaTime);
    if (this.cameraShakeCooldown <= 0) {
      this.cameraShakeActive = true;
      this.cameraShakeElapsed = 0;
      this.cameraShakeDirection = Math.random() > 0.5 ? 1 : -1;
      this.cameraShakeCooldown = ATMOSPHERE_CAMERA_SHAKE_MIN_INTERVAL
        + Math.random() * (ATMOSPHERE_CAMERA_SHAKE_MAX_INTERVAL - ATMOSPHERE_CAMERA_SHAKE_MIN_INTERVAL);
    }
    return 0;
  }

  suspendCameraShake(): void {
    this.cameraShakeActive = false;
    this.cameraShakeElapsed = 0;
  }

  applyShipJitter(deltaTime: number, host: AtmosphereFlightHost): void {
    const spaceship = host.getSpaceship();
    if (!spaceship) {
      this.shipJitterStrength = 0;
      return;
    }
    if (host.isAtmosphereLandingCinematicShieldActive()) {
      this.shipJitterStrength = 0;
      return;
    }
    const state = host.getWeatherEffects();
    const active = host.isAtmosphereSceneActive() && state.active;
    const severity = active ? Math.max(0, state.turbulenceCurrent - ATMOSPHERE_SHIP_JITTER_THRESHOLD) : 0;
    const targetStrength = Math.min(1, severity * 1.4);
    const smoothing = 1 - Math.exp(-deltaTime * 5);
    this.shipJitterStrength = lerpScalar(
      this.shipJitterStrength,
      targetStrength,
      smoothing
    );
    if (this.shipJitterStrength <= 1e-3) {
      return;
    }
    const altitudeFactor = this.forceAltitudeFactor(host);
    const up = vec3Normalize(host.computeAtmosphereUpVector() ?? { x: 0, y: 1, z: 0 });
    let forward = vec3Normalize({ ...spaceship.forwardDirection });
    if (Math.abs(forward.x) + Math.abs(forward.y) + Math.abs(forward.z) <= 1e-5) {
      forward = { x: 0, y: 0, z: 1 };
    }
    let right = {
      x: forward.y * up.z - forward.z * up.y,
      y: forward.z * up.x - forward.x * up.z,
      z: forward.x * up.y - forward.y * up.x,
    };
    const rightLen = Math.hypot(right.x, right.y, right.z);
    if (rightLen > 1e-5) {
      right.x /= rightLen;
      right.y /= rightLen;
      right.z /= rightLen;
    } else {
      right = { x: 1, y: 0, z: 0 };
    }
    const trueUp = vec3Normalize({
      x: right.y * forward.z - right.z * forward.y,
      y: right.z * forward.x - right.x * forward.z,
      z: right.x * forward.y - right.y * forward.x,
    });

    this.shipJitterPhase += deltaTime * (3.2 + state.turbulenceCurrent * 7.5);
    const phase = this.shipJitterPhase;
    const noiseRight = Math.sin(phase * 1.35 + 0.7);
    const noiseUp = Math.cos(phase * 0.92 + 1.4);
    const noiseForward = Math.sin(phase * 0.48 + 2.1);
    const baseForce = ATMOSPHERE_SHIP_JITTER_FORCE * this.shipJitterStrength * altitudeFactor * host.getAtmosphereStabilityForceScale();
    const appliedForce = baseForce * deltaTime;

    spaceship.externalForces.x += (
      right.x * noiseRight + trueUp.x * noiseUp * 0.55 + forward.x * noiseForward * 0.25
    ) * appliedForce;
    spaceship.externalForces.y += (
      right.y * noiseRight + trueUp.y * noiseUp * 0.55 + forward.y * noiseForward * 0.25
    ) * appliedForce;
    spaceship.externalForces.z += (
      right.z * noiseRight + trueUp.z * noiseUp * 0.55 + forward.z * noiseForward * 0.25
    ) * appliedForce;
  }
}
