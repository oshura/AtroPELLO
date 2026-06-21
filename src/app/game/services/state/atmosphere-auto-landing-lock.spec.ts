import { AtmosphereAutoLandingLock, AtmosphereAutoLandingLockHost } from './atmosphere-auto-landing-lock';

function makeHost(opts: { sceneActive?: boolean; ship?: boolean; takeoff?: boolean; altitude?: number } = {}) {
  const host: AtmosphereAutoLandingLockHost = {
    isAtmosphereSceneActive: () => opts.sceneActive ?? true,
    hasSpaceship: () => opts.ship ?? true,
    isTakeoffSequenceActive: () => opts.takeoff ?? false,
    computeAltitudeAboveGround: () => opts.altitude ?? 0,
    logDebug: () => {},
  };
  return host;
}

describe('AtmosphereAutoLandingLock', () => {
  it('enable activa el cerrojo; isLocked true mientras se cumplen las condiciones', () => {
    const lock = new AtmosphereAutoLandingLock();
    lock.enable(makeHost(), 'auto-touchdown');
    expect(lock.isLocked(makeHost({ altitude: 10 }))).toBe(true);
  });

  it('isLocked es false si no se ha activado', () => {
    expect(new AtmosphereAutoLandingLock().isLocked(makeHost())).toBe(false);
  });

  it('isLocked libera si la escena no está activa', () => {
    const lock = new AtmosphereAutoLandingLock();
    lock.enable(makeHost(), 'x');
    expect(lock.isLocked(makeHost({ sceneActive: false }))).toBe(false);
    expect(lock.isLocked(makeHost())).toBe(false); // ya liberado
  });

  it('isLocked libera durante el despegue', () => {
    const lock = new AtmosphereAutoLandingLock();
    lock.enable(makeHost(), 'x');
    expect(lock.isLocked(makeHost({ takeoff: true }))).toBe(false);
  });

  it('isLocked libera al superar el umbral de altitud (120)', () => {
    const lock = new AtmosphereAutoLandingLock();
    lock.enable(makeHost(), 'x');
    expect(lock.isLocked(makeHost({ altitude: 119 }))).toBe(true);
    expect(lock.isLocked(makeHost({ altitude: 120 }))).toBe(false);
  });

  it('clear libera el cerrojo', () => {
    const lock = new AtmosphereAutoLandingLock();
    lock.enable(makeHost(), 'x');
    lock.clear(makeHost(), 'manual');
    expect(lock.isLocked(makeHost())).toBe(false);
  });
});
