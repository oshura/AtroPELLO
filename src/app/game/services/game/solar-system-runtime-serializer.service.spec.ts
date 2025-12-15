import { SolarSystemRuntimeSerializerService } from './solar-system-runtime-serializer.service';
import { GameInitializer } from '../../../services/game/game-initializer.service';
import { PortalPersistenceService } from './portal-persistence.service';
import { GameStateStore } from '../../../services/game/game-state.store';
import { LoggingService } from '../../../services/logging.service';
import { SolarSystemSerializer } from './solar-system-serializer';
import { SolarSystemSnapshot } from '../../types/solar-system.types';
import { GameEngine } from '../../GameEngine';

describe('SolarSystemRuntimeSerializerService', () => {
  let service: SolarSystemRuntimeSerializerService;
  let portalPersistence: jasmine.SpyObj<PortalPersistenceService>;
  let logger: jasmine.SpyObj<LoggingService>;
  let gameInitializer: jasmine.SpyObj<GameInitializer>;
  let gameState: GameStateStore;

  beforeEach(() => {
    portalPersistence = jasmine.createSpyObj<PortalPersistenceService>('PortalPersistenceService', ['save']);
    logger = jasmine.createSpyObj<LoggingService>('LoggingService', ['log']);
    gameInitializer = jasmine.createSpyObj<GameInitializer>('GameInitializer', ['getGameEngine']);

    gameState = {
      sun: { id: 'sun', position: { x: 0, y: 0, z: 0 } },
      planets: [],
      portals: [],
      getLesserBeingSnapshots: () => []
    } as unknown as GameStateStore;

    service = new SolarSystemRuntimeSerializerService(gameInitializer, portalPersistence, gameState, logger);
  });

  it('should include the elder god metadata whenever a runtime snapshot is persisted', () => {
    const engine = {
      getCurrentSystemElderGod: () => 'Azathoth',
      asteroidClusterService: { getClusters: () => [] },
      planetDebris: new Map<string, Array<{ obj: { id: string; scale?: { x: number } }; local: { x: number; y: number; z: number } }>>()
    } as unknown as GameEngine;

    const snapshot: SolarSystemSnapshot = {
      id: 'snapshot-1',
      meta: {},
      sun: { id: 'sun-spec', position: { x: 0, y: 0, z: 0 }, radius: 1200 },
      planets: [],
      portals: [],
      clusters: []
    };

    spyOn(SolarSystemSerializer, 'fromState').and.returnValue(snapshot);

    const result = service.saveWithLabel('Void Jump', engine);

    expect(result?.meta?.['elderGod']).toBe('Azathoth');
    expect(portalPersistence.save).toHaveBeenCalledWith(
      'Void Jump',
      jasmine.objectContaining({
        meta: jasmine.objectContaining({
          elderGod: 'Azathoth',
          snapshotLabel: 'Void Jump'
        })
      })
    );
  });
});
