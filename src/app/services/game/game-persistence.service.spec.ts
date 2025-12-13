import { SaveGameHarness, createGateRiteMismatchHarnessOptions, createRichSaveGameHarnessOptions } from './testing/savegame-harness';
import { normalizeSaveGamePayload } from './testing/savegame-normalizer';
import { SaveGamePlayerSection, SaveGameRespawnState } from '../../game/types/save-game.types';
import { RuntimeSolarSystemState, RuntimeStateSource } from '../../game/types/universe-state.types';
import { GameObjectType } from '../../game/types/game-object.types';
import { Vector3 } from '../../types/game.types';
import { EquipmentSlot, EquipmentSlotState } from '../../game/types/inventory.types';

function vec(x: number, y: number, z: number): Vector3 {
  return { x, y, z };
}

function last<T>(items: T[]): T | undefined {
  return items.length ? items[items.length - 1] : undefined;
}

function buildPlayerSection(anchorOverrides?: Partial<SaveGameRespawnState['activeAnchor']>): SaveGamePlayerSection {
  const anchor = {
    anchorId: 'anchor-spec',
    systemId: anchorOverrides?.systemId ?? 'spec-system',
    snapshotId: 'snap-spec',
    snapshotLabel: 'spec-snapshot',
    planetId: 'spec-planet',
    planetName: 'Spec Planet',
    createdAt: 1_700_000_123_000,
    label: 'Spec Anchor',
    shipPosition: vec(0, 0, 0),
    shipForward: vec(0, 1, 0),
    shipVelocity: vec(0, 0, 0),
    ...anchorOverrides
  };
  return {
    ship: {
      position: vec(10, 0, 0),
      velocity: vec(0, 0, 0),
      driftVelocity: null,
      orientation: null,
      forward: vec(0, 1, 0),
      up: vec(0, 0, 1),
      speed: {
        current: 5,
        target: 8,
        max: 12,
        acceleration: 1,
        deceleration: 1
      },
      voidEnergy: {
        current: 30,
        max: 60,
        paused: false
      },
      cargoCapacity: {
        max: 90,
        current: 10
      },
      status: {
        outOfVoidEnergy: false,
        thrusterState: 'CRUISE'
      },
      health: { current: 60, max: 90 }
    },
    character: {
      profile: {
        name: 'Spec Pilot',
        sanity: 70,
        health: 85,
        memory: 3,
        level: 2,
        experience: 10,
        experienceMax: 100,
        age: {
          years: 28,
          days: 120,
          totalDays: 28 * 365 + 120
        },
        survivability: 95
      },
      memoryPercent: 33
    },
    inventory: {
      personalGear: [],
      equipmentLoadout: {} as Record<EquipmentSlot, EquipmentSlotState | null>,
      cargoManifest: [],
      knownSpells: [],
      grimoireLayout: {}
    },
    respawn: {
      activeAnchor: anchor,
      defaultAnchor: anchor,
      lastAnchorLabel: anchor.label
    }
  };
}

function buildRuntimeState(systemId: string): RuntimeSolarSystemState {
  return {
    systemId,
    snapshotId: 'runtime-snap',
    source: RuntimeStateSource.SNAPSHOT,
    capturedAt: 1_700_000_456_000,
    payload: {
      objects: [
        {
          id: 'object-ship',
          type: GameObjectType.SPACESHIP,
          position: vec(1, 2, 3)
        }
      ],
      portals: [],
      lesserBeings: [],
      environment: { ambientScene: 'spec-scene' }
    }
  };
}

