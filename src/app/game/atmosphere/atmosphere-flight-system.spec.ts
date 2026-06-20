import { AtmosphereFlightSystem, AtmosphereFlightHost, AtmosphereGravityContext } from './atmosphere-flight-system';
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
  sceneStateActive: boolean;
  shield: boolean;
  cameraHold: boolean;
  stabilityActive: boolean;
  groundContact: boolean;
  stabilityScale: number;
  altitude: number;
  up: Vector3 | null;
  nowMs: number;
  weather: AtmosphereWeatherEffectsState;
  gravityContext: AtmosphereGravityContext | null;
  gravityLandingHold: boolean;
}

function makeShip() {
  return {
    position: { x: 0, y: 0, z: 0 },
    externalForces: { x: 0, y: 0, z: 0 },
    currentSpeed: 1.5,
    targetSpeed: 10,
    forwardDirection: { x: 0, y: 0, z: 1 },
    resetAtmosphereSpeedControlGain: jasmine.createSpy('resetGain'),
    setAtmosphereSpeedControlGain: jasmine.createSpy('setGain'),
  };
}

function makeCamera() {
  return {
    position: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 0, z: 10 },
    up: { x: 0, y: 1, z: 0 },
    markDirty: jasmine.createSpy('markDirty'),
  };
}

function setup(partial: Partial<Knobs> = {}) {
  const knobs: Knobs = {
    sceneActive: true,
    sceneStateActive: true,
    shield: false,
    cameraHold: false,
    stabilityActive: false,
    groundContact: false,
    stabilityScale: 1,
    altitude: 45,
    up: { x: 0, y: 1, z: 0 },
    nowMs: 1000,
    weather: makeWeather(),
    gravityContext: null,
    gravityLandingHold: false,
    ...partial,
  };
  const ship = makeShip();
  const camera = makeCamera();
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
    getNowMs: () => knobs.nowMs,
    isAtmosphereStabilityActive: () => knobs.stabilityActive,
    isAtmosphereSceneStateActive: () => knobs.sceneStateActive,
    getAtmosphereGroundContactActive: () => knobs.groundContact,
    getAtmosphereGravityContext: () => knobs.gravityContext,
    isAtmosphereGravityLandingHold: () => knobs.gravityLandingHold,
  };
  return { sys: new AtmosphereFlightSystem(), host, ship, camera, knobs };
}

