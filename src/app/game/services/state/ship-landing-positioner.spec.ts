import { ShipLandingPositioner, ShipLandingHost, ShipKineticsSnapshot } from './ship-landing-positioner';
import { Spaceship, ThrusterState } from '../../game-objects/Spaceship';
import { Vector3 } from '../../../types/game.types';

function makeShip() {
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 1, y: 2, z: 3 },
    angularVelocity: { x: 9, y: 9, z: 9 },
    currentSpeed: 4,
    targetSpeed: 5,
    maxSpeed: 10,
    isThrusting: true,
    thrusterState: ThrusterState.ACCELERATING,
    forwardDirection: { x: 0, y: 0, z: 1 },
    boundingSphere: { center: { x: 0, y: 0, z: 0 }, radius: 1 },
    updateModelMatrix: jasmine.createSpy('updateModelMatrix'),
    resetVoidEnergyBaseline: jasmine.createSpy('resetVoidEnergyBaseline'),
  };
}

type FakeShip = ReturnType<typeof makeShip>;

function makeHost(ship: FakeShip | null) {
  const state = { lastShipPos: null as Vector3 | null };
  const host: ShipLandingHost = {
    getSpaceship: () => (ship ? (ship as unknown as Spaceship) : null),
    setLastShipPos: (pos) => { state.lastShipPos = pos; },
  };
  return { host, state };
}

describe('ShipLandingPositioner', () => {
  it('placeShipAtPosition teletransporta y resetea la cinética', () => {
    const ship = makeShip();
    const { host, state } = makeHost(ship);
    new ShipLandingPositioner().placeShipAtPosition(host, { x: 10, y: 20, z: 30 });

    expect(ship.position).toEqual({ x: 10, y: 20, z: 30 });
    expect(ship.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(ship.currentSpeed).toBe(0);
    expect(ship.targetSpeed).toBe(0);
    expect(ship.isThrusting).toBe(false);
    expect(ship.thrusterState).toBe(ThrusterState.IDLE);
    expect(ship.updateModelMatrix).toHaveBeenCalled();
    expect(ship.boundingSphere.center).toEqual({ x: 10, y: 20, z: 30 });
    expect(state.lastShipPos).toEqual({ x: 10, y: 20, z: 30 });
    expect(ship.resetVoidEnergyBaseline).toHaveBeenCalled();
  });

  it('captureKinetics copia el estado y restoreKinetics reconstruye el avance', () => {
    const ship = makeShip();
    const { host } = makeHost(ship);
    const pos = new ShipLandingPositioner();
    const snap = pos.captureKinetics(host);
    expect(snap).toEqual({
      velocity: { x: 1, y: 2, z: 3 },
      currentSpeed: 4,
      targetSpeed: 5,
      thrusterState: ThrusterState.ACCELERATING,
      isThrusting: true,
    });

    // Velocidad nula + ensureForwardVelocity ⇒ se reconstruye a lo largo del forward
    const stopped: ShipKineticsSnapshot = {
      velocity: { x: 0, y: 0, z: 0 }, currentSpeed: 6, targetSpeed: 6,
      thrusterState: ThrusterState.IDLE, isThrusting: false,
    };
    pos.restoreKinetics(host, stopped, { ensureForwardVelocity: true });
    expect(ship.velocity).toEqual({ x: 0, y: 0, z: 6 });
    expect(ship.currentSpeed).toBe(6);
  });

  it('captureKinetics devuelve null sin nave', () => {
    const { host } = makeHost(null);
    expect(new ShipLandingPositioner().captureKinetics(host)).toBeNull();
  });
});
