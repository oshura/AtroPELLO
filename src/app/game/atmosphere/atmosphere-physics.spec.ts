import {
  atmosphereGravityScaleForPlanet,
  atmosphereGravitySpeedFactor,
  atmosphereAutoVectorSpeedFactor,
  atmosphereForceAltitudeFactor,
  ATMOSPHERE_AUTO_VECTOR_MIN_FACTOR,
  weatherLightingBase,
  WEATHER_LIGHT_MIN,
  WEATHER_LIGHT_MAX,
} from './atmosphere-physics';
import { PlanetType } from '../game-objects/Planet';

describe('atmosphere-physics', () => {
  it('atmosphereGravityScaleForPlanet por tipo', () => {
    expect(atmosphereGravityScaleForPlanet(PlanetType.Protoplanet)).toBe(0);
    expect(atmosphereGravityScaleForPlanet(PlanetType.Dwarf)).toBe(1);
    expect(atmosphereGravityScaleForPlanet(PlanetType.Ringed)).toBe(5);
    expect(atmosphereGravityScaleForPlanet(PlanetType.Giant)).toBe(10);
    expect(atmosphereGravityScaleForPlanet(undefined)).toBe(3); // default
  });

  it('atmosphereGravitySpeedFactor atenúa con la velocidad', () => {
    expect(atmosphereGravitySpeedFactor(0)).toBe(1);
    expect(atmosphereGravitySpeedFactor(-5)).toBe(1);
    expect(atmosphereGravitySpeedFactor(3)).toBeCloseTo(0.35, 6); // umbral suave
    expect(atmosphereGravitySpeedFactor(5)).toBe(0); // umbral cero
    expect(atmosphereGravitySpeedFactor(100)).toBe(0);
    // entre 3 y 5 decrece de 0.35 a 0
    expect(atmosphereGravitySpeedFactor(4)).toBeLessThan(0.35);
    expect(atmosphereGravitySpeedFactor(4)).toBeGreaterThan(0);
  });

  it('atmosphereAutoVectorSpeedFactor crece con la velocidad', () => {
    expect(atmosphereAutoVectorSpeedFactor(0)).toBe(ATMOSPHERE_AUTO_VECTOR_MIN_FACTOR);
    expect(atmosphereAutoVectorSpeedFactor(0.35)).toBe(ATMOSPHERE_AUTO_VECTOR_MIN_FACTOR);
    expect(atmosphereAutoVectorSpeedFactor(2.6)).toBe(1);
    expect(atmosphereAutoVectorSpeedFactor(10)).toBe(1);
    const mid = atmosphereAutoVectorSpeedFactor(1.5);
    expect(mid).toBeGreaterThan(ATMOSPHERE_AUTO_VECTOR_MIN_FACTOR);
    expect(mid).toBeLessThan(1);
  });

  it('atmosphereForceAltitudeFactor decrece con la altitud y se acota', () => {
    // A alt 0: normalized = 1 → clamp(1, 0.35, 1.05) = 1 (el cap 1.05 nunca se alcanza, normalized ≤ 1).
    expect(atmosphereForceAltitudeFactor(0)).toBe(1);
    expect(atmosphereForceAltitudeFactor(750)).toBeCloseTo(0.35, 6); // 1 - 1 = 0 → clamp 0.35
    expect(atmosphereForceAltitudeFactor(10000)).toBe(0.35);
    expect(atmosphereForceAltitudeFactor(-5)).toBe(1); // altitud negativa se trata como 0
    const mid = atmosphereForceAltitudeFactor(300);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(0.35);
  });

  describe('weatherLightingBase (parte común, sin clamp final)', () => {
    it('sin clima devuelve 1', () => {
      expect(weatherLightingBase(null)).toBe(1);
    });

    it('plena visibilidad y sin evento da el máximo de iluminación', () => {
      // visibility 1 ⇒ factor base = WEATHER_LIGHT_MAX; default event resta 0.08*0 = 0.
      expect(weatherLightingBase({ visibilityMultiplier: 1, intensity: 0 })).toBeCloseTo(WEATHER_LIGHT_MAX, 6);
    });

    it('baja visibilidad reduce hacia el mínimo', () => {
      expect(weatherLightingBase({ visibilityMultiplier: 0, intensity: 0 })).toBeCloseTo(WEATHER_LIGHT_MIN, 6);
    });

    it('eventos de tormenta restan más que la niebla', () => {
      const storm = weatherLightingBase({ visibilityMultiplier: 1, intensity: 1, eventType: 'thunderstorm' });
      const fog = weatherLightingBase({ visibilityMultiplier: 1, intensity: 1, eventType: 'dense_fog' });
      expect(storm).toBeLessThan(fog);
      expect(WEATHER_LIGHT_MAX - storm).toBeCloseTo(0.22, 6);
    });

    it('meteor_shower SUMA luz (puede superar el máximo antes del clamp del consumidor)', () => {
      const meteor = weatherLightingBase({ visibilityMultiplier: 1, intensity: 1, eventType: 'meteor_shower' });
      expect(meteor).toBeGreaterThan(WEATHER_LIGHT_MAX);
    });
  });
});
