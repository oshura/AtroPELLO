import { Vector3 } from '../../types/game.types';
import { clamp, lerpScalar } from '../math/vector-math';
import {
  weatherLightingBase,
  WEATHER_LIGHT_MIN,
  WEATHER_LIGHT_MAX,
  WEATHER_DRIFT_OFFSET_MAX,
} from './atmosphere-physics';
import { AtmosphereWeatherEventType, AtmosphereWeatherSnapshot } from './AtmosphereWeatherService';

/**
 * Estado suavizado de los efectos de clima atmosférico (visibilidad/iluminación/turbulencia/deriva)
 * que el HUD y la física leen cada frame. Antes vivía como campos sueltos en GameEngine.
 */
export interface AtmosphereWeatherEffectsState {
  active: boolean;
  visibilityCurrent: number;
  visibilityTarget: number;
  lightingCurrent: number;
  lightingTarget: number;
  turbulenceCurrent: number;
  driftVector: Vector3;
  driftOffset: Vector3;
  impactVolumeMultiplier: number;
  eventType: AtmosphereWeatherEventType;
  updatedAtMs: number;
}

/**
 * Devoluciones mínimas que el sistema necesita del motor: saber si la escena atmosférica está
 * activa y emitir el aviso de absorción de impactos por el HUD. El motor implementa esto y se pasa
 * a sí mismo (vía un adaptador) en cada llamada — ningún estado del motor se filtra al sistema.
 */
export interface AtmosphereWeatherEffectsHost {
  isAtmosphereSceneActive(): boolean;
  emitImpactAbsorptionWarning(): void;
}

/** Por debajo de este multiplicador de volumen los impactos se consideran "amortiguados". */
const ATMOSPHERE_IMPACT_ABSORPTION_THRESHOLD = 0.35;

/** Objetivo de deriva cuando no hay clima activo (no se muta, solo se lee). */
const ZERO_DRIFT: Vector3 = { x: 0, y: 0, z: 0 };

function createDefaultEffectsState(): AtmosphereWeatherEffectsState {
  const now = performance?.now?.() ?? Date.now();
  return {
    active: false,
    visibilityCurrent: 1,
    visibilityTarget: 1,
    lightingCurrent: 1,
    lightingTarget: 1,
    turbulenceCurrent: 0,
    driftVector: { x: 0, y: 0, z: 0 },
    driftOffset: { x: 0, y: 0, z: 0 },
    impactVolumeMultiplier: 1,
    eventType: 'clear',
    updatedAtMs: now,
  };
}

/**
 * Sistema stateful de efectos de clima atmosférico (docs/ARQUITECTURA.md Fase 5.1, primera rebanada).
 * Posee el estado suavizado de efectos y la capa de tinte (overlay). La lógica es idéntica a la que
 * tenía GameEngine; solo cambió de hogar. Las capas de relámpago siguen en el motor (rebanada futura).
 */
export class AtmosphereWeatherEffectsSystem {
  /** Estado suavizado vivo; el motor lo expone con getAtmosphereWeatherEffectsState(). */
  effects: AtmosphereWeatherEffectsState = createDefaultEffectsState();

  /** Tinte de pantalla por clima (lo lee el render del overlay). */
  overlayAlpha = 0;
  overlayTarget = 0;
  overlayColor: [number, number, number] = [0, 0, 0];
  overlayColorTarget: [number, number, number] = [0, 0, 0];

  /** Flag para no spamear el aviso de absorción de impactos. */
  impactAbsorptionActive = false;

  reset(): void {
    this.effects = createDefaultEffectsState();
    this.resetOverlay();
    this.impactAbsorptionActive = false;
  }

  private resetOverlay(): void {
    this.overlayAlpha = 0;
    this.overlayTarget = 0;
    this.overlayColor = [0, 0, 0];
    this.overlayColorTarget = [0, 0, 0];
  }

