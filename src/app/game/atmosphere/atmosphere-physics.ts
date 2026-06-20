import { PlanetType } from '../game-objects/Planet';
import { clamp, lerpScalar } from '../math/vector-math';

/**
 * Funciones PURAS de la física atmosférica extraídas de GameEngine (docs/ARQUITECTURA.md Fase 5.1).
 * Sin estado: el comportamiento es idéntico al que tenía el motor (mismas constantes y fórmulas).
 * La orquestación stateful (aplicar fuerzas a la nave, leer atmosphereSceneState) sigue en el engine;
 * aquí solo viven los cálculos deterministas, que ahora son testeables.
 */

/** Escala de gravedad por defecto cuando el tipo de planeta no encaja. */
export const ATMOSPHERE_GRAVITY_DEFAULT_SCALE = 3;

/** Altitud (u) a la que arranca la banda de sustentación asistida. Compartida con el HUD de telemetría. */
export const ATMOSPHERE_AUTO_VECTOR_BAND_MIN = 30;

/** Umbrales del auto-vector (sustentación asistida) en función de la velocidad. */
export const ATMOSPHERE_AUTO_VECTOR_SPEED_MIN = 0.35;
export const ATMOSPHERE_AUTO_VECTOR_SPEED_MAX = 2.6;
export const ATMOSPHERE_AUTO_VECTOR_MIN_FACTOR = 0.15;

/** Escala de gravedad según el tipo de planeta (heurística de gameplay). */
export function atmosphereGravityScaleForPlanet(type?: PlanetType): number {
  switch (type) {
    case PlanetType.Dwarf:
      return 1;
    case PlanetType.Protoplanet:
      return 0;
    case PlanetType.Ringed:
      return 5;
    case PlanetType.Giant:
    case PlanetType.Sun:
      return 10;
    case PlanetType.Tierra:
    case PlanetType.Planetoid:
      return 3;
    default:
      return ATMOSPHERE_GRAVITY_DEFAULT_SCALE;
  }
}

/**
 * Atenúa la gravedad según la velocidad actual de la nave:
 *  - 0 u/s ⇒ 100% del efecto · 3 u/s ⇒ ~35% · ≥5 u/s ⇒ 0%.
 */
export function atmosphereGravitySpeedFactor(speed: number): number {
  if (!isFinite(speed) || speed <= 0) {
    return 1;
  }
  const softThreshold = 3;
  const zeroThreshold = 5;
  if (speed >= zeroThreshold) {
    return 0;
  }
  if (speed <= softThreshold) {
    const t = clamp(speed / softThreshold, 0, 1);
    return lerpScalar(1, 0.35, t);
  }
  const t = clamp((speed - softThreshold) / Math.max(1e-3, zeroThreshold - softThreshold), 0, 1);
  return lerpScalar(0.35, 0, t);
}

/** Factor del auto-vector (0.15 en reposo → 1 a velocidad de crucero). */
export function atmosphereAutoVectorSpeedFactor(speed: number): number {
  if (!isFinite(speed)) {
    return ATMOSPHERE_AUTO_VECTOR_MIN_FACTOR;
  }
  if (speed <= ATMOSPHERE_AUTO_VECTOR_SPEED_MIN) {
    return ATMOSPHERE_AUTO_VECTOR_MIN_FACTOR;
  }
  if (speed >= ATMOSPHERE_AUTO_VECTOR_SPEED_MAX) {
    return 1;
  }
  const range = Math.max(1e-3, ATMOSPHERE_AUTO_VECTOR_SPEED_MAX - ATMOSPHERE_AUTO_VECTOR_SPEED_MIN);
  const t = clamp((speed - ATMOSPHERE_AUTO_VECTOR_SPEED_MIN) / range, 0, 1);
  const eased = Math.pow(t, 0.85);
  return lerpScalar(ATMOSPHERE_AUTO_VECTOR_MIN_FACTOR, 1, eased);
}

/** Factor de fuerza según altitud (1.05 cerca del suelo → 0.35 a 750u). Requiere altitud ya resuelta. */
export function atmosphereForceAltitudeFactor(altitude: number): number {
  const alt = Math.max(0, altitude);
  const normalized = 1 - alt / 750;
  return clamp(normalized, 0.35, 1.05);
}

/** Tope del desplazamiento acumulado por deriva del clima (u). Compartido con el HUD de telemetría. */
export const WEATHER_DRIFT_OFFSET_MAX = 750;

/**
 * Umbral de turbulencia (0..1) por encima del cual arrancan las sacudidas de cámara/nave y el
 * empuje extra de deriva. Compartido por AtmosphereFlightSystem (jitter/shake) y las fuerzas de clima.
 */
export const ATMOSPHERE_TURBULENCE_SHAKE_THRESHOLD = 0.4;

/** Límites de iluminación por clima (compartidos por GameEngine y AtmosphereSceneManager). */
export const WEATHER_LIGHT_MIN = 0.55;
export const WEATHER_LIGHT_MAX = 1.05;

interface WeatherLightingInput {
  visibilityMultiplier?: number;
  intensity?: number;
  eventType?: string;
}

/**
 * Parte COMÚN del factor de iluminación por clima (lerp por visibilidad + ajuste por evento),
 * SIN el clamp final. Antes estaba duplicada (y divergente en el clamp superior) entre
 * `GameEngine.computeWeatherLightingTarget` y `AtmosphereSceneManager.computeLightingFactor`.
 * Cada consumidor aplica su propio clamp final, así que el comportamiento se preserva exactamente.
 */
export function weatherLightingBase(weather: WeatherLightingInput | null): number {
  if (!weather) {
    return 1;
  }
  const visibility = clamp(weather.visibilityMultiplier ?? 1, 0, 1);
  const intensity = clamp(weather.intensity ?? 0, 0, 1);
  let factor = lerpScalar(WEATHER_LIGHT_MAX, WEATHER_LIGHT_MIN, 1 - visibility);
  switch (weather.eventType) {
    case 'dust_storm':
      factor -= 0.18 * intensity;
      break;
    case 'thunderstorm':
      factor -= 0.22 * intensity;
      break;
    case 'dense_fog':
    case 'rain':
    case 'light_fog':
      factor -= 0.14 * intensity;
      break;
    case 'meteor_shower':
      factor += 0.06 * intensity;
      break;
    default:
      factor -= 0.08 * intensity;
      break;
  }
  return factor;
}
