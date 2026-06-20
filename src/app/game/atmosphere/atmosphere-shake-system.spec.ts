import { AtmosphereShakeSystem } from './atmosphere-shake-system';
import { AtmosphereFlightHost } from './atmosphere-flight-system';
import { AtmosphereWeatherEffectsState } from './atmosphere-weather-effects-system';
import { Vector3 } from '../../types/game.types';
import { Spaceship } from '../game-objects';
import { Camera } from '../Camera';

function makeWeather(overrides: Partial<AtmosphereWeatherEffectsState> = {}): AtmosphereWeatherEffectsState {
  return {
    active: true,
    visibilityCurrent: 1,
    visibilityTarget: 1,
    lightingCurrent: 1,
    lightingTarget: 1,
    turbulenceCurrent: 0,
    driftVector: { x: 0, y: 0, z: 0 },
    driftOffset: { x: 0, y: 0, z: 0 },
    impactVolumeMultiplier: 1,
    eventType: 'clear',
    updatedAtMs: 0,
    ...overrides,
  };
}

interface Knobs {
  sceneActive: boolean;
  shield: boolean;
  cameraHold: boolean;
  stabilityScale: number;
  altitude: number;
  up: Vector3 | null;
  weather: AtmosphereWeatherEffectsState;
}

function setup(partial: Partial<Knobs> = {}) {
  const knobs: Knobs = {
    sceneActive: true,
    shield: false,
    cameraHold: false,
    stabilityScale: 1,
    altitude: 45,
    up: { x: 0, y: 1, z: 0 },
    weather: makeWeather(),
    ...partial,
  };
  const ship = {
    externalForces: { x: 0, y: 0, z: 0 },
    forwardDirection: { x: 0, y: 0, z: 1 },
  };
  const camera = {
    position: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 0, z: 10 },
    up: { x: 0, y: 1, z: 0 },
    markDirty: jasmine.createSpy('markDirty'),
  };
  const host: AtmosphereFlightHost = {
    getSpaceship: () => ship as unknown as Spaceship,
    getCamera: () => camera as unknown as Camera,
    getWeatherEffects: () => knobs.weather,
    isAtmosphereSceneActive: () => knobs.sceneActive,
    isAtmosphereLandingCinematicShieldActive: () => knobs.shield,
    isLandingCinematicCameraHoldActive: () => knobs.cameraHold,
    getAtmosphereStabilityForceScale: () => knobs.stabilityScale,
    computeAltitudeAboveGround: () => knobs.altitude,
    computeAtmosphereUpVector: () => knobs.up,
    getNowMs: () => 1000,
    isAtmosphereStabilityActive: () => false,
    isAtmosphereSceneStateActive: () => true,
    getAtmosphereGroundContactActive: () => false,
    getAtmosphereGravityContext: () => null,
    isAtmosphereGravityLandingHold: () => false,
  };
  return { sys: new AtmosphereShakeSystem(), host, ship, camera, knobs };
}

describe('AtmosphereShakeSystem', () => {
  describe('applyShipJitter', () => {
    it('con turbulencia fuerte sacude la nave (aplica fuerza)', () => {
      const { sys, host, ship } = setup({ weather: makeWeather({ active: true, turbulenceCurrent: 0.9 }) });
      sys.applyShipJitter(0.1, host);
      sys.applyShipJitter(0.1, host);
      const magnitude = Math.abs(ship.externalForces.x) + Math.abs(ship.externalForces.y) + Math.abs(ship.externalForces.z);
      expect(magnitude).toBeGreaterThan(0);
    });

    it('sin turbulencia no sacude', () => {
      const { sys, host, ship } = setup({ weather: makeWeather({ active: true, turbulenceCurrent: 0 }) });
      sys.applyShipJitter(0.1, host);
      sys.applyShipJitter(0.1, host);
      expect(ship.externalForces.x).toBe(0);
      expect(ship.externalForces.y).toBe(0);
      expect(ship.externalForces.z).toBe(0);
    });
  });

  describe('applyCameraJitter', () => {
    it('con turbulencia fuerte sacude la cámara (la marca como sucia)', () => {
      const { sys, host, camera } = setup({ weather: makeWeather({ active: true, turbulenceCurrent: 0.9 }) });
      for (let i = 0; i < 6; i++) {
        sys.applyCameraJitter(0.1, host);
      }
      expect(camera.markDirty).toHaveBeenCalled();
    });

    it('con el escudo cinemático no toca la cámara', () => {
      const { sys, host, camera } = setup({ shield: true, weather: makeWeather({ active: true, turbulenceCurrent: 0.9 }) });
      sys.applyCameraJitter(0.1, host);
      expect(camera.markDirty).not.toHaveBeenCalled();
    });

    it('con la cámara cinemática retenida no la toca', () => {
      const { sys, host, camera } = setup({ cameraHold: true, weather: makeWeather({ active: true, turbulenceCurrent: 0.9 }) });
      sys.applyCameraJitter(0.1, host);
      expect(camera.markDirty).not.toHaveBeenCalled();
    });
  });
});
