import { AtmosphereAutoTakeoff, AtmosphereAutoTakeoffHost } from './atmosphere-auto-takeoff';

function makeHost(opts: {
  sceneActive?: boolean; exitActive?: boolean; landing?: boolean; takeoff?: boolean;
  touchdown?: boolean; altitude?: number; exitStarted?: boolean;
} = {}) {
  const spies = { exit: jasmine.createSpy('startAtmosphereExitSequence').and.returnValue(opts.exitStarted ?? true) };
  const host: AtmosphereAutoTakeoffHost = {
    isAtmosphereSceneActive: () => opts.sceneActive ?? true,
    isAtmosphereExitTransitionActive: () => opts.exitActive ?? false,
    isLandingSequenceActive: () => opts.landing ?? false,
    isTakeoffSequenceActive: () => opts.takeoff ?? false,
    hasLandingTouchdownContext: () => opts.touchdown ?? true,
    computeAltitudeAboveGround: () => opts.altitude ?? 0,
    startAtmosphereExitSequence: spies.exit,
    logInfo: () => {},
    logWarn: () => {},
  };
  return { host, spies };
}

describe('AtmosphereAutoTakeoff', () => {
  it('no dispara si no está armado', () => {
    const { host, spies } = makeHost({ altitude: 2000 });
    new AtmosphereAutoTakeoff().maybeTrigger(host);
    expect(spies.exit).not.toHaveBeenCalled();
  });

  it('dispara la salida al superar el umbral de altitud (1000) estando armado', () => {
    const t = new AtmosphereAutoTakeoff();
    t.arm();
    const { host, spies } = makeHost({ altitude: 1500 });
    t.maybeTrigger(host);
    expect(spies.exit).toHaveBeenCalledWith('auto');
    expect(t.isArmed).toBe(false); // se desarma al disparar
  });

  it('NO dispara por debajo del umbral', () => {
    const t = new AtmosphereAutoTakeoff();
    t.arm();
    const { host, spies } = makeHost({ altitude: 999 });
    t.maybeTrigger(host);
    expect(spies.exit).not.toHaveBeenCalled();
    expect(t.isArmed).toBe(true);
  });

  it('NO dispara durante landing/takeoff/exit o sin touchdown context', () => {
    const cases = [
      { landing: true }, { takeoff: true }, { exitActive: true }, { touchdown: false }, { sceneActive: false },
    ];
    for (const c of cases) {
      const t = new AtmosphereAutoTakeoff();
      t.arm();
      const { host, spies } = makeHost({ altitude: 2000, ...c });
      t.maybeTrigger(host);
      expect(spies.exit).not.toHaveBeenCalled();
    }
  });

  it('disarm desarma', () => {
    const t = new AtmosphereAutoTakeoff();
    t.arm();
    t.disarm();
    const { host, spies } = makeHost({ altitude: 2000 });
    t.maybeTrigger(host);
    expect(spies.exit).not.toHaveBeenCalled();
  });
});
