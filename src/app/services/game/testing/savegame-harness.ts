import { GamePersistenceService, LoadGameOptions, SaveGameCaptureOptions } from '../game-persistence.service';
import { GameStateStore } from '../game-state.store';
import { GameInitializer } from '../game-initializer.service';
import { PlayerStateSerializer } from '../persistence/player-state.serializer';
import { GameStateSnapshotAdapter } from '../persistence/game-state.snapshot-adapter';
import { UniverseStateSnapshotAdapter } from '../persistence/universe-state.snapshot-adapter';
import { SaveGameMigrationService } from '../persistence/save-game.migration.service';
import { CloudSavesSessionBridgeService } from '../../../libs/cloud-saves/cloud-saves-session-bridge.service';
import {
  SaveGameGameStateSection,
  SaveGamePayload,
  SaveGamePlayerSection
} from '../../../game/types/save-game.types';
import {
  GameStartContext,
  PlayerResetState,
  RuntimeSolarSystemState,
  RuntimeStateSource
} from '../../../game/types/universe-state.types';
import { LoggingService, LogCategory, LogLevel } from '../../logging.service';
import { UniverseStateSnapshotService, AdoptSnapshotOptions } from '../../../game/services/state/universe-state-snapshot.service';
import { resolveSnapshotId, resolveSystemId } from '../../../game/services/game/system-identity';
import { UserIdentity, UNKNOWN_IDENTITY } from '../../../types/identity';
import {
  EquipmentSlot,
  EquipmentSlotState,
  CargoManifestEntry,
  CargoItemType,
  RarityTier,
  PersonalGearSlot
} from '../../../game/types/inventory.types';
import { GameObjectType } from '../../../game/types/game-object.types';
import { SpellType } from '../../../game/types/spell.types';
import {
  PlanetIntelSnapshot,
  PLANET_INTEL_STATUS,
  PlanetMissionState,
  MissionClueToken,
  MissionClueTier
} from '../../../game/types/planet-intel.types';
import { PlanetInhabitants, LesserBeing, LesserBeingInstanceSnapshot } from '../../../game/types/cosmic-life.types';
import { SolarSystemSnapshot, PortalSnapshot } from '../../../game/types/solar-system.types';
import { Vector3 } from '../../../types/game.types';

export interface SaveGameHarnessOptions {
  player?: SaveGamePlayerSection;
  gameState?: SaveGameGameStateSection;
  /** Snapshot del sistema activo que el adapter "captura" al guardar (v2: una sola representación). */
  universeSnapshot?: SolarSystemSnapshot;
  /** Id lógico que devuelve adoptSnapshot al cargar (normalmente = systemId del snapshot). */
  systemId?: string;
  snapshotId?: string | null;
  playerResetState?: PlayerResetState;
  identity?: UserIdentity | null;
  token?: string | null;
  frameCount?: number;
  lastFrameTime?: number;
  snapshotLabel?: string | null;
}

interface SaveGameHarnessFixtures {
  playerSection: SaveGamePlayerSection;
  gameStateSection: SaveGameGameStateSection;
  universeSnapshot: SolarSystemSnapshot;
  systemId: string;
  snapshotId: string | null;
  playerResetState: PlayerResetState;
  identity: UserIdentity | null;
  token: string | null;
  frameCount: number;
  lastFrameTime: number;
  snapshotLabel: string | null;
}

/**
 * Utility harness that wires GamePersistenceService with lightweight stubs so tests
 * can drive save → load → save flows without bootstrapping the full engine.
 */
export class SaveGameHarness {
  readonly logger: HarnessLoggingService;
  readonly gameState: GameStateStore;
  readonly engine: HarnessGameEngineStub;
  readonly initializer: HarnessGameInitializerStub;
  readonly playerSerializer: HarnessPlayerStateSerializerStub;
  readonly gameStateAdapter: HarnessGameStateSnapshotAdapterStub;
  readonly universeService: HarnessUniverseStateSnapshotServiceStub;
  readonly universeAdapter: HarnessUniverseStateSnapshotAdapterStub;
  readonly cloudBridge: HarnessCloudSessionBridgeStub;
  readonly migrationService: HarnessMigrationServiceStub;
  readonly service: GamePersistenceService;

