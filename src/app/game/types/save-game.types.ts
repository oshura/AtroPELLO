import { Vector3 } from '../../types/game.types';
import { OrientationSnapshot, RespawnAnchorMetadata } from './respawn.types';
import { HealthSnapshot } from './universe-state.types';
import {
  CharacterProfile,
  CargoManifestEntry,
  EquipmentSlot,
  EquipmentSlotState,
  PersonalGearItem
} from './inventory.types';
import { SpellType } from './spell.types';
import { LandingStatus, LandingThreatState } from './landing.types';
import { PlanetIntelSnapshot, PlanetMissionState } from './planet-intel.types';
import { LesserBeingInstanceSnapshot, PlanetInhabitants } from './cosmic-life.types';
import { RaceStanding } from './race.types';
import { SolarSystemSnapshot } from './solar-system.types';
import { ShipOutfitState } from './weapon.types';

/**
 * Versión actual del esquema de partidas guardadas.
 * v2 (Fase 4): `universe` transporta un SolarSystemSnapshot completo en lugar del payload
 * por-objeto. Sin migración desde v1 (decisión: no hay retrocompatibilidad de saves).
 */
export const SAVEGAME_SCHEMA_VERSION = 2;
/** Versión mínima soportada por el cargador. Saves v1 se rechazan. */
export const MIN_SUPPORTED_SAVEGAME_SCHEMA = 2;

/** Payload principal enviado/recibido por Cloud Saves. */
export interface SaveGamePayload {
  schemaVersion: number;
  metadata: SaveGameMetadata;
  player: SaveGamePlayerSection;
  /**
   * Sistema solar activo como snapshot autocontenido (sol, planetas, clusters, portales,
   * debris, meta con lesserBeingMemory/elderGod). Al cargar se aplica por el MISMO camino
   * que cruzar un portal. Es la ÚNICA representación del mundo (ver docs/ARQUITECTURA.md §4.3).
   */
  universe: SolarSystemSnapshot;
  gameState: SaveGameGameStateSection;
  ui?: SaveGameUiState | null;
  audio?: SaveGameAudioState | null;
}

/** Metadatos útiles para listados, migraciones y depuración. */
export interface SaveGameMetadata {
  savedAt: number; // epoch ms
  elapsedPlayTimeMs: number;
  buildLabel: string;
  systemId: string;
  systemName?: string | null;
  snapshotLabel?: string | null;
  snapshotId?: string | null;
  anchorLabel?: string | null;
  anchorPlanetId?: string | null;
  anchorPlanetName?: string | null;
  respawnAnchorId?: string | null;
  userId?: string | null;
  backendSlot?: number | null;
  characterId?: string | null;
  characterSlotIndexes?: number[] | null;
  slotCapacity?: number | null;
  activeSlotIndex?: number | null;
}

/** Sección dedicada al jugador: nave, piloto e inventario. */
export interface SaveGamePlayerSection {
  ship: SaveGameShipState;
  character: SaveGameCharacterState;
  inventory: SaveGameInventoryState;
  respawn: SaveGameRespawnState;
}

export interface SaveGameShipState {
  position: Vector3;
  velocity: Vector3;
  driftVelocity?: Vector3 | null;
  orientation?: OrientationSnapshot | null;
  forward?: Vector3 | null;
  up?: Vector3 | null;
  speed: {
    current: number;
    target: number;
    max: number;
    acceleration: number;
    deceleration: number;
    rotationSpeed?: number;
    minRotationSpeed?: number;
  };
  voidEnergy: {
    current: number;
    max: number;
    paused: boolean;
  };
  cargoCapacity: {
    max: number;
    current: number;
  };
  status: {
    outOfVoidEnergy: boolean;
    thrusterState?: string;
  };
  health: HealthSnapshot;
  /**
   * Equipamiento de la nave: nivel de motor y armas instaladas (Fase 12).
   * Opcional a propósito: los savegames anteriores cargan con el outfit por defecto (sin armas),
   * así que no hace falta migración ni subir SAVEGAME_SCHEMA_VERSION.
   */
  outfit?: ShipOutfitState | null;
}

export interface SaveGameCharacterState {
  profile: CharacterProfile;
  memoryPercent: number;
  characterId?: string | null;
  slotCapacity?: number | null;
  availableSlotIndexes?: number[] | null;
  activeSlotIndex?: number | null;
  /**
   * Hitos de la historia ya ocurridos (Fase 13). Opcional: los savegames anteriores cargan sin
   * ninguno, sin migración.
   */
  storyFlags?: string[] | null;
  /** Reputación con cada raza (Fase 13). Opcional: sin ella, todas empiezan neutrales. */
  raceStandings?: Array<{ race: PlanetInhabitants; standing: RaceStanding }> | null;
}

export interface SaveGameInventoryState {
  personalGear: PersonalGearItem[];
  equipmentLoadout: Record<EquipmentSlot, EquipmentSlotState | null>;
  cargoManifest: CargoManifestEntry[];
  knownSpells: SpellType[];
  grimoireLayout: SaveGameGrimoireLayout;
}

export type SaveGameGrimoireLayout = Partial<Record<SpellType, SaveGameGlyphPosition>>;

export interface SaveGameGlyphPosition {
  nx: number;
  ny: number;
}

export interface SaveGameRespawnState {
  activeAnchor?: RespawnAnchorMetadata | null;
  defaultAnchor?: RespawnAnchorMetadata | null;
  lastAnchorLabel?: string | null;
}

/** Estado complementario del GameStateStore (colecciones y caches). */
export interface SaveGameGameStateSection {
  missions: PlanetMissionState[];
  planetIntel: PlanetIntelSnapshot[];
  lesserBeingMemory: Record<string, LesserBeingInstanceSnapshot[]>;
  proceduralArchive: SolarSystemSnapshot[];
  timers: SaveGameTimerState;
  landing: {
    status: LandingStatus;
    threat: LandingThreatState;
  };
  runtime: {
    frameCount: number;
    lastFrameTime: number;
    gameRunning: boolean;
  };
  cooldowns: SaveGameCooldownState;
}

export interface SaveGameTimerState {
  mapReopenAllowedAtMs: number;
  grimoireReopenAllowedAtMs: number;
  inventoryReopenAllowedAtMs: number;
}

export interface SaveGameCooldownState {
  collisionCooldowns: Array<{ objectId: string; allowDamageAt: number }>;
  dopplerCues?: Record<string, any>;
}

/**
 * Estado opcional de UI. Por ahora sólo usamos placeholders; se rellenará
 * cuando serialicemos PanelEventCoordinator/HUD.
 */
export interface SaveGameUiState {
  panelState?: Record<string, any> | null;
  overlays?: SaveGameOverlayState | null;
}

export interface SaveGameOverlayState {
  landingStatus?: LandingStatus;
  landingThreat?: LandingThreatState;
  activeNotifications?: SaveGameUiNotification[];
}

export interface SaveGameUiNotification {
  id: string;
  category: string;
  message: string;
  createdAt: number;
}

export interface SaveGameAudioState {
  ambientScene?: string | null;
  musicCue?: string | null;
  mutedBuses?: string[];
}
