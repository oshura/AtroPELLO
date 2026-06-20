import {
  AtmosphereWeatherEffectsSystem,
  AtmosphereWeatherEffectsHost,
} from './atmosphere-weather-effects-system';
import { AtmosphereWeatherSnapshot } from './AtmosphereWeatherService';

function makeSnapshot(overrides: Partial<AtmosphereWeatherSnapshot> = {}): AtmosphereWeatherSnapshot {
  return {
    eventType: 'clear',
    intensity: 0,
    visibilityMultiplier: 1,
    turbulenceStrength: 0,
    driftVector: { x: 0, y: 0, z: 0 },
    impactVolumeMultiplier: 1,
    audioCue: null,
    precipitation: 'none',
    lightningChance: 0,
    startedAtMs: 0,
    etaMs: 0,
    layerId: 'test',
    layerLabel: 'Test',
    layerBounds: { min: 0, max: 100 },
    ...overrides,
  };
}

interface HostHandle {
  host: AtmosphereWeatherEffectsHost;
  warn: jasmine.Spy;
  setActive(active: boolean): void;
}

function makeHost(active = true): HostHandle {
  let sceneActive = active;
  const warn = jasmine.createSpy('emitImpactAbsorptionWarning');
  return {
    host: {
      isAtmosphereSceneActive: () => sceneActive,
      emitImpactAbsorptionWarning: warn,
    },
    warn,
    setActive: (value: boolean) => { sceneActive = value; },
  };
}

describe('AtmosphereWeatherEffectsSystem', () => {
  it('reset() deja el estado y el overlay en valores neutros', () => {
    const sys = new AtmosphereWeatherEffectsSystem();
    sys.overlayAlpha = 0.5;
    sys.impactAbsorptionActive = true;
    sys.effects.active = true;

    sys.reset();

    expect(sys.effects.active).toBe(false);
    expect(sys.effects.visibilityCurrent).toBe(1);
    expect(sys.effects.lightingCurrent).toBe(1);
    expect(sys.effects.impactVolumeMultiplier).toBe(1);
    expect(sys.overlayAlpha).toBe(0);
    expect(sys.overlayColor).toEqual([0, 0, 0]);
    expect(sys.impactAbsorptionActive).toBe(false);
  });

  it('update(null) mantiene la escena inactiva y no avisa', () => {
    const sys = new AtmosphereWeatherEffectsSystem();
    const { host, warn } = makeHost(true);

    sys.update(5, null, host);

    expect(sys.effects.active).toBe(false);
    expect(sys.effects.eventType).toBe('clear');
    expect(sys.effects.lightingCurrent).toBeCloseTo(1, 5);
    expect(sys.overlayAlpha).toBeCloseTo(0, 5);
    expect(warn).not.toHaveBeenCalled();
  });

  it('update con tormenta de polvo activa el clima, oscurece y tiñe el overlay', () => {
    const sys = new AtmosphereWeatherEffectsSystem();
    const { host } = makeHost(true);
    const snapshot = makeSnapshot({
      eventType: 'dust_storm',
      intensity: 1,
      visibilityMultiplier: 0.5,
    });

    sys.update(5, snapshot, host); // dt grande ⇒ converge casi al objetivo

    expect(sys.effects.active).toBe(true);
    expect(sys.effects.eventType).toBe('dust_storm');
    // base: lerp(1.05,0.55,0.5)=0.8, menos 0.18 por la tormenta ⇒ ~0.62
    expect(sys.effects.lightingCurrent).toBeLessThan(0.7);
    expect(sys.effects.lightingCurrent).toBeGreaterThan(0.55);
    // overlay dust_storm: 0.3 + 0.45*1 = 0.75
    expect(sys.overlayAlpha).toBeGreaterThan(0.7);
    expect(sys.overlayColor[0]).toBeGreaterThan(sys.overlayColor[2]); // tono cálido/arena
  });

  it('getImpactVolumeScale: 1 fuera de escena, acotado dentro', () => {
    const sys = new AtmosphereWeatherEffectsSystem();
    const handle = makeHost(false);

    expect(sys.getImpactVolumeScale(handle.host)).toBe(1);

    handle.setActive(true);
    sys.effects.impactVolumeMultiplier = 5; // fuera de rango
    expect(sys.getImpactVolumeScale(handle.host)).toBe(1.2);
    sys.effects.impactVolumeMultiplier = 0.05;
    expect(sys.getImpactVolumeScale(handle.host)).toBe(0.1);
  });

  it('avisa una sola vez al cruzar el umbral de absorción de impactos', () => {
    const sys = new AtmosphereWeatherEffectsSystem();
    const { host, warn } = makeHost(true);
    const absorbing = makeSnapshot({ eventType: 'dense_fog', intensity: 1, impactVolumeMultiplier: 0.1 });

    sys.update(5, absorbing, host);
    expect(sys.impactAbsorptionActive).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);

    sys.update(5, absorbing, host); // sigue absorbiendo ⇒ no repite el aviso
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('no avisa de absorción si la escena no está activa', () => {
    const sys = new AtmosphereWeatherEffectsSystem();
    const { host, warn } = makeHost(false);
    const absorbing = makeSnapshot({ impactVolumeMultiplier: 0.1 });

    sys.update(5, absorbing, host);

    expect(sys.impactAbsorptionActive).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
