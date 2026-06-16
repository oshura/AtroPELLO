import { UniverseStateSnapshotService } from './universe-state-snapshot.service';
import { GameStateStore } from '../../../services/game/game-state.store';
import { PortalPersistenceService } from '../game/portal-persistence.service';
import { LoggingService } from '../../../services/logging.service';
import { GameInitializer } from '../../../services/game/game-initializer.service';
import { GameEngine } from '../../../game/GameEngine';
import { SolarSystemSnapshot } from '../../types/solar-system.types';
import { RuntimeStateSource } from '../../types/universe-state.types';

class GameEngineStub {
  public appliedSnapshots: SolarSystemSnapshot[] = [];
  public currentSnapshot: SolarSystemSnapshot | null = null;
  public lastLabel: string | null = null;

  applySolarSystemSnapshot(snapshot: SolarSystemSnapshot): { portalsCreated: any[] } {
    const clone = JSON.parse(JSON.stringify(snapshot)) as SolarSystemSnapshot;
    this.appliedSnapshots.push(clone);
    this.currentSnapshot = clone;
    return { portalsCreated: snapshot.portals ?? [] };
  }

  setCurrentSnapshotLabel(label: string | null): void {
    this.lastLabel = label;
  }
}

class GameInitializerStub {
  constructor(private readonly engine: GameEngineStub) {}

  getGameEngine(): GameEngine {
    return this.engine as unknown as GameEngine;
  }
}

function makeSnapshot(systemId: string): SolarSystemSnapshot {
  return {
    id: `${systemId}-snap`,
    sun: { id: `${systemId}-sun`, name: `${systemId} Star`, position: { x: 0, y: 0, z: 0 }, radius: 1400 },
    planets: [
      { id: `${systemId}-planet`, kind: 'terrestrial', position: { x: 60_000, y: 0, z: 0 }, radius: 320, baseColorName: 'azul_marino' }
    ],
    clusters: [],
    portals: [
      { id: `${systemId}-portal`, position: { x: 1000, y: 0, z: 0 }, radius: 250, linkedPortalId: `${systemId}-portal-dest` }
    ],
    meta: { proceduralSystemId: systemId }
  };
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

  describe('captureCurrentSnapshot', () => {
    it('returns a deep clone of the active snapshot', () => {
      engine.currentSnapshot = makeSnapshot('alpha');
      const captured = service.captureCurrentSnapshot();
      expect(captured.id).toBe('alpha-snap');
      expect(captured).not.toBe(engine.currentSnapshot);
      expect(captured.planets).not.toBe(engine.currentSnapshot!.planets);
    });

    it('throws when there is no active system', () => {
      engine.currentSnapshot = null;
      expect(() => service.captureCurrentSnapshot()).toThrow();
    });
  });

  describe('adoptSnapshot', () => {
    it('applies the embedded snapshot and persists it under a pinned label', () => {
      const snapshot = makeSnapshot('alpha');
      const runtime = service.adoptSnapshot({
        snapshot,
        systemId: 'alpha',
        snapshotLabel: 'alpha-label',
        reason: 'spec'
      });

      expect(runtime.systemId).toBe('alpha');
      expect(runtime.source).toBe(RuntimeStateSource.SNAPSHOT);
      expect(engine.appliedSnapshots.length).toBe(1);
      expect(engine.appliedSnapshots[0].id).toBe('alpha-snap');

      const persisted = persistence.get('alpha-label');
      expect(persisted).toBeTruthy();
      expect(persisted?.meta?.['snapshotLabel']).toBe('alpha-label');
    });

    it('keeps the adopted snapshot pinned against eviction by the same system', () => {
      const snapshot = makeSnapshot('alpha');
      service.adoptSnapshot({ snapshot, systemId: 'alpha', snapshotLabel: 'alpha-label', reason: 'spec' });

      // Otra captura del MISMO sistema bajo otra etiqueta no debe desalojar la pineada.
      persistence.save('alpha-other', makeSnapshot('alpha'));
      expect(persistence.has('alpha-label')).toBeTrue();
    });

    it('falls back to the snapshot canonical id when no systemId is provided', () => {
      const snapshot = makeSnapshot('beta');
      const runtime = service.adoptSnapshot({ snapshot, reason: 'spec' });
      expect(runtime.systemId).toBe('beta');
    });

    it('does not mutate the caller snapshot', () => {
      const snapshot = makeSnapshot('alpha');
      const before = JSON.parse(JSON.stringify(snapshot));
      service.adoptSnapshot({ snapshot, systemId: 'alpha', snapshotLabel: 'alpha-label' });
      expect(snapshot).toEqual(before);
    });
  });

  describe('ensureSystemState', () => {
    it('applies an explicit snapshot option (portal/respawn path)', () => {
      const snapshot = makeSnapshot('gamma');
      const runtime = service.ensureSystemState('gamma', { snapshot, reason: 'portal' });
      expect(runtime.source).toBe(RuntimeStateSource.SNAPSHOT);
      expect(runtime.systemId).toBe('gamma');
      expect(engine.appliedSnapshots.length).toBe(1);
    });

    it('resolves a snapshot stored by label in persistence', () => {
      persistence.save('delta-label', makeSnapshot('delta'));
      const runtime = service.ensureSystemState('delta', { snapshotLabel: 'delta-label', reason: 'respawn' });
      expect(runtime.source).toBe(RuntimeStateSource.SNAPSHOT);
      expect(engine.appliedSnapshots.length).toBe(1);
    });
  });
});
