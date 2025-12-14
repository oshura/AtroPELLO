import { LesserBeingSpawner } from './lesser-being-spawner';
import { ElderGod, LesserBeing, LesserBeingEncounterPlan } from '../../types/cosmic-life.types';
import { LogCategory, LogLevel } from '../../../services/logging.service';
import { GameEngine } from '../../GameEngine';
import { LesserBeingBase } from '../../game-objects/lesser-beings/lesser-being-base';

interface TestEngineContext {
  registeredBeings: LesserBeingBase[];
  registerLesserBeing: jasmine.Spy<jasmine.Func>;
  logger: { log: jasmine.Spy<jasmine.Func> };
  getSystemBoundaryRadius: () => number;
  gameState: { portals: any[] };
}

function createEngineStub(overrides: Partial<TestEngineContext> = {}): { engine: GameEngine; stub: TestEngineContext } {
  const stub = {
    registeredBeings: [],
    registerLesserBeing: jasmine.createSpy('registerLesserBeing').and.callFake((being: LesserBeingBase) => {
      stub.registeredBeings.push(being);
    }),
    logger: {
      log: jasmine.createSpy('log')
    },
    getSystemBoundaryRadius: () => 1500,
    gameState: { portals: [] }
  } as unknown as TestEngineContext;
  Object.assign(stub, overrides);
  return { engine: stub as unknown as GameEngine, stub };
}