  constructor(options?: Partial<SaveGameHarnessOptions>) {
    const fixtures = createDefaultHarnessFixtures(options);
    this.logger = new HarnessLoggingService();
    this.gameState = new GameStateStore(this.logger);
    this.gameState.frameCount = fixtures.frameCount;
    this.gameState.lastFrameTime = fixtures.lastFrameTime;
    this.gameState.gameRunning = true;

    this.engine = new HarnessGameEngineStub(fixtures.snapshotLabel);
    this.initializer = new HarnessGameInitializerStub(this.engine);
    this.playerSerializer = new HarnessPlayerStateSerializerStub(this.gameState, fixtures.playerSection, fixtures.playerResetState);
    this.gameStateAdapter = new HarnessGameStateSnapshotAdapterStub(fixtures.gameStateSection);
    this.universeService = new HarnessUniverseStateSnapshotServiceStub(fixtures.systemId, fixtures.snapshotId);
    this.universeAdapter = new HarnessUniverseStateSnapshotAdapterStub(fixtures.universeSnapshot, fixtures.systemId);
    this.cloudBridge = new HarnessCloudSessionBridgeStub(fixtures.identity, fixtures.token);
    this.migrationService = new HarnessMigrationServiceStub();

    this.service = new GamePersistenceService(
      this.initializer as unknown as GameInitializer,
      this.gameState,
      this.universeService as unknown as UniverseStateSnapshotService,
      this.playerSerializer as unknown as PlayerStateSerializer,
      this.gameStateAdapter as unknown as GameStateSnapshotAdapter,
      this.universeAdapter as unknown as UniverseStateSnapshotAdapter,
      this.logger,
      this.cloudBridge as unknown as CloudSavesSessionBridgeService,
      this.migrationService as unknown as SaveGameMigrationService
    );
  }

  async save(options?: SaveGameCaptureOptions): Promise<SaveGamePayload> {
    return this.service.saveGame(options);
  }

  async load(payload: SaveGamePayload, options?: LoadGameOptions): Promise<void> {
    await this.service.loadGame(payload, options);
  }

  getLastRestartContext(): GameStartContext | null {
    return this.engine.lastRestartContext ? deepClone(this.engine.lastRestartContext) : null;
  }

  getRestartContexts(): GameStartContext[] {
    return this.engine.restartContexts.map(ctx => deepClone(ctx));
  }

  updatePlayerSection(section: SaveGamePlayerSection): void {
    this.playerSerializer.setCapturePayload(section);
  }

  updateGameStateSection(section: SaveGameGameStateSection): void {
    this.gameStateAdapter.setCapturePayload(section);
  }

  updateUniverseSnapshot(snapshot: SolarSystemSnapshot): void {
    this.universeAdapter.setUniverseSnapshot(snapshot);
  }
}

class HarnessLoggingService extends LoggingService {
  public readonly entries: Array<{ level: LogLevel; category: LogCategory; message: string; context?: any }> = [];

  override log(level: LogLevel, category: LogCategory, message: string, context?: any): void {
    this.entries.push({ level, category, message, context });
  }
}

class HarnessGameEngineStub {
  public readonly restartContexts: GameStartContext[] = [];
  public lastRestartContext: GameStartContext | null = null;
  public audioPaused = false;
  public stopped = false;
  public started = false;
  constructor(public snapshotLabel: string | null) {}

  restartWithContext(context: GameStartContext): void {
    const cloned = deepClone(context);
    this.restartContexts.push(cloned);
    this.lastRestartContext = cloned;
  }

  stop(): void {
    this.stopped = true;
  }

  start(): void {
    this.started = true;
  }

  setAudioPausedForGame(paused: boolean): void {
    this.audioPaused = paused;
  }

  getCurrentSnapshotLabel(): string | null {
    return this.snapshotLabel;
  }
}

class HarnessGameInitializerStub {
  constructor(private readonly engine: HarnessGameEngineStub) {}

  getGameEngine(): ReturnType<GameInitializer['getGameEngine']> {
    return this.engine as unknown as ReturnType<GameInitializer['getGameEngine']>;
  }
}

class HarnessPlayerStateSerializerStub {
  public readonly appliedSections: SaveGamePlayerSection[] = [];
  private captureSection: SaveGamePlayerSection;
  private resetState: PlayerResetState;

  constructor(
    private readonly gameState: GameStateStore,
    section: SaveGamePlayerSection,
    resetState: PlayerResetState
  ) {
    this.captureSection = deepClone(section);
    this.resetState = deepClone(resetState);
  }

  capture(): SaveGamePlayerSection {
    return deepClone(this.captureSection);
  }

  apply(section: SaveGamePlayerSection): PlayerResetState {
    this.appliedSections.push(deepClone(section));
    const characterId = section?.character?.characterId;
    if (characterId) {
      this.gameState.setCharacterId(characterId);
    }
    return deepClone(this.resetState);
  }

  setCapturePayload(section: SaveGamePlayerSection): void {
    this.captureSection = deepClone(section);
  }

  setResetState(state: PlayerResetState): void {
    this.resetState = deepClone(state);
  }
}

class HarnessGameStateSnapshotAdapterStub {
  public readonly restoredSections: SaveGameGameStateSection[] = [];
  private captureSection: SaveGameGameStateSection;

  constructor(section: SaveGameGameStateSection) {
    this.captureSection = deepClone(section);
  }

  capture(): SaveGameGameStateSection {
    return deepClone(this.captureSection);
  }

