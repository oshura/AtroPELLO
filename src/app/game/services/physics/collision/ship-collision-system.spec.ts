import { ShipCollisionHost, ShipCollisionSystem } from './ship-collision-system';
import { GameObject } from '../../../GameObject';
import { Spaceship } from '../../../game-objects';
import { GameObjectType } from '../../../game-objects';
import { GameStateStore } from '../../../../services/game/game-state.store';
import { LoggingService } from '../../../../services/logging.service';
import { CollisionManagerService, ManagedCollisionResult } from '../collision-manager.service';

/** Nave fake mínima: solo lo que consume el sistema. */
interface FakeShip {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  boundingSphere: { center: { x: number; y: number; z: number }; radius: number } | null;
  healthCurrent: number;
  healthMax: number;
  checkCollision: jasmine.Spy;
  updateModelMatrix: () => void;
}

interface FakeObj {
  id: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  boundingSphere: { center: { x: number; y: number; z: number }; radius: number };
  isActive: () => boolean;
  getType: () => GameObjectType;
}

function makeShip(): FakeShip {
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 1, y: 0, z: 0 },
    boundingSphere: { center: { x: 0, y: 0, z: 0 }, radius: 5 },
    healthCurrent: 100,
    healthMax: 100,
    checkCollision: jasmine.createSpy('checkCollision').and.returnValue(true),
    updateModelMatrix: () => {},
  };
}

function makeAsteroid(id: string): FakeObj {
  return {
    id,
    position: { x: 8, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    boundingSphere: { center: { x: 8, y: 0, z: 0 }, radius: 4 },
    isActive: () => true,
    getType: () => GameObjectType.ASTEROID,
  };
}

function makeStore(): GameStateStore {
  const store = {
    collisionCooldowns: new Map<string, number>(),
    independentAsteroids: [] as FakeObj[],
    planets: [] as FakeObj[],
    portals: [] as FakeObj[],
    sun: null,
    isIndependentAsteroid: () => true,
  };
  return store as unknown as GameStateStore;
}

function makeLogger(): LoggingService {
  return { log: () => {} } as unknown as LoggingService;
}

function makeManager(result: Partial<ManagedCollisionResult>): CollisionManagerService {
  const full: ManagedCollisionResult = {
    newPosition: { x: -1, y: 0, z: 0 },
    newVelocity: { x: 0, y: 0, z: 0 },
    targetNewVelocity: null as unknown as ManagedCollisionResult['targetNewVelocity'],
    shouldEject: false,
    impulseMagnitude: 0,
    collisionType: 'small-movable',
    ...result,
  } as ManagedCollisionResult;
  return { handleCollision: jasmine.createSpy('handleCollision').and.returnValue(full) } as unknown as CollisionManagerService;
}

function makeHost(ship: FakeShip, sources: { independent?: FakeObj[] }, store: GameStateStore): { host: ShipCollisionHost; damage: jasmine.Spy } {
  const damage = jasmine.createSpy('applyShipDamage').and.callFake((amount: number) => amount);
  if (sources.independent) {
    (store as unknown as { independentAsteroids: FakeObj[] }).independentAsteroids = sources.independent;
  }
  const host: ShipCollisionHost = {
    getShip: () => ship as unknown as Spaceship,
    isSuppressed: () => false,
    getClusters: () => [],
    getEphemeralAsteroids: () => [],
    forEachPlanetDebris: () => {},
    getLesserBeings: () => [],
    applyShipDamage: damage,
    applyDamageToObject: jasmine.createSpy('applyDamageToObject'),
    makeAsteroidIndependent: () => {},
    emitShipDamageMarquee: () => {},
    addImpactVignette: () => {},
    isAudioUnlocked: () => false,
    hasSfx: () => false,
    playSfx: () => {},
    getWeatherImpactVolumeScale: () => 1,
  };
  return { host, damage };
}

describe('ShipCollisionSystem', () => {
  it('no evalúa nada si el host está suprimido', () => {
    const ship = makeShip();
    const store = makeStore();
    const { host } = makeHost(ship, { independent: [makeAsteroid('a1')] }, store);
    const suppressed: ShipCollisionHost = { ...host, isSuppressed: () => true };
    const system = new ShipCollisionSystem(store, makeManager({}), makeLogger());

    system.checkCollisions(suppressed);

    expect(ship.checkCollision).not.toHaveBeenCalled();
  });

  it('aplica daño de asteroide (10) y daño mutuo (50) al colisionar', () => {
    const ship = makeShip();
    const store = makeStore();
    const asteroid = makeAsteroid('a1');
    const { host, damage } = makeHost(ship, { independent: [asteroid] }, store);
    const system = new ShipCollisionSystem(store, makeManager({}), makeLogger());

    system.checkCollisions(host);

    expect(damage).toHaveBeenCalledWith(10, 'a1', 'Object', jasmine.objectContaining({ suppressHud: true }));
    expect(host.applyDamageToObject).toHaveBeenCalledWith(asteroid as unknown as GameObject, 50);
  });

  it('el cooldown de par evita re-testear el mismo objeto de inmediato', () => {
    const ship = makeShip();
    const store = makeStore();
    const { host } = makeHost(ship, { independent: [makeAsteroid('a1')] }, store);
    const system = new ShipCollisionSystem(store, makeManager({}), makeLogger());

    system.checkCollisions(host);
    system.checkCollisions(host);

    expect(ship.checkCollision).toHaveBeenCalledTimes(1);
  });

  it('massive-slide programa un slide que applySlide ejecuta y agota', () => {
    const ship = makeShip();
    const store = makeStore();
    const { host } = makeHost(ship, { independent: [makeAsteroid('big')] }, store);
    const system = new ShipCollisionSystem(
      store,
      makeManager({ collisionType: 'massive-slide', newVelocity: { x: 0, y: 0, z: 0 } }),
      makeLogger(),
    );

    system.checkCollisions(host);
    const before = { ...ship.position };
    system.applySlide(host, 0.15); // mitad del slide (duración 0.3)
    const mid = { ...ship.position };
    system.applySlide(host, 0.3); // completa y agota
    const end = { ...ship.position };
    system.applySlide(host, 0.3); // ya no debe mover

    expect(mid).not.toEqual(before);
    expect(end).not.toEqual(mid);
    expect({ ...ship.position }).toEqual(end);
  });

  it('reset limpia cooldowns y slide', () => {
    const ship = makeShip();
    const store = makeStore();
    const { host } = makeHost(ship, { independent: [makeAsteroid('a1')] }, store);
    const system = new ShipCollisionSystem(store, makeManager({ collisionType: 'massive-slide' }), makeLogger());

    system.checkCollisions(host);
    system.reset();
    const before = { ...ship.position };
    system.applySlide(host, 0.2);
    expect({ ...ship.position }).toEqual(before); // sin slide pendiente

    system.checkCollisions(host); // sin cooldown de par tras reset
    expect(ship.checkCollision).toHaveBeenCalledTimes(2);
  });
});
