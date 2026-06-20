import { InputLockGuard, CameraTakeover, ShipDynamicsScope, CameraLike, ShipDynamicsLike } from './animation-tools';
import { CameraMode } from '../../Camera';

describe('InputLockGuard', () => {
  it('lock añade 3 capturadores y release los quita', () => {
    const add = spyOn(document, 'addEventListener').and.callThrough();
    const remove = spyOn(document, 'removeEventListener').and.callThrough();
    const guard = new InputLockGuard();

    guard.lock();
    expect(guard.isLocked).toBe(true);
    expect(add).toHaveBeenCalledTimes(3); // keydown/keyup/keypress

    guard.release();
    expect(guard.isLocked).toBe(false);
    expect(remove).toHaveBeenCalledTimes(3);
  });

  it('lock es idempotente (no duplica capturadores)', () => {
    const add = spyOn(document, 'addEventListener').and.callThrough();
    const guard = new InputLockGuard();
    guard.lock();
    guard.lock();
    expect(add).toHaveBeenCalledTimes(3);
    guard.release();
  });
});

function makeCamera() {
  let mode: CameraMode = CameraMode.COCKPIT;
  return {
    cam: {
      getCurrentMode: () => mode,
      setCameraMode: (m: CameraMode) => { mode = m; },
    } as CameraLike,
    get mode() { return mode; },
  };
}

describe('CameraTakeover', () => {
  it('take guarda el modo previo y restore lo recupera', () => {
    const { cam } = makeCamera(); // empieza en COCKPIT
    const t = new CameraTakeover();
    t.take(cam, CameraMode.INMOVILE_EXTERNAL);
    expect(cam.getCurrentMode!()).toBe(CameraMode.INMOVILE_EXTERNAL);
    t.restore(cam);
    expect(cam.getCurrentMode!()).toBe(CameraMode.COCKPIT);
  });

  it('setMode asFinal hace que restore deje el modo final, no el previo', () => {
    const { cam } = makeCamera();
    const t = new CameraTakeover();
    t.take(cam, CameraMode.INMOVILE_EXTERNAL);
    t.setMode(cam, CameraMode.COCKPIT, true);
    t.restore(cam);
    expect(cam.getCurrentMode!()).toBe(CameraMode.COCKPIT);
  });

  it('restore sin take es no-op', () => {
    const { cam } = makeCamera();
    const t = new CameraTakeover();
    t.restore(cam);
    expect(cam.getCurrentMode!()).toBe(CameraMode.COCKPIT);
  });
});

describe('ShipDynamicsScope', () => {
  function makeShip(): ShipDynamicsLike {
    return { acceleration: 2, deceleration: 2.5, maxSpeed: 5, voidEnergyPaused: false, voidEnergyCurrent: 80 };
  }

  it('capture+restore preserva la dinámica original', () => {
    const ship = makeShip();
    const scope = new ShipDynamicsScope();
    scope.capture(ship, true);
    expect(ship.voidEnergyPaused).toBe(true);
    ship.acceleration = 150;
    ship.deceleration = 200;
    ship.maxSpeed = 999;
    ship.voidEnergyCurrent = 0;
    scope.restore(ship);
    expect(ship.acceleration).toBe(2);
    expect(ship.deceleration).toBe(2.5);
    expect(ship.maxSpeed).toBe(5);
    expect(ship.voidEnergyCurrent).toBe(80);
    expect(ship.voidEnergyPaused).toBe(false);
  });

  it('sin pauseVoidEnergy no toca la energía al restaurar', () => {
    const ship = makeShip();
    const scope = new ShipDynamicsScope();
    scope.capture(ship, false);
    ship.acceleration = 99;
    ship.voidEnergyCurrent = 0;
    scope.restore(ship);
    expect(ship.acceleration).toBe(2);
    expect(ship.voidEnergyCurrent).toBe(0); // no se restaura
    expect(ship.voidEnergyPaused).toBe(false);
  });

  it('restore sin capture es no-op', () => {
    const ship = makeShip();
    const scope = new ShipDynamicsScope();
    scope.restore(ship);
    expect(ship.acceleration).toBe(2);
  });
});