  restore(section: SaveGameGameStateSection | null | undefined): void {
    if (!section) {
      return;
    }
    this.restoredSections.push(deepClone(section));
  }

  setCapturePayload(section: SaveGameGameStateSection): void {
    this.captureSection = deepClone(section);
  }
}

class HarnessUniverseStateSnapshotServiceStub {
  public readonly pinnedLabels = new Set<string>();
  private readonly systemId: string;
  private readonly snapshotId: string | null;

  constructor(systemId: string, snapshotId: string | null) {
    this.systemId = systemId;
    this.snapshotId = snapshotId;
  }

  getActiveSystemId(): string {
    return this.systemId;
  }

  getActiveSnapshotId(): string | null {
    return this.snapshotId;
  }

  pinSnapshotLabel(label: string | null | undefined): void {
    if (!label) {
      return;
    }
    this.pinnedLabels.add(label);
  }

  unpinSnapshotLabel(label: string | null | undefined): void {
    if (!label) {
      return;
    }
    this.pinnedLabels.delete(label);
  }
}

class HarnessUniverseStateSnapshotAdapterStub {
  public readonly captureCalls: number[] = [];
  public readonly adoptCalls: Array<{ systemId: string | null; snapshotLabel: string | null; snapshot: SolarSystemSnapshot }> = [];
  private universeSnapshot: SolarSystemSnapshot;
  private readonly fallbackSystemId: string;

  constructor(snapshot: SolarSystemSnapshot, fallbackSystemId: string) {
    this.universeSnapshot = deepClone(snapshot);
    this.fallbackSystemId = fallbackSystemId;
  }

  setUniverseSnapshot(snapshot: SolarSystemSnapshot): void {
    this.universeSnapshot = deepClone(snapshot);
  }

  captureSnapshot(): SolarSystemSnapshot {
    this.captureCalls.push(Date.now());
    return deepClone(this.universeSnapshot);
  }

  adoptSnapshot(options: AdoptSnapshotOptions): RuntimeSolarSystemState {
    const snapshot = deepClone(options.snapshot);
    const systemId = (options.systemId && options.systemId.trim().length ? options.systemId.trim() : null)
      ?? resolveSystemId(snapshot)
      ?? this.fallbackSystemId;
    this.adoptCalls.push({ systemId, snapshotLabel: options.snapshotLabel ?? null, snapshot });
    return {
      systemId,
      snapshotId: resolveSnapshotId(snapshot),
      source: RuntimeStateSource.SNAPSHOT,
      capturedAt: Date.now(),
      payload: null
    };
  }
}

class HarnessCloudSessionBridgeStub {
  private readonly tokenListeners = new Set<(token: string | null) => void>();
  private readonly identityListeners = new Set<(identity: UserIdentity | null) => void>();

  constructor(private identity: UserIdentity | null, private token: string | null) {}

  async getToken(): Promise<string | null> {
    return this.token;
  }

  async getIdentity(): Promise<UserIdentity | null> {
    return this.identity;
  }

  onSessionChange(cb: (token: string | null) => void): () => void {
    this.tokenListeners.add(cb);
    cb(this.token);
    return () => this.tokenListeners.delete(cb);
  }

  onIdentityChange(cb: (identity: UserIdentity | null) => void): () => void {
    this.identityListeners.add(cb);
    cb(this.identity);
    return () => this.identityListeners.delete(cb);
  }

  setToken(token: string | null): void {
    this.token = token;
    for (const listener of this.tokenListeners) {
      listener(token);
    }
  }

  setIdentity(identity: UserIdentity | null): void {
    this.identity = identity;
    for (const listener of this.identityListeners) {
      listener(identity);
    }
  }
}

class HarnessMigrationServiceStub {
  public migratedPayloads: SaveGamePayload[] = [];

  migrate(payload: SaveGamePayload): SaveGamePayload {
    const cloned = deepClone(payload);
    this.migratedPayloads.push(cloned);
    return cloned;
  }
}