  update(deltaTime: number, snapshot: AtmosphereWeatherSnapshot | null, host: AtmosphereWeatherEffectsHost): void {
    const state = this.effects;
    const now = performance?.now?.() ?? Date.now();
    const active = !!snapshot;
    const targetVisibility = snapshot ? clamp(snapshot.visibilityMultiplier ?? 1, 0.1, 1) : 1;
    const targetLighting = this.computeLightingTarget(snapshot);
    const targetTurbulence = snapshot ? clamp(snapshot.turbulenceStrength ?? 0, 0, 1) : 0;
    const targetImpact = snapshot ? clamp(snapshot.impactVolumeMultiplier ?? 1, 0.1, 1.2) : 1;
    const driftTarget = snapshot ? snapshot.driftVector : ZERO_DRIFT;
    const smoothing = 1 - Math.exp(-deltaTime * 4.5);
    const decay = 1 - Math.exp(-deltaTime * 1.25);

    state.visibilityCurrent = lerpScalar(state.visibilityCurrent, targetVisibility, smoothing);
    state.visibilityTarget = targetVisibility;
    state.lightingCurrent = lerpScalar(state.lightingCurrent, targetLighting, smoothing);
    state.lightingTarget = targetLighting;
    state.turbulenceCurrent = lerpScalar(state.turbulenceCurrent, targetTurbulence, smoothing);
    state.impactVolumeMultiplier = lerpScalar(state.impactVolumeMultiplier, targetImpact, smoothing);

    state.driftVector.x = lerpScalar(state.driftVector.x, driftTarget.x, smoothing);
    state.driftVector.y = lerpScalar(state.driftVector.y, driftTarget.y, smoothing);
    state.driftVector.z = lerpScalar(state.driftVector.z, driftTarget.z, smoothing);

    if (active) {
      state.driftOffset.x = clamp(state.driftOffset.x + state.driftVector.x * deltaTime, -WEATHER_DRIFT_OFFSET_MAX, WEATHER_DRIFT_OFFSET_MAX);
      state.driftOffset.y = clamp(state.driftOffset.y + state.driftVector.y * deltaTime, -WEATHER_DRIFT_OFFSET_MAX, WEATHER_DRIFT_OFFSET_MAX);
      state.driftOffset.z = clamp(state.driftOffset.z + state.driftVector.z * deltaTime, -WEATHER_DRIFT_OFFSET_MAX, WEATHER_DRIFT_OFFSET_MAX);
    } else {
      state.driftOffset.x = lerpScalar(state.driftOffset.x, 0, decay);
      state.driftOffset.y = lerpScalar(state.driftOffset.y, 0, decay);
      state.driftOffset.z = lerpScalar(state.driftOffset.z, 0, decay);
    }

    state.eventType = snapshot?.eventType ?? 'clear';
    state.active = active;
    state.updatedAtMs = now;

    this.updateImpactAbsorptionHud(state, host);
    this.updateOverlay(deltaTime, snapshot);
  }

  private updateOverlay(deltaTime: number, snapshot: AtmosphereWeatherSnapshot | null): void {
    const smoothing = 1 - Math.exp(-deltaTime * 3.5);
    let alphaTarget = 0;
    let colorTarget: [number, number, number] = [0, 0, 0];

    if (snapshot) {
      const intensity = clamp(snapshot.intensity ?? 0, 0, 1);
      switch (snapshot.eventType) {
        case 'dust_storm':
          alphaTarget = 0.3 + 0.45 * intensity;
          colorTarget = [0.58, 0.44, 0.25];
          break;
        case 'thunderstorm':
          alphaTarget = 0.18 + 0.4 * intensity;
          colorTarget = [0.2, 0.24, 0.38];
          break;
        case 'rain':
          alphaTarget = 0.1 + 0.26 * intensity;
          colorTarget = [0.16, 0.2, 0.3];
          break;
        case 'dense_fog':
          alphaTarget = 0.12 + 0.2 * intensity;
          colorTarget = [0.62, 0.65, 0.64];
          break;
        case 'light_fog':
          alphaTarget = 0.08 + 0.15 * intensity;
          colorTarget = [0.55, 0.58, 0.6];
          break;
        case 'meteor_shower':
          alphaTarget = 0.05 + 0.08 * intensity;
          colorTarget = [0.28, 0.26, 0.34];
          break;
        default:
          alphaTarget = 0.04 + 0.1 * intensity;
          colorTarget = [0.1, 0.12, 0.15];
          break;
      }
    }

    this.overlayTarget = alphaTarget;
    this.overlayAlpha = lerpScalar(this.overlayAlpha, alphaTarget, smoothing);
    this.overlayColor[0] = lerpScalar(this.overlayColor[0], colorTarget[0], smoothing);
    this.overlayColor[1] = lerpScalar(this.overlayColor[1], colorTarget[1], smoothing);
    this.overlayColor[2] = lerpScalar(this.overlayColor[2], colorTarget[2], smoothing);
  }

  private computeLightingTarget(snapshot: AtmosphereWeatherSnapshot | null): number {
    // Base común en atmosphere-physics; este consumidor mantiene su clamp superior a 1.10.
    return clamp(weatherLightingBase(snapshot), WEATHER_LIGHT_MIN, WEATHER_LIGHT_MAX + 0.05);
  }

  getImpactVolumeScale(host: AtmosphereWeatherEffectsHost): number {
    if (!host.isAtmosphereSceneActive()) {
      return 1;
    }
    const value = this.effects?.impactVolumeMultiplier ?? 1;
    return clamp(value, 0.1, 1.2);
  }

  private updateImpactAbsorptionHud(state: AtmosphereWeatherEffectsState, host: AtmosphereWeatherEffectsHost): void {
    const absorbing = host.isAtmosphereSceneActive()
      && state.active
      && state.impactVolumeMultiplier <= ATMOSPHERE_IMPACT_ABSORPTION_THRESHOLD;
    if (absorbing && !this.impactAbsorptionActive) {
      host.emitImpactAbsorptionWarning();
    }
    this.impactAbsorptionActive = absorbing;
  }
}
