import { UniverseStateSnapshotService } from './universe-state-snapshot.service';
import { GameStateStore } from '../../../services/game/game-state.store';
import { PortalPersistenceService } from '../game/portal-persistence.service';
import { LoggingService } from '../../../services/logging.service';
import { GameInitializer } from '../../../services/game/game-initializer.service';
import { GameEngine } from '../../../game/GameEngine';
import { SolarSystemSnapshot } from '../../types/solar-system.types';
import { Planet } from '../../game-objects/Planet';
import { Sun } from '../../game-objects/Sun';
import { Portal } from '../../game-objects/Portal';
import { PlanetInhabitants, LesserBeing } from '../../types/cosmic-life.types';
import { PLANET_INTEL_STATUS } from '../../types/planet-intel.types';
import { GameObjectAnimosity } from '../../types/animosity.types';
import { RuntimeStateSource } from '../../types/universe-state.types';

class GameEngineStub {
  public appliedSnapshots: SolarSystemSnapshot[] = [];
  public currentSnapshot: SolarSystemSnapshot | null = null;

  applySolarSystemSnapshot(snapshot: SolarSystemSnapshot): { portalsCreated: any[] } {
    const clone = JSON.parse(JSON.stringify(snapshot)) as SolarSystemSnapshot;
    this.appliedSnapshots.push(clone);
    this.currentSnapshot = clone;
    return { portalsCreated: snapshot.portals ?? [] };
  }
}

class GameInitializerStub {
  constructor(private readonly engine: GameEngineStub) {}

  getGameEngine(): GameEngine {
    return this.engine as unknown as GameEngine;
  }
}

describe('UniverseStateSnapshotService', () => {
  let logger: LoggingService;
  let gameState: GameStateStore;
  let persistence: PortalPersistenceService;
  let engine: GameEngineStub;
  let service: UniverseStateSnapshotService;

  beforeEach(() => {
    logger = new LoggingService();
    gameState = new GameStateStore(logger);
    persistence = new PortalPersistenceService();
    engine = new GameEngineStub();
    const initializer = new GameInitializerStub(engine);
    service = new UniverseStateSnapshotService(initializer as unknown as GameInitializer, gameState, persistence, logger);
  });

  function seedSystem(): void {
    const sun = new Sun('helia', 1400, { x: 0, y: 0, z: 0 });
    (sun as any).customName = 'Helios-Prime';
    gameState.sun = sun;

    const planet = new Planet('planet-a', 'verde', 320, { x: 60000, y: 0, z: 0 });
    planet.customName = 'Aurelia';
    planet.probabilityOfLifePct = 65;
    planet.inhabitants = PlanetInhabitants.MI_GO;
    planet.lesserBeing = LesserBeing.SHOGGOTH;
    planet.visited = true;
    planet.lifeScanned = true;
    planet.creatureScanned = false;
    planet.hasArtifact = true;
    planet.artifactIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_PRESENT;
    planet.hasVoidMass = true;
    planet.voidMassCapacity = 12;
    planet.voidMassRemaining = 5;
    planet.voidMassIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_PRESENT;
    planet.civilizationIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_PRESENT;
    planet.lesserBeingIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_ABSENT;
    planet.orbitCenter = { x: 0, y: 0, z: 0 };
    planet.semiMajor = 72000;
    planet.semiMinor = 54000;
    planet.orbitOrientation = 0.4;
    planet.orbitAngle = 0.8;
    planet.orbitAngularSpeed = 0.00002;
    planet.orbitNormal = { x: 0, y: 1, z: 0 };
    planet.orbitU = { x: 1, y: 0, z: 0 };
    planet.animosity = GameObjectAnimosity.NEUTRAL;
    planet.resourceStock = { metal: 3 };
    gameState.planets.push(planet);

    const portal = new Portal('portal-origin', { x: 1000, y: 0, z: 0 }, 250);
    portal.eyeState = { eyelidOpen: 0.75, intensity: 0.9 };
    portal.concordSealActive = true;
    portal.concordSealActivatedAt = 12345;
    portal.preventsLesserIncursions = true;
    portal.linkedPortalId = 'portal-dest';
    portal.setAnimosity(GameObjectAnimosity.ENEMY);
    gameState.portals.push(portal);
  }

  it('captures enriched metadata for live objects', () => {
    seedSystem();

    const runtime = service.captureRuntimeState('alpha-system');
    expect(runtime.payload).not.toBeNull();
    const payload = runtime.payload!;

    const planetEntry = payload.objects.find(obj => obj.id === 'planet-a');
    expect(planetEntry).toBeTruthy();
    expect(planetEntry!.custom?.['orbit']?.semiMajor).toBe(72000);
    expect(planetEntry!.custom?.['baseColorName']).toBe('verde');
    expect(planetEntry!.custom?.['visited']).toBe(true);
    expect(planetEntry!.custom?.['inhabitants']).toBe(PlanetInhabitants.MI_GO);

    const portalEntry = payload.portals?.find(portal => portal.id === 'portal-origin');
    expect(portalEntry?.custom?.['eyeState']?.eyelidOpen).toBeCloseTo(0.75);
    expect(portalEntry?.custom?.['concordSealActive']).toBe(true);
  });

  it('rebuilds a full snapshot from enriched payload', () => {
    seedSystem();
    const payload = service.captureRuntimeState('alpha-system').payload!;

    const result = service.replaceRuntimeWithPayload({
      systemId: 'alpha-system',
      payload,
      snapshotId: 'rehydrated-1',
      snapshotLabel: 'rehydrated-alpha',
      reason: 'spec-suite'
    });

    expect(result.systemId).toBe('alpha-system');
    expect(result.source).toBe(RuntimeStateSource.SNAPSHOT);
    expect(engine.appliedSnapshots.length).toBe(1);
    const snapshot = engine.appliedSnapshots[0];
    expect(snapshot.sun.name).toBe('Helios-Prime');
    expect(snapshot.planets.length).toBe(1);
    expect(snapshot.planets[0].orbit?.semiMajor).toBe(72000);
    expect(snapshot.planets[0].baseColorName).toBe('verde');
    expect(snapshot.portals?.[0].eyeState?.eyelidOpen).toBeCloseTo(0.75);

    const persisted = persistence.get('rehydrated-alpha');
    expect(persisted?.planets.length).toBe(1);
  });
});
