import { Injectable } from '@angular/core';
import type { GameEngine } from '../../game/GameEngine';
import {
  SAVEGAME_SCHEMA_VERSION,
  SaveGameAudioState,
  SaveGameMetadata,
  SaveGamePayload,
  SaveGameRespawnState,
  SaveGameUiState
} from '../../game/types/save-game.types';
import { GameInitializer } from './game-initializer.service';
import { GameStateStore } from './game-state.store';
import { UniverseStateSnapshotService, EnsureSystemStateOptions } from '../../game/services/state/universe-state-snapshot.service';
import { LoggingService, LogCategory, LogLevel } from '../logging.service';
import { PlayerStateSerializer } from './persistence/player-state.serializer';
import { GameStateSnapshotAdapter } from './persistence/game-state.snapshot-adapter';
import { UniverseStateSnapshotAdapter } from './persistence/universe-state.snapshot-adapter';
import { RuntimeSolarSystemState, SerializedUniversePayload, GameStartContext } from '../../game/types/universe-state.types';
import { RespawnAnchorMetadata } from '../../game/types/respawn.types';
import { CloudSavesSessionBridgeService } from '../../libs/cloud-saves/cloud-saves-session-bridge.service';
import {
  LoadGameInProgressError,
  SaveGameCaptureError,
  SaveGameEngineUnavailableError,
  SaveGameInProgressError,
  SaveGamePayloadInvalidError,
  SaveGameSchemaVersionMismatchError
} from './persistence/save-game.errors';
import { SaveGameMigrationService } from './persistence/save-game.migration.service';

export interface SaveGameCaptureOptions {
  reason?: string;
  includeUiState?: boolean;
  includeAudioState?: boolean;
  label?: string | null;
  skipPause?: boolean;
}

interface ResolvedSaveGameCaptureOptions {
  reason: string;
  includeUiState: boolean;
  includeAudioState: boolean;
  label: string | null;
  skipPause: boolean;
}

export interface LoadGameOptions {
  reason?: string;
  skipPause?: boolean;
}

interface ResolvedLoadGameOptions {
  reason: string;
  skipPause: boolean;
}

export interface LoadGameResult {
  metadata: SaveGameMetadata;
  durationMs: number;
}

@Injectable({ providedIn: 'root' })
export class GamePersistenceService {
  private captureInProgress = false;
  private loadInProgress = false;
  private readonly buildLabel = this.resolveBuildLabel();

  constructor(
    private readonly gameInitializer: GameInitializer,
    private readonly gameState: GameStateStore,
    private readonly universeState: UniverseStateSnapshotService,
    private readonly playerStateSerializer: PlayerStateSerializer,
    private readonly gameStateSnapshotAdapter: GameStateSnapshotAdapter,
    private readonly universeStateSnapshotAdapter: UniverseStateSnapshotAdapter,
    private readonly logger: LoggingService,
    private readonly cloudSessionBridge: CloudSavesSessionBridgeService,
    private readonly migrationService: SaveGameMigrationService
  ) {}