describe('LesserBeingSpawner', () => {
  beforeEach(() => {
    spyOn(Math, 'random').and.returnValue(0.25);
  });

  it('spawns and registers a lesser being when slots are available', () => {
    const { engine, stub } = createEngineStub();
    const spawner = new LesserBeingSpawner(engine);
    const fakeBeing = { id: 'test-being' } as unknown as LesserBeingBase;
    spyOn<any>(spawner as any, 'instantiateBeing').and.returnValue(fakeBeing);

    (spawner as any).trySpawn({ reason: 'void-jump', elderGod: ElderGod.CTHULHU });

    expect(stub.registerLesserBeing).toHaveBeenCalledTimes(1);
    expect(stub.logger.log).toHaveBeenCalledWith(
      LogLevel.INFO,
      LogCategory.LESSER_BEINGS,
      'Lesser being spawned',
      jasmine.objectContaining({ reason: 'void-jump' })
    );
    expect(stub.registeredBeings.length).toBe(1);
  });

  it('logs an error and frees the queue slot if registerLesserBeing throws', () => {
    const { engine, stub } = createEngineStub();
    stub.registerLesserBeing.and.callFake(() => {
      throw new Error('register failed');
    });
    const spawner = new LesserBeingSpawner(engine);
    const fakeBeing = { id: 'test-being' } as unknown as LesserBeingBase;
    spyOn<any>(spawner as any, 'instantiateBeing').and.returnValue(fakeBeing);

    (spawner as any).trySpawn({ reason: 'void-jump', elderGod: ElderGod.CTHULHU });
    expect(stub.logger.log).toHaveBeenCalledWith(
      LogLevel.ERROR,
      LogCategory.LESSER_BEINGS,
      'Failed to register lesser being',
      jasmine.objectContaining({ reason: 'void-jump' })
    );

    // Allow registration to succeed and ensure another spawn is attempted (slot was freed)
    stub.registerLesserBeing.and.callThrough();
    (spawner as any).trySpawn({ reason: 'void-jump', elderGod: ElderGod.CTHULHU });

    expect(stub.registerLesserBeing).toHaveBeenCalledTimes(2);
  });

  it('skips spawning when the queue is full', () => {
    const { engine, stub } = createEngineStub();
    const spawner = new LesserBeingSpawner(engine);
    (spawner as any).activeBeings = new Set(['a', 'b', 'c']);

    (spawner as any).trySpawn({ reason: 'void-jump', elderGod: ElderGod.CTHULHU });

    expect(stub.registerLesserBeing).not.toHaveBeenCalled();
    expect(stub.logger.log).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      LogCategory.LESSER_BEINGS,
      'Spawn queue full, skipping lesser being',
      jasmine.objectContaining({ active: 3, max: 3 })
    );
  });

  it('logs an error and aborts when instantiation fails', () => {
    const { engine, stub } = createEngineStub();
    const spawner = new LesserBeingSpawner(engine);
    spyOn<any>(spawner as any, 'instantiateBeing').and.returnValue(null);

    (spawner as any).trySpawn({ reason: 'void-jump', elderGod: ElderGod.CTHULHU });

    expect(stub.registerLesserBeing).not.toHaveBeenCalled();
    expect(stub.logger.log).toHaveBeenCalledWith(
      LogLevel.ERROR,
      LogCategory.LESSER_BEINGS,
      'Failed to instantiate lesser being',
      jasmine.objectContaining({ reason: 'void-jump' })
    );
  });

  it('evaluates portals and triggers a spawn when the roll succeeds', () => {
    const portal = {
      id: 'portal-1',
      position: { x: 0, y: 0, z: 0 }
    } as any;
    const { engine } = createEngineStub({ gameState: { portals: [portal] } as any });
    const spawner = new LesserBeingSpawner(engine);
    const trySpawnSpy = spyOn<any>(spawner as any, 'trySpawn');
    (Math.random as jasmine.Spy).and.returnValue(0.05);

    (spawner as any).evaluatePortalSpawns();

    expect(trySpawnSpy).toHaveBeenCalledTimes(1);
    expect(trySpawnSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({ reason: 'portal-tick', portal })
    );
    (Math.random as jasmine.Spy).and.returnValue(0.25);
  });

  it('skips portal spawns when a portal prevents incursions', () => {
    const portal = {
      id: 'sealed-portal',
      position: { x: 0, y: 0, z: 0 },
      preventsLesserIncursions: true
    } as any;
    const { engine, stub } = createEngineStub({ gameState: { portals: [portal] } as any });
    const spawner = new LesserBeingSpawner(engine);
    const trySpawnSpy = spyOn<any>(spawner as any, 'trySpawn');
    (Math.random as jasmine.Spy).and.returnValue(0.25);

    (spawner as any).evaluatePortalSpawns();

    expect(trySpawnSpy).not.toHaveBeenCalled();
    expect(stub.logger.log).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      LogCategory.LESSER_BEINGS,
      'Portal prevents incursions',
      jasmine.objectContaining({ portalId: 'sealed-portal' })
    );
  });

  it('triggers a spawn attempt when a void jump completes', () => {
    const { engine, stub } = createEngineStub();
    const spawner = new LesserBeingSpawner(engine);
    const trySpawnSpy = spyOn<any>(spawner as any, 'trySpawn');

    spawner.onVoidJumpCompleted();

    expect(stub.logger.log).toHaveBeenCalledWith(
      LogLevel.DEBUG,
      LogCategory.LESSER_BEINGS,
      'Void jump spawn roll',
      jasmine.objectContaining({ elderGod: ElderGod.CTHULHU })
    );
    expect(trySpawnSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({ reason: 'void-jump', elderGod: ElderGod.CTHULHU })
    );
  });

  it('prepares a void jump encounter using the elder god pool', () => {
    const { engine } = createEngineStub();
    const spawner = new LesserBeingSpawner(engine);
    (Math.random as jasmine.Spy).and.returnValues(0.2, 0.6);

    const plan = spawner.prepareVoidJumpEncounter();

    expect(plan).toEqual({ elderGod: ElderGod.CTHULHU, species: LesserBeing.SEMILLAS_ESTELARES });
    (Math.random as jasmine.Spy).and.returnValue(0.25);
  });

  it('skips prepared encounters when the preview roll fails', () => {
    const { engine } = createEngineStub();
    const spawner = new LesserBeingSpawner(engine);
    (Math.random as jasmine.Spy).and.returnValue(1);

    const plan = spawner.prepareVoidJumpEncounter();

    expect(plan).toBeNull();
    (Math.random as jasmine.Spy).and.returnValue(0.25);
  });

  it('executes a prepared encounter without reselecting species', () => {
    const { engine, stub } = createEngineStub();
    const spawner = new LesserBeingSpawner(engine);
    const fakeBeing = { id: 'forced-being' } as unknown as LesserBeingBase;
    spyOn<any>(spawner as any, 'instantiateBeing').and.returnValue(fakeBeing);
    const pickerSpy = spyOn<any>(spawner as any, 'pickSpeciesFromPool').and.callThrough();
    const plan: LesserBeingEncounterPlan = {
      elderGod: ElderGod.CTHULHU,
      species: LesserBeing.SEMILLAS_ESTELARES
    };

    spawner.onVoidJumpCompleted(plan);

    expect(pickerSpy).not.toHaveBeenCalled();
    expect(stub.registerLesserBeing).toHaveBeenCalledWith(fakeBeing);
  });

  it('restores beings from snapshots and tracks them as active', () => {
    const { engine } = createEngineStub();
    const spawner = new LesserBeingSpawner(engine);
    const fakeBeing = {
      id: 'snapshot-being',
      velocity: { x: 0, y: 0, z: 0 },
      currentSpeed: 0,
      healthMax: 120,
      healthCurrent: 50,
      hasLanded: false,
      landedPlanetId: null
    } as unknown as LesserBeingBase;
    spyOn<any>(spawner as any, 'instantiateBeing').and.returnValue(fakeBeing);

    const revived = spawner.reviveFromSnapshot({
      id: 'snapshot-being',
      type: LesserBeing.SEMILLAS_ESTELARES,
      position: { x: 10, y: 5, z: -2 },
      velocity: { x: 3, y: 4, z: 12 },
      health: { current: 200, max: 150 },
      hasLanded: true,
      landedPlanetId: 'planet-9'
    } as any);

    expect(revived).toBe(fakeBeing);
    expect((spawner as any).activeBeings.has('snapshot-being')).toBeTrue();
    expect(fakeBeing.velocity).toEqual({ x: 3, y: 4, z: 12 });
    expect(fakeBeing.currentSpeed).toBeCloseTo(13);
    expect(fakeBeing.healthCurrent).toBe(150);
    expect(fakeBeing.hasLanded).toBeTrue();
    expect(fakeBeing.landedPlanetId).toBe('planet-9');
  });
});
