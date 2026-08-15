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
    getClusterExtentRadius: () => 50,
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
    isStructuredSuppressed: () => false,
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

  it('broad gate por cluster: un cluster lejano no testea a sus miembros (Fase 11 R3)', () => {
    const ship = makeShip();
    const store = makeStore();
    const { host } = makeHost(ship, {}, store);
    const member = makeAsteroid('m1');
    const makeCluster = (cx: number) => ({
      center: { x: cx, y: 0, z: 0 },
      objects: [member],
      lodMode: 'full',
      proxy: undefined,
      representativeId: null,
    });
    const system = new ShipCollisionSystem(store, makeManager({}), makeLogger());

    const far: ShipCollisionHost = {
      ...host,
      getClusters: () => [makeCluster(10000)] as unknown as ReturnType<ShipCollisionHost['getClusters']>,
    };
    system.checkCollisions(far);
    expect(ship.checkCollision).not.toHaveBeenCalled();

    const near: ShipCollisionHost = {
      ...host,
      getClusters: () => [makeCluster(0)] as unknown as ReturnType<ShipCollisionHost['getClusters']>,
    };
    system.checkCollisions(near);
    expect(ship.checkCollision).toHaveBeenCalledTimes(1);
  });

  it('collider estructurado: gate + push-out por normal de superficie + deslizamiento + daño por impacto (Fase 11 R4)', () => {
    const ship = makeShip();
    ship.checkCollision.and.returnValue(false);
    ship.velocity = { x: -3, y: 0, z: 0 };
    ship.position = { x: 8, y: 0, z: 0 };
    const store = makeStore();
    const { host, damage } = makeHost(ship, {}, store);
    const system = new ShipCollisionSystem(store, makeManager({}), makeLogger());

    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const source = {
      id: 'station-1',
      position: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      modelMatrix: identity,
    } as unknown as GameObject;
    system.registerStructured({
      id: 'station-1',
      source,
      shapesLocal: [{ kind: 'sphere', center: [0, 0, 0], radius: 10 }],
      objectType: GameObjectType.SPACE_STATION,
    });

    // Lejos del gate (activación = 10 + radioNave 5): sin narrow, sin daño.
    ship.position = { x: 100, y: 0, z: 0 };
    system.checkCollisions(host);
    expect(damage).not.toHaveBeenCalled();

    // Penetrando (centro de nave a 8 del centro, superficie en 10): push-out hacia +X.
    ship.position = { x: 8, y: 0, z: 0 };
    system.checkCollisions(host);
    expect(ship.position.x).toBeGreaterThanOrEqual(15); // fuera de la esfera (10 + radioNave 5)
    expect(ship.velocity.x).toBe(0); // componente contra la superficie anulada (deslizamiento)
    // Daño escalado: velocidad de impacto 3 u/s → 10 + 140·(3-1)/11 ≈ 35.
    expect(damage).toHaveBeenCalledWith(35, 'station-1', jasmine.any(String), jasmine.objectContaining({ suppressHud: true }));

    // Baja del registro (despawn/cambio de sistema): sin push aunque penetre.
    system.unregisterStructured('station-1');
    ship.position = { x: 8, y: 0, z: 0 };
    system.checkCollisions(host);
    expect(ship.position.x).toBe(8); // ya no hay collider registrado
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
