import { Vector3 } from '../../types/game.types';
import { clamp } from '../math/vector-math';
import { getPlanetTypeLabel } from '../utils/label-utils';
import { AtmosphereTelemetryPanelState, AtmosphereTelemetryPayload } from '../types/hud.types';
import { LandingApproachContext } from '../types/landing.types';
import { AtmosphereWeatherSnapshot } from './AtmosphereWeatherService';

/**
 * Constructores PUROS de la telemetría atmosférica del HUD (docs/ARQUITECTURA.md Fase 5.1).
 * Antes vivían como métodos de GameEngine; la lógica es idéntica. El motor reúne las entradas
 * (estado del clima, altitud, deriva) y deja aquí el cálculo del payload — ahora testeable.
 */

/** Clasifica la severidad de la turbulencia a partir del valor normalizado y la magnitud de deriva. */
export function classifyAtmosphereTurbulence(
  value: number,
  driftMagnitude: number,
): AtmosphereTelemetryPayload['turbulenceSeverity'] {
  if (value >= 0.75 || driftMagnitude >= 4) {
    return 'severe';
  }
  if (value >= 0.4 || driftMagnitude >= 2.5) {
    return 'moderate';
  }
  if (value >= 0.15 || driftMagnitude >= 1) {
    return 'light';
  }
  return 'calm';
}

/** Etiqueta legible (es) del tipo de evento meteorológico. */
export function getAtmosphereWeatherDisplayLabel(eventType: string): string {
  switch (eventType) {
    case 'clear':
      return 'Cielo claro';
    case 'light_fog':
      return 'Niebla leve';
    case 'dense_fog':
      return 'Niebla densa';
    case 'rain':
      return 'Lluvia';
    case 'thunderstorm':
      return 'Tormenta eléctrica';
    case 'dust_storm':
      return 'Tormenta de polvo';
    case 'meteor_shower':
      return 'Lluvia de meteoros';
    default:
      return eventType.replace(/_/g, ' ');
  }
}

/** Entradas del payload de telemetría (estado de clima ya leído por el motor). */
export interface AtmosphereTelemetryInput {
  active: boolean;
  visibilityCurrent: number;
  turbulenceCurrent: number;
  eventType: string;
  driftVector: Vector3;
  altitude: number;
  altitudeFactor: number;
  autoVectorCurrent: number;
  autoVectorBandMin: number;
}

/** Construye el snapshot de telemetría (visibilidad/turbulencia/estabilidad/deriva/lift). */
export function buildAtmosphereTelemetryPayload(input: AtmosphereTelemetryInput): AtmosphereTelemetryPayload {
  const driftVector = input.driftVector;
  const driftMagnitude = Math.hypot(driftVector.x, driftVector.y, driftVector.z);
  const visibility = clamp(input.visibilityCurrent, 0, 1);
  const turbulence = clamp(input.turbulenceCurrent * input.altitudeFactor, 0, 1);
  const turbulenceSeverity = classifyAtmosphereTurbulence(turbulence, driftMagnitude);

  let stability: AtmosphereTelemetryPayload['stability'] = input.active ? 'stable' : 'calm';
  if (input.active) {
    if (turbulenceSeverity === 'severe' || driftMagnitude > 3.2) {
      stability = 'unstable';
    } else if (turbulenceSeverity === 'moderate') {
      stability = 'unstable';
    } else if (input.autoVectorCurrent < 0.25 && input.altitude < input.autoVectorBandMin * 0.6) {
      stability = 'descending';
    }
  }

  return {
    visibility,
    turbulence,
    drift: {
      x: driftVector.x,
      y: driftVector.y,
      z: driftVector.z,
      magnitude: driftMagnitude,
    },
    eventType: input.eventType,
    stability,
    turbulenceSeverity,
    liftPerSecond: input.autoVectorCurrent,
  };
}

/** Entradas del panel de telemetría (contexto de aterrizaje + payload + clima + altitud). */
export interface AtmosphereTelemetryPanelInput {
  context: LandingApproachContext | null;
  telemetry: AtmosphereTelemetryPayload | null;
  weather: AtmosphereWeatherSnapshot | null;
  altitudeAboveGround: number;
}

/** Construye el estado completo del panel de telemetría del HUD (o null si falta contexto/telemetría). */
export function buildAtmosphereTelemetryPanelState(
  input: AtmosphereTelemetryPanelInput,
): AtmosphereTelemetryPanelState | null {
  const { context, telemetry, weather, altitudeAboveGround } = input;
  if (!context || !telemetry) {
    return null;
  }
  const distanceToSurface = Math.max(0, context.distanceToSurface);
  const driftVector = telemetry.drift;
  const driftMagnitude = driftVector?.magnitude ?? 0;
  const driftHeadingDeg = driftMagnitude > 1e-3
    ? (Math.atan2(driftVector.z, driftVector.x) * 180) / Math.PI
    : 0;
  const horizontalLen = Math.hypot(driftVector.x, driftVector.z);
  const driftPitchDeg = driftMagnitude > 1e-3
    ? (Math.atan2(driftVector.y, horizontalLen) * 180) / Math.PI
    : 0;

  const warnings: string[] = [];
  if (telemetry.stability === 'unstable') {
    warnings.push('Inestabilidad severa');
  } else if (telemetry.stability === 'descending') {
    warnings.push('Lift degradado');
  }
  if (telemetry.visibility < 0.35) {
    warnings.push('Visibilidad crítica');
  }
  if (telemetry.turbulenceSeverity === 'moderate') {
    warnings.push('Turbulencia fuerte (sacudidas)');
  } else if (telemetry.turbulenceSeverity === 'severe') {
    warnings.push('Turbulencia extrema — cámara inestable');
  }
  if ((weather?.lightningChance ?? 0) > 0.45) {
    warnings.push('Descargas frecuentes');
  }

  const planetIntel = context.planetIntel;
  const weatherState = weather
    ? {
        label: getAtmosphereWeatherDisplayLabel(weather.eventType),
        eventType: weather.eventType,
        intensity: weather.intensity,
        precipitation: weather.precipitation,
        lightningChance: weather.lightningChance,
        etaMs: weather.etaMs,
        startedAtMs: weather.startedAtMs,
        layerId: weather.layerId,
        layerLabel: weather.layerLabel,
        layerBounds: weather.layerBounds ?? { min: 0, max: Infinity },
      }
    : null;

  const timestamp = performance?.now?.() ?? Date.now();

  return {
    planet: {
      id: context.planetId,
      name: context.planetName,
      typeLabel: getPlanetTypeLabel(context.planetType),
      visited: planetIntel?.planetVisited ?? false,
      inhabitantsDisplay: planetIntel?.planetInhabitantsDisplay,
      lesserBeingDisplay: planetIntel?.planetLesserBeingDisplay,
      probabilityOfLifePct: planetIntel?.planetLifeIntelKnown ? undefined : context.probabilityOfLifePct,
    },
    altitudeAboveGround,
    distanceToSurface,
    telemetry,
    weather: weatherState,
    driftHeadingDeg,
    driftPitchDeg,
    liftPerSecond: telemetry.liftPerSecond,
    warnings,
    timestamp,
  };
}