describe('AtmosphereFlightSystem', () => {
  describe('applyAutoVector', () => {
    it('en la banda de sustentación sube y empuja hacia arriba', () => {
      const { sys, host, ship } = setup({ altitude: 45 });
      sys.applyAutoVector(0.1, host);
      expect(sys.autoVectorCurrent).toBeGreaterThan(0);
      expect(ship.externalForces.y).toBeGreaterThan(0);
      expect(sys.autoVectorTelemetry?.targetLift).toBeGreaterThan(0);
    });

    it('con contacto con el suelo se suprime y arma el temporizador', () => {
      const { sys, host, ship } = setup({ groundContact: true, nowMs: 1000 });
      sys.autoVectorCurrent = 0.8;
      sys.applyAutoVector(0.1, host);
      expect(sys.autoVectorCurrent).toBeLessThan(0.8); // decae hacia 0
      expect(sys.autoVectorTelemetry?.targetLift).toBe(0);
      expect(sys.autoVectorSuppressedUntilMs).toBe(1000 + 450);
      expect(ship.externalForces.y).toBe(0);
    });

    it('con el escudo cinemático activo no hace nada', () => {
      const { sys, host, ship } = setup({ shield: true });
      sys.autoVectorCurrent = 0.5;
      sys.applyAutoVector(0.1, host);
      expect(sys.autoVectorCurrent).toBe(0);
      expect(ship.externalForces.y).toBe(0);
    });

    it('muy por encima de la banda no aplica sustentación', () => {
      const { sys, host, ship } = setup({ altitude: 500 });
      sys.applyAutoVector(0.1, host);
      expect(sys.autoVectorTelemetry?.targetLift).toBe(0);
      expect(ship.externalForces.y).toBe(0);
    });
  });

  describe('applyDragAndAcceleration', () => {
    it('reduce la velocidad objetivo y fija la ganancia de control', () => {
      const { sys, host, ship } = setup({ weather: makeWeather({ turbulenceCurrent: 0.5 }) });
      sys.applyDragAndAcceleration(0.1, host);
      expect(ship.targetSpeed).toBeLessThan(10);
      expect(ship.setAtmosphereSpeedControlGain).toHaveBeenCalled();
      const gain = ship.setAtmosphereSpeedControlGain.calls.mostRecent().args[0];
      expect(gain).toBeGreaterThanOrEqual(0.4);
      expect(gain).toBeLessThanOrEqual(1);
    });

    it('fuera de la escena atmosférica resetea la ganancia y no frena', () => {
      const { sys, host, ship } = setup({ sceneStateActive: false });
      sys.applyDragAndAcceleration(0.1, host);
      expect(ship.targetSpeed).toBe(10);
      expect(ship.resetAtmosphereSpeedControlGain).toHaveBeenCalled();
    });
  });

  describe('applyWeatherForces', () => {
    it('con clima activo aplica fuerza de deriva a la nave', () => {
      const { sys, host, ship } = setup({
        weather: makeWeather({ active: true, turbulenceCurrent: 0.5, driftVector: { x: 1, y: 0, z: 0 } }),
      });
      sys.applyWeatherForces(0.1, host);
      expect(sys.driftForceApplied.x).not.toBe(0);
      expect(ship.externalForces.x).not.toBe(0);
    });

    it('con el escudo cinemático no aplica deriva y resetea', () => {
      const { sys, host, ship } = setup({ shield: true });
      sys.applyWeatherForces(0.1, host);
      expect(sys.driftForceApplied).toEqual({ x: 0, y: 0, z: 0 });
      expect(ship.externalForces.x).toBe(0);
    });
  });

  describe('applyGravity', () => {
    const dome: AtmosphereGravityContext = { center: { x: 0, y: 0, z: 0 }, groundRadius: 100, skyRadius: 1100 };

    it('dentro del domo tira de la nave hacia el centro', () => {
      const { sys, host, ship } = setup({ gravityContext: dome, altitude: 45 });
      ship.position = { x: 0, y: 105, z: 0 }; // justo sobre el suelo, dentro del domo
      sys.applyGravity(0.1, host);
      expect(sys.gravityTelemetry).not.toBeNull();
      expect(sys.gravityTelemetry!.finalGravity).toBeGreaterThan(0);
      expect(ship.externalForces.y).toBeLessThan(0); // hacia el centro (abajo)
    });

    it('sin contexto de escena no hace nada', () => {
      const { sys, host, ship } = setup({ gravityContext: null });
      sys.applyGravity(0.1, host);
      expect(sys.gravityTelemetry).toBeNull();
      expect(ship.externalForces.y).toBe(0);
    });

    it('con panel de aterrizaje retenido reporta gravedad 0 y no empuja', () => {
      const { sys, host, ship } = setup({ gravityContext: dome, gravityLandingHold: true });
      ship.position = { x: 0, y: 105, z: 0 };
      sys.applyGravity(0.1, host);
      expect(sys.gravityTelemetry?.finalGravity).toBe(0);
      expect(ship.externalForces.y).toBe(0);
    });

    it('por encima del domo no aplica gravedad', () => {
      const { sys, host, ship } = setup({ gravityContext: dome });
      ship.position = { x: 0, y: 2000, z: 0 }; // shellAltitude 1900 > grosor 1000
      sys.applyGravity(0.1, host);
      expect(sys.gravityTelemetry?.gravityPerSecond).toBe(0);
      expect(ship.externalForces.y).toBe(0);
    });
  });
});