const DEFAULT_PLAYER_RESET_STATE: PlayerResetState = {
  position: { x: 5, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  orientation: null,
  shipHealth: { current: 80, max: 100 },
  voidEnergy: 50,
  sanity: 90,
  vitality: 85,
  restoredStat: null
};

const DEFAULT_PLAYER_SECTION: SaveGamePlayerSection = {
  ship: {
    position: { x: 1, y: 2, z: 3 },
    velocity: { x: 0, y: 0, z: 0 },
    driftVelocity: null,
    orientation: null,
    forward: null,
    up: null,
    speed: {
      current: 10,
      target: 20,
      max: 30,
      acceleration: 5,
      deceleration: 3
    },
    voidEnergy: {
      current: 50,
      max: 100,
      paused: false
    },
    cargoCapacity: {
      max: 100,
      current: 25
    },
    status: {
      outOfVoidEnergy: false,
      thrusterState: 'IDLE'
    },
    health: { current: 80, max: 100 }
  },
  character: {
    profile: {
      name: 'Harvey Walters',
      sanity: 58,
      health: 100,
      memory: 0,
      level: 1,
      experience: 0,
      experienceMax: 100,
      age: {
        years: 32,
        days: 76,
        totalDays: 32 * 365 + 76
      },
      survivability: 100
    },
    memoryPercent: 12,
    characterId: 'pilot-default'
  },
  inventory: {
    personalGear: [],
    equipmentLoadout: {} as Record<EquipmentSlot, EquipmentSlotState | null>,
    cargoManifest: [],
    knownSpells: [],
    grimoireLayout: {}
  },
  respawn: {
    activeAnchor: {
      anchorId: 'anchor-001',
      systemId: 'sol-1',
      snapshotId: 'snapshot-001',
      snapshotLabel: 'sol-home',
      planetId: 'earth',
      planetName: 'Earth',
      createdAt: 1_700_000_000_000,
      label: 'Earth Hangar',
      shipPosition: { x: 0, y: 0, z: 0 }
    },
    defaultAnchor: null,
    lastAnchorLabel: 'Earth Hangar'
  }
};

const DEFAULT_GAME_STATE_SECTION: SaveGameGameStateSection = {
  missions: [],
  planetIntel: [],
  lesserBeingMemory: {},
  proceduralArchive: [],
  timers: {
    mapReopenAllowedAtMs: 0,
    grimoireReopenAllowedAtMs: 0,
    inventoryReopenAllowedAtMs: 0
  },
  landing: {
    status: { ready: true, context: null },
    threat: { active: false, reasons: [] }
  },
  runtime: {
    frameCount: 0,
    lastFrameTime: 0,
    gameRunning: true
  },
  cooldowns: {
    collisionCooldowns: [],
    dopplerCues: {}
  }
};

const DEFAULT_SYSTEM_ID = 'sol-1';
const DEFAULT_SNAPSHOT_ID = 'snapshot-001';

function buildUniverseSnapshotFixture(systemId: string, snapshotId: string | null, portals: PortalSnapshot[] = []): SolarSystemSnapshot {
  return {
    id: snapshotId ?? `${systemId}-snapshot`,
    sun: { id: `${systemId}-sun`, name: `${systemId} Star`, position: vec(0, 0, 0), radius: 1500 },
    planets: [
      {
        id: `${systemId}-planet-1`,
        name: 'Fixture Prime',
        kind: 'terrestrial',
        position: vec(60_000, 0, 0),
        radius: 400,
        baseColorName: 'azul_marino',
        orbit: { center: vec(0, 0, 0), semiMajor: 60_000, semiMinor: 54_000, orientation: 0 }
      }
    ],
    clusters: [],
    portals,
    meta: { proceduralSystemId: systemId, persistentSystemId: systemId }
  };
}

const DEFAULT_UNIVERSE_SNAPSHOT: SolarSystemSnapshot = buildUniverseSnapshotFixture(DEFAULT_SYSTEM_ID, DEFAULT_SNAPSHOT_ID);

export function createRichSaveGameHarnessOptions(): SaveGameHarnessOptions {
  const player = buildRichPlayerSection();
  const gameState = buildRichGameStateSection();
  const universeSnapshot = buildRichUniverseSnapshot();
  const playerResetState = buildRichPlayerResetState();
  return {
    player,
    gameState,
    universeSnapshot,
    systemId: 'helios-binary',
    snapshotId: universeSnapshot.id ?? 'snapshot-helio',
    playerResetState,
    frameCount: 12_600,
    lastFrameTime: 215_000,
    snapshotLabel: universeSnapshot.id ?? 'rich-snapshot',
    identity: UNKNOWN_IDENTITY,
    token: 'token-rich-fixture'
  };
}

export function createRichSaveGameHarness(): SaveGameHarness {
  return new SaveGameHarness(createRichSaveGameHarnessOptions());
}

export function createGateRiteMismatchHarnessOptions(options?: {
  anchorSystemId?: string;
  destinationSystemId?: string;
  destinationSnapshotId?: string | null;
}): SaveGameHarnessOptions {
  const anchorSystemId = options?.anchorSystemId ?? 'sol-origin';
  const destinationSystemId = options?.destinationSystemId ?? 'gate-destination';
  const destinationSnapshotId = options?.destinationSnapshotId ?? `${destinationSystemId}-snapshot`;
  const player = deepClone(DEFAULT_PLAYER_SECTION);
  if (player.respawn.activeAnchor) {
    player.respawn.activeAnchor.systemId = anchorSystemId;
    player.respawn.activeAnchor.label = player.respawn.activeAnchor.label ?? 'Origin Anchor';
    player.respawn.activeAnchor.snapshotLabel = player.respawn.activeAnchor.snapshotLabel ?? 'Origin Anchor Snapshot';
    player.respawn.activeAnchor.snapshotId = player.respawn.activeAnchor.snapshotId ?? 'origin-anchor-snapshot';
    player.respawn.lastAnchorLabel = player.respawn.activeAnchor.label;
  }
  const universeSnapshot = buildUniverseSnapshotFixture(destinationSystemId, destinationSnapshotId ?? null);
  return {
    player,
    universeSnapshot,
    systemId: destinationSystemId,
    snapshotId: destinationSnapshotId ?? null,
    snapshotLabel: universeSnapshot.id ?? 'gate-destination-snapshot'
  };
}

function buildRichPlayerSection(): SaveGamePlayerSection {
  const equipmentLoadout: Record<EquipmentSlot, EquipmentSlotState | null> = {
    [EquipmentSlot.CORE]: {
      slot: EquipmentSlot.CORE,
      label: 'Helios Core Mk.II',
      rarity: RarityTier.UNIQUE,
      capabilities: ['warp-buffer', 'q-lattice']
    },
    [EquipmentSlot.REACTOR]: {
      slot: EquipmentSlot.REACTOR,
      label: 'Binary Reactor',
      rarity: RarityTier.RARE,
      capabilities: ['aux-power', 'shield-overclock']
    },
    [EquipmentSlot.WINGS]: {
      slot: EquipmentSlot.WINGS,
      label: 'Graviton Sails',
      rarity: RarityTier.UNCOMMON,
      capabilities: ['drift-control']
    },
    [EquipmentSlot.HULL]: {
      slot: EquipmentSlot.HULL,
      label: 'Composite Plating',
      rarity: RarityTier.RARE,
      description: 'Resiste micrometeoros y retiene calor solar.'
    },
    [EquipmentSlot.SHIELD]: {
      slot: EquipmentSlot.SHIELD,
      label: 'Solar Bloom',
      rarity: RarityTier.UNIQUE,
      capabilities: ['solar-flare-dampener']
    },
    [EquipmentSlot.DRONE_BAY]: {
      slot: EquipmentSlot.DRONE_BAY,
      label: 'Skitterling Bay',
      rarity: RarityTier.UNCOMMON,
      capabilities: ['salvage-drones']
    },
    [EquipmentSlot.AUXILIARY]: {
      slot: EquipmentSlot.AUXILIARY,
      label: 'Auxiliary Glyph Grid',
      rarity: RarityTier.UNIQUE,
      capabilities: ['aux-slot-1', 'aux-slot-2']
    }
  };

  const cargoManifest: CargoManifestEntry[] = [
    {
      id: 'cargo-metallic',
      type: CargoItemType.RAW_MATERIAL,
      label: 'Ferrous Meteoroids',
      massTons: 18,
      units: 12,
      source: GameObjectType.ASTEROID,
      rarity: RarityTier.UNCOMMON,
      composition: 'metallic'
    },
    {
      id: 'cargo-organic',
      type: CargoItemType.ORGANIC_SAMPLE,
      label: 'Spore Lattices',
      massTons: 6,
      units: 5,
      source: GameObjectType.PLANET,
      rarity: RarityTier.RARE,
      composition: 'organic'
    },
    {
      id: 'cargo-void',
      type: CargoItemType.ENERGY_CORE,
      label: 'Void Capacitors',
      massTons: 4,
      units: 3,
      source: 'FABRICATED',
      rarity: RarityTier.UNIQUE,
      composition: 'mixed'
    }
  ];

  const personalGear = [
    {
      slot: PersonalGearSlot.SUIT,
      label: 'Solaris Exo-suit',
      description: 'Blindaje térmico +2 aux slots.',
      rarity: RarityTier.UNIQUE,
      accessorySlots: 2
    },
    {
      slot: PersonalGearSlot.BOOTS,
      label: 'Grav Loafers',
      description: '+15 agarre en estaciones orbitales.',
      rarity: RarityTier.RARE
    },
    {
      slot: PersonalGearSlot.ACCESSORY,
      label: 'Mnemonic Locket',
      rarity: RarityTier.UNCOMMON
    }
  ];

  const knownSpells = [
    SpellType.GATE_RITE,
    SpellType.PORTAL_CONCORD,
    SpellType.ANCHORING_PULSE,
    SpellType.VOID_KINESIS,
    SpellType.RESPAWN_SIGILLUM
  ];

  const grimoireLayout: SaveGamePlayerSection['inventory']['grimoireLayout'] = {
    [SpellType.GATE_RITE]: { nx: 0.15, ny: 0.32 },
    [SpellType.PORTAL_CONCORD]: { nx: 0.52, ny: 0.18 },
    [SpellType.ANCHORING_PULSE]: { nx: 0.72, ny: 0.65 }
  };

  const anchorBase = {
    anchorId: 'anchor-helio-main',
    systemId: 'helios-binary',
    snapshotId: 'snapshot-helio',
    snapshotLabel: 'Helios Binary Archive',
    planetId: 'ring-1',
    planetName: 'Aurelia',
    createdAt: 1_700_010_500_000,
    label: 'Helios Gate',
    shipPosition: vec(12000, 140, -40),
    shipForward: vec(0.1, 0.98, 0),
    shipVelocity: vec(0, 0, 0),
    shipOrientation: {
      quaternion: [0, 0, 0.1, 0.99] as [number, number, number, number],
      forward: vec(0.1, 0.98, 0),
      up: vec(0, 0, 1)
    },
    landingSite: {
      surfacePoint: vec(12050, 120, -10),
      surfaceNormal: vec(0, 1, 0),
      radius: 30
    }
  };

  return {
    ship: {
      position: vec(11800, 200, -80),
      velocity: vec(0, 0, 0),
      driftVelocity: vec(0.3, -0.2, 0),
      orientation: {
        quaternion: [0, 0.05, 0.1, 0.99] as [number, number, number, number],
        forward: vec(0.08, 0.99, 0),
        up: vec(0, 0, 1)
      },
      forward: vec(0.08, 0.99, 0),
      up: vec(0, 0, 1),
      speed: {
        current: 18,
        target: 26,
        max: 32,
        acceleration: 4,
        deceleration: 3,
        rotationSpeed: 2,
        minRotationSpeed: 0.3
      },
      voidEnergy: {
        current: 70,
        max: 120,
        paused: false
      },
      cargoCapacity: {
        max: 140,
        current: 32
      },
      status: {
        outOfVoidEnergy: false,
        thrusterState: 'CRUISE'
      },
      health: { current: 92, max: 120 }
    },
    character: {
      profile: {
        name: 'Verena K.',
        sanity: 74,
        health: 88,
        memory: 14,
        level: 6,
        experience: 640,
        experienceMax: 800,
        age: {
          years: 37,
          days: 210,
          totalDays: 37 * 365 + 210
        },
        survivability: 89
      },
      memoryPercent: 42,
      characterId: 'pilot-helio'
    },
    inventory: {
      personalGear,
      equipmentLoadout,
      cargoManifest,
      knownSpells,
      grimoireLayout
    },
    respawn: {
      activeAnchor: anchorBase,
      defaultAnchor: { ...anchorBase, anchorId: 'anchor-helio-default', label: 'Default Helios' },
      lastAnchorLabel: anchorBase.label
    }
  };
}

function buildRichGameStateSection(): SaveGameGameStateSection {
  const missions = createRichMissions();
  return {
    missions,
    planetIntel: createRichPlanetIntelSnapshots(missions),
    lesserBeingMemory: createRichLesserBeingMemory(),
    proceduralArchive: createRichProceduralArchive(),
    timers: {
      mapReopenAllowedAtMs: Date.now() + 1_000,
      grimoireReopenAllowedAtMs: Date.now() + 2_000,
      inventoryReopenAllowedAtMs: Date.now() + 500
    },
    landing: {
      status: { ready: true, context: null },
      threat: { active: true, reasons: ['radiation-spike', 'portal-wake'] }
    },
    runtime: {
      frameCount: 10_000,
      lastFrameTime: 180_000,
      gameRunning: true
    },
    cooldowns: {
      collisionCooldowns: [
        { objectId: 'portal-alpha', allowDamageAt: Date.now() + 5_000 },
        { objectId: 'cluster-trail', allowDamageAt: Date.now() + 12_000 }
      ],
      dopplerCues: {
        'ship-main': { shift: 0.12, velocity: 4 },
        'lesser-being': { shift: -0.05, velocity: -3 }
      }
    }
  };
}

function buildRichUniverseSnapshot(): SolarSystemSnapshot {
  return {
    id: 'snapshot-helio',
    sun: { id: 'sun-a', name: 'Helios A', position: vec(0, 0, 0), radius: 5_000 },
    planets: [
      {
        id: 'planet-ring',
        name: 'Aurelia',
        kind: 'ringed',
        position: vec(12_000, 150, -40),
        radius: 950,
        baseColorName: 'gris',
        visited: true,
        hasArtifact: true,
        orbit: { center: vec(0, 0, 0), semiMajor: 12_000, semiMinor: 11_500, orientation: 0 }
      },
      {
        id: 'planet-earth',
        name: 'Tellurion',
        kind: 'terrestrial',
        position: vec(-8_500, -120, 90),
        radius: 700,
        baseColorName: 'azul_marino'
      }
    ],
    clusters: [
      { id: 'cluster-trail', center: vec(15_000, 500, 0), direction: vec(-1, 0, 0), speed: 5, count: 120, radius: 900, includeSuper: true }
    ],
    portals: [
      { id: 'portal-alpha', position: vec(5_500, -60, 0), radius: 420, linkedPortalId: 'portal-beta', concordSealActive: true },
      { id: 'portal-beta', position: vec(-11_000, 80, 120), radius: 380, linkedPortalId: 'portal-alpha', concordSealActive: false }
    ],
    meta: {
      proceduralSystemId: 'helios-binary',
      persistentSystemId: 'helios-binary',
      elderGod: 'Cthulhu',
      lesserBeingMemory: [
        { id: 'lb-runtime-1', type: LesserBeing.SHOGGOTH, position: vec(11_800, 220, -70), hasLanded: false },
        { id: 'lb-runtime-2', type: LesserBeing.VAMPIRO_FUEGO, position: vec(-7_900, -140, 60), hasLanded: false }
      ]
    }
  };
}

function buildRichPlayerResetState(): PlayerResetState {
  return {
    position: vec(11_900, 180, -60),
    velocity: vec(0.5, 0, 0),
    orientation: {
      quaternion: [0, 0.05, 0.1, 0.99] as [number, number, number, number],
      forward: vec(0.08, 0.99, 0),
      up: vec(0, 0, 1)
    },
    shipHealth: { current: 90, max: 120 },
    voidEnergy: 68,
    sanity: 74,
    vitality: 83,
    restoredStat: 'void'
  };
}

function createRichMissions(): PlanetMissionState[] {
  const now = Date.now();
  const clues = (missionId: string, tiers: MissionClueTier[]): MissionClueToken[] =>
    tiers.map((tier, index) => ({
      id: `${missionId}-clue-${index}`,
      tier,
      summary: `Clue ${index} for ${missionId}`,
      method: index % 2 === 0 ? 'bribe' : 'subtask',
      obtainedAt: now - index * 10_000,
      cost: { metal: 1 }
    }));
  return [
    {
      id: 'mission-aurelia',
      race: PlanetInhabitants.LENG,
      type: 'artifact',
      targetLocation: { systemId: 'helios-binary', planetId: 'ring-1' },
      itemId: 'artifact-ring',
      status: 'in-progress',
      requiredClueTiers: ['minor', 'major'],
      clueTokens: clues('mission-aurelia', ['minor']),
      log: [],
      reward: { memorySharePct: 6, resources: { metal: 3 } },
      subTasks: [
        {
          id: 'mission-aurelia-subtask',
          label: 'Stabilize ring miners',
          status: 'in-progress',
          rewardTier: 'major',
          lastUpdatedAt: now - 5_000
        }
      ]
    },
    {
      id: 'mission-tellurion',
      race: PlanetInhabitants.PROFUNDOS,
      type: 'material',
      targetLocation: { systemId: 'ringworld-7', planetId: 'earth-analog' },
      itemId: 'void-sand',
      status: 'ready-to-turn-in',
      requiredClueTiers: ['minor', 'major', 'final'],
      clueTokens: clues('mission-tellurion', ['minor', 'major', 'final']),
      log: [],
      reward: { experience: 250, uniqueGlyphId: 'glyph-void' },
      subTasks: []
    }
  ];
}

function createRichPlanetIntelSnapshots(missions: PlanetMissionState[]): PlanetIntelSnapshot[] {
  const now = Date.now();
  return [
    {
      planetId: 'ring-1',
      planetName: 'Aurelia',
      inhabitants: PlanetInhabitants.LENG,
      lesserBeing: null,
      pendingMission: missions[0],
      resourceStock: { metal: 4, organic: 1 },
      landingLog: [],
      visited: true,
      lifeScanned: true,
      creatureScanned: false,
      updatedAt: now,
      hasArtifact: true,
      artifactIntelStatus: PLANET_INTEL_STATUS.CONFIRMED_PRESENT,
      hasVoidMass: true,
      voidMassCapacity: 48,
      voidMassRemaining: 27,
      voidMassIntelStatus: PLANET_INTEL_STATUS.CONFIRMED_PRESENT,
      civilizationIntelStatus: PLANET_INTEL_STATUS.CONFIRMED_PRESENT,
      lesserBeingIntelStatus: PLANET_INTEL_STATUS.CONFIRMED_ABSENT,
      animosity: undefined
    },
    {
      planetId: 'earth-analog',
      planetName: 'Tellurion',
      inhabitants: PlanetInhabitants.PROFUNDOS,
      lesserBeing: null,
      pendingMission: missions[1],
      resourceStock: { organic: 3, metal: 1 },
      landingLog: [],
      visited: false,
      lifeScanned: false,
      creatureScanned: false,
      updatedAt: now - 20_000,
      hasArtifact: false,
      artifactIntelStatus: PLANET_INTEL_STATUS.UNKNOWN,
      hasVoidMass: true,
      voidMassCapacity: 60,
      voidMassRemaining: 60,
      voidMassIntelStatus: PLANET_INTEL_STATUS.CONFIRMED_PRESENT,
      civilizationIntelStatus: PLANET_INTEL_STATUS.UNKNOWN,
      lesserBeingIntelStatus: PLANET_INTEL_STATUS.CONFIRMED_PRESENT,
      animosity: undefined
    }
  ];
}

function createRichLesserBeingMemory(): Record<string, LesserBeingInstanceSnapshot[]> {
  return {
    'helios-binary': [
      {
        id: 'memory-shoggoth',
        type: LesserBeing.SHOGGOTH,
        position: vec(11_500, 220, -90),
        velocity: vec(-0.5, 0, 0),
        hasLanded: false,
        health: { current: 120, max: 150 },
        metadata: { patrol: 'ring-sector' }
      }
    ],
    'ringworld-7': [
      {
        id: 'memory-vampire',
        type: LesserBeing.VAMPIRO_FUEGO,
        position: vec(-7_500, -140, 50),
        velocity: vec(0.2, 0.1, 0),
        hasLanded: true,
        landedPlanetId: 'earth-analog',
        metadata: { burrowed: true }
      }
    ]
  };
}

function createRichProceduralArchive(): SolarSystemSnapshot[] {
  return [
    {
      id: 'snapshot-helio',
      sun: { id: 'helio-star-a', name: 'Helios A', position: vec(0, 0, 0), radius: 5_000 },
      planets: [
        {
          id: 'ring-1',
          name: 'Aurelia',
          kind: 'RINGED',
          position: vec(12_000, 0, 0),
          radius: 950,
          orbit: { center: vec(0, 0, 0), semiMajor: 12_000, semiMinor: 11_500, orientation: 0 },
          baseColorName: 'amber',
          visited: true,
          hasArtifact: true
        },
        {
          id: 'earth-analog',
          name: 'Tellurion',
          kind: 'EARTH_LIKE',
          position: vec(-8_500, 0, 0),
          radius: 700,
          baseColorName: 'blue'
        }
      ],
      clusters: [
        {
          id: 'cluster-trail',
          center: vec(15_000, 500, 0),
          direction: vec(-1, 0, 0),
          speed: 5,
          count: 120,
          radius: 900,
          includeSuper: true
        }
      ],
      portals: [
        { id: 'portal-alpha', position: vec(5_500, -60, 0), radius: 420, linkedPortalId: 'portal-beta' },
        { id: 'portal-beta', position: vec(-11_000, 80, 120), radius: 380, linkedPortalId: 'portal-alpha' }
      ],
      meta: {
        proceduralSystemId: 'helios-binary',
        secondarySun: { id: 'helio-star-b', position: vec(400, 0, 0), radius: 4_700 }
      }
    },
    {
      id: 'snapshot-ringworld',
      sun: { id: 'ring-star', name: 'Nyx', position: vec(0, 0, 0), radius: 4_000 },
      planets: [
        {
          id: 'ringworld-primary',
          name: 'Cinturon',
          kind: 'RINGWORLD',
          position: vec(7_000, 0, 0),
          radius: 1_200,
          orbit: { center: vec(0, 0, 0), semiMajor: 7_000, semiMinor: 6_900, orientation: 0.5 }
        }
      ],
      clusters: [],
      portals: [],
      meta: { proceduralSystemId: 'ringworld-7' }
    }
  ];
}

function vec(x: number, y: number, z: number): Vector3 {
  return { x, y, z };
}

function createDefaultHarnessFixtures(options?: Partial<SaveGameHarnessOptions>): SaveGameHarnessFixtures {
  const playerSection = deepClone(options?.player ?? DEFAULT_PLAYER_SECTION);
  const gameStateSection = deepClone(options?.gameState ?? DEFAULT_GAME_STATE_SECTION);
  const universeSnapshot = deepClone(options?.universeSnapshot ?? DEFAULT_UNIVERSE_SNAPSHOT);
  const playerResetState = deepClone(options?.playerResetState ?? DEFAULT_PLAYER_RESET_STATE);
  const systemId = options?.systemId ?? resolveSystemId(universeSnapshot) ?? DEFAULT_SYSTEM_ID;
  const snapshotId = options?.snapshotId ?? resolveSnapshotId(universeSnapshot) ?? DEFAULT_SNAPSHOT_ID;
  return {
    playerSection,
    gameStateSection,
    universeSnapshot,
    systemId,
    snapshotId,
    playerResetState,
    identity: options?.identity ?? UNKNOWN_IDENTITY,
    token: options?.token ?? 'token-fixture',
    frameCount: options?.frameCount ?? 1800,
    lastFrameTime: options?.lastFrameTime ?? 30_000,
    snapshotLabel: options?.snapshotLabel ?? snapshotId ?? 'fixture-snapshot'
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