  async saveGame(options?: SaveGameCaptureOptions): Promise<SaveGamePayload> {
    const resolved = this.resolveOptions(options);
    this.ensureNotBusy(resolved.reason);
    this.captureInProgress = true;

    const systemId = this.universeState.getActiveSystemId();
    const hasSpaceship = Boolean(this.gameState.spaceship);
    this.logger.log(LogLevel.DEBUG, LogCategory.SAVE_SYSTEM, 'SaveGame capture requested', {
      reason: resolved.reason,
      systemId,
      hasSpaceship,
      includeUiState: resolved.includeUiState,
      includeAudioState: resolved.includeAudioState
    });

    const startedAt = this.now();
    try {
      const payload = await this.withLoopPaused(resolved.reason, resolved.skipPause, async () => {
        const playerSection = this.playerStateSerializer.capture();
        const gameStateSection = this.gameStateSnapshotAdapter.capture();
        const runtimeState = this.universeStateSnapshotAdapter.capture();
        this.logger.log(LogLevel.DEBUG, LogCategory.SAVE_SYSTEM, 'Player state serialized', {
          hasShip: Boolean(this.gameState.spaceship),
          cargoEntries: playerSection.inventory.cargoManifest.length,
          knownSpells: playerSection.inventory.knownSpells.length,
          anchor: playerSection.respawn.lastAnchorLabel
        });
        this.logger.log(LogLevel.DEBUG, LogCategory.SAVE_SYSTEM, 'Game state snapshot captured', {
          missions: gameStateSection.missions.length,
          planetIntel: gameStateSection.planetIntel.length,
          lesserBeingSystems: Object.keys(gameStateSection.lesserBeingMemory).length
        });
        this.logger.log(LogLevel.DEBUG, LogCategory.SAVE_SYSTEM, 'Universe runtime snapshot captured', {
          systemId: runtimeState.systemId,
          payloadObjects: runtimeState.payload?.objects.length ?? 0,
          portals: runtimeState.payload?.portals?.length ?? 0,
          source: runtimeState.source
        });
        const metadata = await this.buildMetadata({
          runtimeState,
          respawn: playerSection.respawn,
          captureLabel: resolved.label
        });
        const payload: SaveGamePayload = {
          schemaVersion: SAVEGAME_SCHEMA_VERSION,
          metadata,
          player: playerSection,
          universe: runtimeState.payload ?? this.buildEmptyUniversePayload(),
          gameState: gameStateSection,
          ui: resolved.includeUiState ? this.captureUiStateSnapshot() : null,
          audio: resolved.includeAudioState ? this.captureAudioStateSnapshot() : null
        };
        const payloadBytes = this.estimatePayloadBytes(payload);
        this.logger.log(LogLevel.INFO, LogCategory.SAVE_SYSTEM, 'SaveGame payload assembled', {
          schemaVersion: payload.schemaVersion,
          systemId: metadata.systemId,
          systemName: metadata.systemName ?? null,
          anchorLabel: metadata.anchorLabel ?? null,
          payloadBytes
        });
        return payload;
      });
      return payload;
    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.SAVE_SYSTEM, 'SaveGame capture failed', { reason: resolved.reason, error });
      if (
        error instanceof SaveGameCaptureError ||
        error instanceof SaveGameInProgressError ||
        error instanceof SaveGameEngineUnavailableError
      ) {
        throw error;
      }
      throw new SaveGameCaptureError('Failed to capture game state payload', { cause: error });
    } finally {
      this.captureInProgress = false;
      const durationMs = this.now() - startedAt;
      this.logger.log(LogLevel.DEBUG, LogCategory.SAVE_SYSTEM, 'SaveGame request finished', {
        reason: resolved.reason,
        durationMs
      });
    }
  }

  private buildEmptyUniversePayload(): SerializedUniversePayload {
    return { objects: [] };
  }

  private async applyLoadedPayload(payload: SaveGamePayload, reason: string): Promise<void> {
    if (!payload.player) {
      throw new SaveGamePayloadInvalidError('SaveGame payload is missing the player section.');
    }
    if (!payload.gameState) {
      throw new SaveGamePayloadInvalidError('SaveGame payload is missing the gameState section.');
    }

    this.gameState.reset();
    this.gameStateSnapshotAdapter.restore(payload.gameState);
    const playerResetState = this.playerStateSerializer.apply(payload.player);
    const anchor = this.cloneRespawnAnchor(this.resolvePrimaryAnchor(payload.player.respawn));
    const targetSystemId = this.resolveTargetSystemId(payload, anchor);
    const snapshotOptions = this.buildSnapshotOptions({ payload, anchor });

    if (!snapshotOptions) {
      if (payload.universe) {
        try {
          this.universeStateSnapshotAdapter.restoreFromPayload({
            systemId: targetSystemId,
            payload: payload.universe,
            snapshotId: payload.metadata.respawnAnchorId ?? null,
            reason
          });
        } catch (restoreError) {
          this.logger.log(LogLevel.WARN, LogCategory.SAVE_SYSTEM, 'Failed to inspect embedded universe payload during load fallback', {
            error: restoreError
          });
        }
      }
      throw new SaveGamePayloadInvalidError('SaveGame payload is missing snapshot metadata required to restore the universe state.');
    }

    const runtimeState = this.universeState.ensureSystemState(targetSystemId, snapshotOptions);
    const context: GameStartContext = {
      targetSystemId,
      runtimeState,
      playerState: playerResetState,
      respawnAnchor: anchor,
      restartReason: 'LOAD_GAME'
    };

    const engine = this.requireEngine();
    if (typeof engine.restartWithContext !== 'function') {
      throw new SaveGameEngineUnavailableError();
    }
    engine.restartWithContext(context);
  }

  async loadGame(payload: SaveGamePayload, options?: LoadGameOptions): Promise<LoadGameResult> {
    const resolved = this.resolveLoadOptions(options);
    this.ensureLoadNotBusy(resolved.reason);
    this.loadInProgress = true;
    const startedAt = this.now();
    this.logger.log(LogLevel.DEBUG, LogCategory.SAVE_SYSTEM, 'LoadGame requested', {
      reason: resolved.reason,
      payloadSchema: payload?.schemaVersion
    });

    try {
      const migratedPayload = this.migrationService.migrate(payload);
      await this.withLoopPaused(resolved.reason, resolved.skipPause, async () => {
        await this.applyLoadedPayload(migratedPayload, resolved.reason);
      });
      const durationMs = this.now() - startedAt;
      this.logger.log(LogLevel.INFO, LogCategory.SAVE_SYSTEM, 'LoadGame completed', {
        reason: resolved.reason,
        systemId: migratedPayload.metadata.systemId,
        anchorLabel: migratedPayload.metadata.anchorLabel ?? null,
        durationMs
      });
      return {
        metadata: migratedPayload.metadata,
        durationMs
      };
    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.SAVE_SYSTEM, 'LoadGame failed', {
        reason: resolved.reason,
        error
      });
      if (
        error instanceof SaveGameCaptureError ||
        error instanceof SaveGamePayloadInvalidError ||
        error instanceof SaveGameSchemaVersionMismatchError
      ) {
        throw error;
      }
      throw new SaveGameCaptureError('Unexpected error while loading game payload', { cause: error });
    } finally {
      this.loadInProgress = false;
      const durationMs = this.now() - startedAt;
      this.logger.log(LogLevel.DEBUG, LogCategory.SAVE_SYSTEM, 'LoadGame request finished', {
        reason: resolved.reason,
        durationMs
      });
    }
  }

  private async buildMetadata(params: {
    runtimeState: RuntimeSolarSystemState;
    respawn: SaveGameRespawnState;
    captureLabel: string | null;
  }): Promise<SaveGameMetadata> {
    const anchor = this.resolvePrimaryAnchor(params.respawn);
    const systemId = params.runtimeState.systemId ?? anchor?.systemId ?? 'unknown-system';
    return {
      savedAt: Date.now(),
      elapsedPlayTimeMs: this.estimateElapsedPlayTimeMs(),
      buildLabel: this.buildLabel,
      systemId,
      systemName: this.resolveSystemName(params.runtimeState, anchor, params.captureLabel),
      anchorLabel: this.resolveAnchorLabel(anchor, params.captureLabel),
      anchorPlanetId: anchor?.planetId ?? null,
      anchorPlanetName: anchor?.planetName ?? null,
      respawnAnchorId: anchor?.anchorId ?? null,
      userId: await this.resolveUserIdSafe(),
      backendSlot: null
    };
  }

  private resolvePrimaryAnchor(respawn: SaveGameRespawnState | null | undefined): RespawnAnchorMetadata | null {
    if (!respawn) {
      return null;
    }
    return respawn.activeAnchor ?? respawn.defaultAnchor ?? null;
  }

  private resolveSystemName(
    runtimeState: RuntimeSolarSystemState,
    anchor: RespawnAnchorMetadata | null,
    captureLabel: string | null
  ): string | null {
    const engine = this.gameInitializer.getGameEngine();
    const candidates: Array<string | null | undefined> = [
      engine?.getCurrentSnapshotLabel?.(),
      runtimeState.snapshotId,
      captureLabel,
      anchor?.snapshotLabel,
      anchor?.label,
      runtimeState.systemId,
      anchor?.systemId,
      anchor?.planetName
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
    return null;
  }

  private resolveAnchorLabel(anchor: RespawnAnchorMetadata | null, captureLabel: string | null): string | null {
    const candidates = [anchor?.label, anchor?.snapshotLabel, anchor?.planetName, captureLabel];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
    return null;
  }

  private resolveTargetSystemId(payload: SaveGamePayload, anchor: RespawnAnchorMetadata | null): string {
    const metadataSystemId = payload.metadata.systemId?.trim();
    const anchorSystemId = anchor?.systemId?.trim();
    const activeSystemId = this.universeState.getActiveSystemId();
    return metadataSystemId || anchorSystemId || activeSystemId || 'human-system';
  }

  private buildSnapshotOptions(params: { payload: SaveGamePayload; anchor: RespawnAnchorMetadata | null }): EnsureSystemStateOptions | undefined {
    const activeRespawn = params.payload.player?.respawn;
    const metadata = params.payload.metadata;
    const labelCandidates: Array<string | null | undefined> = [
      metadata.systemName,
      metadata.systemId,
      params.anchor?.snapshotLabel,
      params.anchor?.label,
      activeRespawn?.defaultAnchor?.snapshotLabel,
      params.payload.metadata.anchorLabel,
      activeRespawn?.lastAnchorLabel
    ];
    const snapshotLabel = labelCandidates.find(candidate => typeof candidate === 'string' && candidate.trim().length > 0)?.trim() ?? null;
    const snapshotId = params.anchor?.snapshotId
      ?? activeRespawn?.defaultAnchor?.snapshotId
      ?? metadata.respawnAnchorId
      ?? metadata.systemId
      ?? null;
    if (!snapshotLabel && !snapshotId) {
      return undefined;
    }
    return {
      // Prefer metadata captured at save-time to keep portal transitions consistent
      snapshotLabel,
      snapshotId,
      reason: 'load-game'
    };
  }

  private cloneRespawnAnchor(anchor: RespawnAnchorMetadata | null): RespawnAnchorMetadata | null {
    if (!anchor) {
      return null;
    }
    return {
      ...anchor,
      shipPosition: { ...anchor.shipPosition },
      shipForward: anchor.shipForward ? { ...anchor.shipForward } : null,
      shipVelocity: anchor.shipVelocity ? { ...anchor.shipVelocity } : null,
      shipOrientation: anchor.shipOrientation
        ? {
            quaternion: anchor.shipOrientation.quaternion ? [...anchor.shipOrientation.quaternion] as [number, number, number, number] : undefined,
            matrix: anchor.shipOrientation.matrix ? [...anchor.shipOrientation.matrix] : undefined,
            forward: anchor.shipOrientation.forward ? { ...anchor.shipOrientation.forward } : null,
            up: anchor.shipOrientation.up ? { ...anchor.shipOrientation.up } : null
          }
        : null,
      landingSite: anchor.landingSite
        ? {
            surfacePoint: { ...anchor.landingSite.surfacePoint },
            surfaceNormal: { ...anchor.landingSite.surfaceNormal },
            radius: anchor.landingSite.radius
          }
        : undefined
    };
  }

  private estimateElapsedPlayTimeMs(): number {
    const frameEstimate = this.gameState.frameCount > 0 ? Math.round((this.gameState.frameCount / 60) * 1000) : 0;
    const lastFrameTime = Number.isFinite(this.gameState.lastFrameTime)
      ? Math.max(0, Math.round(this.gameState.lastFrameTime))
      : 0;
    if (frameEstimate && lastFrameTime) {
      return Math.max(frameEstimate, lastFrameTime);
    }
    return frameEstimate || lastFrameTime || 0;
  }

  private async resolveUserIdSafe(): Promise<string | null> {
    try {
      const identity = await this.cloudSessionBridge.getIdentity();
      return identity?.userId ?? null;
    } catch (error) {
      this.logger.log(LogLevel.DEBUG, LogCategory.SAVE_SYSTEM, 'Failed to read identity for save metadata', { error });
      return null;
    }
  }

  private captureUiStateSnapshot(): SaveGameUiState | null {
    this.logger.log(LogLevel.DEBUG, LogCategory.SAVE_SYSTEM, 'UI state capture requested but not implemented yet');
    return null;
  }

  private captureAudioStateSnapshot(): SaveGameAudioState | null {
    this.logger.log(LogLevel.DEBUG, LogCategory.SAVE_SYSTEM, 'Audio state capture requested but not implemented yet');
    return null;
  }

  private estimatePayloadBytes(payload: SaveGamePayload): number {
    const json = JSON.stringify(payload);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(json).length;
    }
    return json.length;
  }

  private resolveBuildLabel(): string {
    const envValue = this.readEnvValue('NG_APP_BUILD_LABEL');
    if (envValue) {
      return envValue;
    }
    const globalLabel = typeof globalThis !== 'undefined' ? (globalThis as any)?.__TO3_BUILD_LABEL__ : undefined;
    if (typeof globalLabel === 'string' && globalLabel.trim().length > 0) {
      return globalLabel.trim();
    }
    return 'TO3.DEV';
  }

  private readEnvValue(key: string): string | null {
    try {
      const env = (import.meta as any)?.env;
      const raw = env?.[key];
      if (typeof raw === 'string' && raw.trim().length > 0) {
        return raw.trim();
      }
    } catch {
      return null;
    }
    return null;
  }

  private resolveOptions(options?: SaveGameCaptureOptions): ResolvedSaveGameCaptureOptions {
    return {
      reason: options?.reason?.trim() || 'manual-save',
      includeUiState: options?.includeUiState ?? false,
      includeAudioState: options?.includeAudioState ?? false,
      label: options?.label ?? null,
      skipPause: options?.skipPause ?? false
    };
  }

  private resolveLoadOptions(options?: LoadGameOptions): ResolvedLoadGameOptions {
    return {
      reason: options?.reason?.trim() || 'manual-load',
      skipPause: options?.skipPause ?? false
    };
  }

  private ensureNotBusy(reason: string): void {
    if (!this.captureInProgress) {
      return;
    }
    this.logger.log(LogLevel.WARN, LogCategory.SAVE_SYSTEM, 'Save request rejected because another capture is running', { reason });
    throw new SaveGameInProgressError();
  }

  private ensureLoadNotBusy(reason: string): void {
    if (!this.loadInProgress) {
      return;
    }
    this.logger.log(LogLevel.WARN, LogCategory.SAVE_SYSTEM, 'Load request rejected because another operation is running', { reason });
    throw new LoadGameInProgressError();
  }

  private async withLoopPaused<T>(reason: string, skipPause: boolean, work: () => Promise<T>): Promise<T> {
    if (skipPause) {
      return await work();
    }
    await this.pauseLoop(reason);
    try {
      return await work();
    } finally {
      await this.resumeLoop(reason);
    }
  }

  private async pauseLoop(reason: string): Promise<void> {
    const engine = this.requireEngine();
    this.logger.log(LogLevel.INFO, LogCategory.SAVE_SYSTEM, 'Pausing game loop for persistence', { reason });
    try {
      engine.setAudioPausedForGame?.(true);
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.SAVE_SYSTEM, 'Failed pausing audio during save', { reason, error });
    }
    try {
      engine.stop?.();
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.SAVE_SYSTEM, 'Failed stopping engine during save', { reason, error });
    }
  }

  private async resumeLoop(reason: string): Promise<void> {
    const engine = this.requireEngine();
    this.logger.log(LogLevel.INFO, LogCategory.SAVE_SYSTEM, 'Resuming game loop after persistence', { reason });
    try {
      engine.setAudioPausedForGame?.(false);
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.SAVE_SYSTEM, 'Failed resuming audio after save', { reason, error });
    }
    try {
      engine.start?.();
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.SAVE_SYSTEM, 'Failed restarting engine after save', { reason, error });
    }
  }

  private requireEngine(): GameEngine {
    const engine = this.gameInitializer.getGameEngine();
    if (!engine) {
      throw new SaveGameEngineUnavailableError();
    }
    return engine;
  }

  private now(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }
}
