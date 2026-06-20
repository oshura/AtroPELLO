import {
  classifyAtmosphereTurbulence,
  getAtmosphereWeatherDisplayLabel,
  buildAtmosphereTelemetryPayload,
  buildAtmosphereTelemetryPanelState,
  AtmosphereTelemetryInput,
} from './atmosphere-telemetry';
import { AtmosphereWeatherSnapshot } from './AtmosphereWeatherService';
import { LandingApproachContext } from '../types/landing.types';

function payloadInput(overrides: Partial<AtmosphereTelemetryInput> = {}): AtmosphereTelemetryInput {
  return {
    active: true,
    visibilityCurrent: 1,
    turbulenceCurrent: 0,
    eventType: 'clear',
    driftVector: { x: 0, y: 0, z: 0 },
    altitude: 100,
    altitudeFactor: 1,
    autoVectorCurrent: 1,
    autoVectorBandMin: 30,
    ...overrides,
  };
}

function makeWeather(overrides: Partial<AtmosphereWeatherSnapshot> = {}): AtmosphereWeatherSnapshot {
  return {
    eventType: 'rain',
    intensity: 0.5,
    visibilityMultiplier: 0.8,
    turbulenceStrength: 0.3,
    driftVector: { x: 0, y: 0, z: 0 },
    impactVolumeMultiplier: 1,
    audioCue: null,
    precipitation: 'rain',
    lightningChance: 0,
    startedAtMs: 0,
    etaMs: 1000,
    layerId: 'L1',
    layerLabel: 'Capa 1',
    layerBounds: { min: 0, max: 100 },
    ...overrides,
  };
}

function makeContext(overrides: Partial<LandingApproachContext> = {}): LandingApproachContext {
  const base: Partial<LandingApproachContext> = {
    distanceToSurface: 5,
    planetId: 'planet-x',
    planetName: 'Planeta X',
    probabilityOfLifePct: 42,
  };
  return { ...base, ...overrides } as LandingApproachContext;
}

describe('atmosphere-telemetry', () => {
  describe('classifyAtmosphereTurbulence', () => {
    it('clasifica por valor o por magnitud de deriva (la que dispare antes)', () => {
      expect(classifyAtmosphereTurbulence(0.8, 0)).toBe('severe');
      expect(classifyAtmosphereTurbulence(0, 4)).toBe('severe');
      expect(classifyAtmosphereTurbulence(0.5, 0)).toBe('moderate');
      expect(classifyAtmosphereTurbulence(0, 2.5)).toBe('moderate');
      expect(classifyAtmosphereTurbulence(0.2, 0)).toBe('light');
      expect(classifyAtmosphereTurbulence(0, 1)).toBe('light');
      expect(classifyAtmosphereTurbulence(0.1, 0.5)).toBe('calm');
    });
  });

  describe('getAtmosphereWeatherDisplayLabel', () => {
    it('mapea los eventos conocidos y humaniza el resto', () => {
      expect(getAtmosphereWeatherDisplayLabel('dense_fog')).toBe('Niebla densa');
      expect(getAtmosphereWeatherDisplayLabel('thunderstorm')).toBe('Tormenta eléctrica');
      expect(getAtmosphereWeatherDisplayLabel('meteor_shower')).toBe('Lluvia de meteoros');
      expect(getAtmosphereWeatherDisplayLabel('algo_raro')).toBe('algo raro');
    });
  });

  describe('buildAtmosphereTelemetryPayload', () => {
    it('clima inactivo ⇒ estabilidad "calm" y sin turbulencia', () => {
      const p = buildAtmosphereTelemetryPayload(payloadInput({ active: false }));
      expect(p.stability).toBe('calm');
      expect(p.turbulence).toBe(0);
      expect(p.visibility).toBe(1);
    });

    it('clima activo tranquilo ⇒ "stable"', () => {
      const p = buildAtmosphereTelemetryPayload(payloadInput({ active: true, turbulenceCurrent: 0.05 }));
      expect(p.stability).toBe('stable');
    });

    it('turbulencia severa ⇒ "unstable"', () => {
      const p = buildAtmosphereTelemetryPayload(payloadInput({ active: true, turbulenceCurrent: 0.9, altitudeFactor: 1 }));
      expect(p.turbulenceSeverity).toBe('severe');
      expect(p.stability).toBe('unstable');
    });

    it('lift bajo cerca del suelo ⇒ "descending"', () => {
      const p = buildAtmosphereTelemetryPayload(payloadInput({
        active: true,
        turbulenceCurrent: 0,
        autoVectorCurrent: 0.1,
        altitude: 10, // < 30 * 0.6 = 18
        autoVectorBandMin: 30,
      }));
      expect(p.stability).toBe('descending');
      expect(p.liftPerSecond).toBe(0.1);
    });

    it('acota visibilidad/turbulencia y calcula la magnitud de deriva', () => {
      const p = buildAtmosphereTelemetryPayload(payloadInput({
        visibilityCurrent: 2,
        turbulenceCurrent: 2,
        altitudeFactor: 1,
        driftVector: { x: 3, y: 0, z: 4 },
      }));
      expect(p.visibility).toBe(1);
      expect(p.turbulence).toBe(1);
      expect(p.drift.magnitude).toBeCloseTo(5, 6);
    });
  });

  describe('buildAtmosphereTelemetryPanelState', () => {
    const telemetry = buildAtmosphereTelemetryPayload(payloadInput());

    it('devuelve null sin contexto o sin telemetría', () => {
      expect(buildAtmosphereTelemetryPanelState({ context: null, telemetry, weather: null, altitudeAboveGround: 0 })).toBeNull();
      expect(buildAtmosphereTelemetryPanelState({ context: makeContext(), telemetry: null, weather: null, altitudeAboveGround: 0 })).toBeNull();
    });

    it('rellena planeta, altitud y clima cuando hay datos', () => {
      const panel = buildAtmosphereTelemetryPanelState({
        context: makeContext({ planetName: 'Yuggoth' }),
        telemetry,
        weather: makeWeather({ eventType: 'dense_fog' }),
        altitudeAboveGround: 120,
      });
      expect(panel).not.toBeNull();
      expect(panel!.planet.name).toBe('Yuggoth');
      expect(panel!.altitudeAboveGround).toBe(120);
      expect(panel!.weather?.label).toBe('Niebla densa');
      expect(panel!.planet.visited).toBe(false); // sin planetIntel
    });

    it('acumula avisos por inestabilidad, visibilidad baja y descargas frecuentes', () => {
      const unstable = buildAtmosphereTelemetryPayload(payloadInput({
        active: true,
        turbulenceCurrent: 0.9,
        visibilityCurrent: 0.2,
      }));
      const panel = buildAtmosphereTelemetryPanelState({
        context: makeContext(),
        telemetry: unstable,
        weather: makeWeather({ lightningChance: 0.6 }),
        altitudeAboveGround: 50,
      });
      expect(panel!.warnings).toContain('Inestabilidad severa');
      expect(panel!.warnings).toContain('Visibilidad crítica');
      expect(panel!.warnings).toContain('Descargas frecuentes');
    });

    it('sin clima ⇒ weather null', () => {
      const panel = buildAtmosphereTelemetryPanelState({
        context: makeContext(),
        telemetry,
        weather: null,
        altitudeAboveGround: 10,
      });
      expect(panel!.weather).toBeNull();
    });
  });
});