describe('GamePersistenceService · harness roundtrip', () => {
  it('round-trips payloads without structural diffs', async () => {
    const harness = new SaveGameHarness();
    const firstPayload = await harness.save({ reason: 'spec-roundtrip' });

    await harness.load(firstPayload, { reason: 'spec-roundtrip-load' });
    const secondPayload = await harness.save({ reason: 'spec-roundtrip-2' });

    expect(normalizeSaveGamePayload(secondPayload)).toEqual(normalizeSaveGamePayload(firstPayload));
  });

  it('captures optional UI/audio sections when flags are enabled', async () => {
    const harness = new SaveGameHarness();
    const payload = await harness.save({
      reason: 'spec-optional-flags',
      includeUiState: true,
      includeAudioState: true
    });

    expect(payload.ui).toBeNull();
    expect(payload.audio).toBeNull();
    const uiLogs = harness.logger.entries.filter(entry => entry.message.includes('UI state capture requested'));
    const audioLogs = harness.logger.entries.filter(entry => entry.message.includes('Audio state capture requested'));
    expect(uiLogs.length).toBeGreaterThan(0);
    expect(audioLogs.length).toBeGreaterThan(0);
  });

  it('restores runtime context when loading payloads', async () => {
    const player = buildPlayerSection();
    const runtimeState = buildRuntimeState(player.respawn.activeAnchor?.systemId ?? 'fallback');
    const harness = new SaveGameHarness({ player, runtimeState, playerResetState: {
      position: vec(5, 5, 5),
      velocity: vec(1, 0, 0),
      orientation: null,
      shipHealth: { current: 45, max: 90 },
      voidEnergy: 42,
      sanity: 88,
      vitality: 77,
      restoredStat: 'void'
    }});

    const payload = await harness.save({ reason: 'spec-context' });
    await harness.load(payload, { reason: 'spec-context-load' });

    const restartContext = harness.getLastRestartContext();
    expect(restartContext).withContext('restart context should be emitted').not.toBeNull();
    expect(restartContext?.targetSystemId).toBe(runtimeState.systemId);
    expect(restartContext?.runtimeState.systemId).toBe(runtimeState.systemId);
    expect(restartContext?.runtimeState.source).toBe(RuntimeStateSource.SNAPSHOT);
    expect(restartContext?.respawnAnchor?.anchorId).toBe(player.respawn.activeAnchor?.anchorId);
    expect(restartContext?.playerState.voidEnergy).toBe(42);
    expect(restartContext?.playerState.shipHealth.current).toBe(45);
  });

  it('round-trips rich fixtures with portals and archives', async () => {
    const harness = new SaveGameHarness(createRichSaveGameHarnessOptions());
    const baseline = await harness.save({ reason: 'rich-roundtrip' });

    await harness.load(baseline, { reason: 'rich-roundtrip-load' });
    const replay = await harness.save({ reason: 'rich-roundtrip-2' });

    expect(normalizeSaveGamePayload(replay)).toEqual(normalizeSaveGamePayload(baseline));
    expect(baseline.universe.portals?.length ?? 0).toBeGreaterThan(1);
    const restored = last(harness.gameStateAdapter.restoredSections);
    expect(restored?.proceduralArchive.length).toBeGreaterThan(1);
    expect(restored?.lesserBeingMemory['ringworld-7']?.length ?? 0).toBeGreaterThan(0);
  });

  it('preserves restart context for complex systems with portals and intel states', async () => {
    const harness = new SaveGameHarness(createRichSaveGameHarnessOptions());
    const payload = await harness.save({ reason: 'rich-context', label: 'Helios Binary' });
    await harness.load(payload, { reason: 'rich-context-load' });

    const restartContext = harness.getLastRestartContext();
    expect(restartContext?.respawnAnchor?.label).toContain('Helios');
    expect(restartContext?.runtimeState.systemId).toBe('helios-binary');
    expect(harness.universeService.ensureCalls.some(call => call.systemId === 'helios-binary')).toBeTrue();
    const applied = last(harness.playerSerializer.appliedSections);
    expect(applied?.inventory.cargoManifest.length ?? 0).toBeGreaterThan(1);
    expect(payload.universe.portals?.some(portal => portal.linkedPortalId)).toBeTrue();
  });

  it('prioritizes payload metadata system when anchors are stale', async () => {
    const harness = new SaveGameHarness(
      createGateRiteMismatchHarnessOptions({ anchorSystemId: 'sol-origin', destinationSystemId: 'ringworld-7' })
    );
    const payload = await harness.save({ reason: 'gate-rite-mismatch' });
    expect(payload.metadata.systemId).toBe('ringworld-7');
    expect(payload.player?.respawn?.activeAnchor?.systemId).toBe('sol-origin');

    await harness.load(payload, { reason: 'gate-rite-mismatch-load' });

    const ensureCall = last(harness.universeService.ensureCalls);
    expect(ensureCall?.systemId).toBe('ringworld-7');
    const restartContext = harness.getLastRestartContext();
    expect(restartContext?.targetSystemId).toBe('ringworld-7');
    expect(restartContext?.runtimeState.systemId).toBe('ringworld-7');
  });
});
