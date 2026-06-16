import { Injectable } from '@angular/core';
import type { GameEngine } from '../../../game/GameEngine';
import { PortalPersistenceService } from '../game/portal-persistence.service';
import { GameStateStore } from '../../../services/game/game-state.store';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';
import { SolarSystemSnapshot } from '../../types/solar-system.types';
import { resolveSnapshotId, resolveSystemId } from '../game/system-identity';
import {
  GameStartContext,
  PlayerResetState,
  RuntimeSolarSystemState,
  RuntimeStateSource
} from '../../types/universe-state.types';
import { RespawnAnchorMetadata } from '../../types/respawn.types';
import { GameInitializer } from '../../../services/game/game-initializer.service';

export interface EnsureSystemStateOptions {
  snapshot?: SolarSystemSnapshot | null;
  snapshotId?: string | null;
  snapshotLabel?: string | null;
  reason?: string;
}

export interface AdoptSnapshotOptions {
  /** Snapshot embebido en la partida guardada a aplicar como sistema activo. */
  snapshot: SolarSystemSnapshot;
  /** Id lógico del sistema destino (normalmente metadata.systemId del savegame). */
  systemId?: string | null;
  /** Etiqueta bajo la que persistir el snapshot (se pinea para respawns posteriores). */
  snapshotLabel?: string | null;
  reason?: string;
}

/**
 * Coordina la captura y restauración del sistema solar activo en forma de SolarSystemSnapshot.
 *
 * Tras la Fase 4 (docs/ARQUITECTURA.md §4.3) hay UNA sola representación del mundo: el snapshot.
 * - Guardar partida   → `captureCurrentSnapshot()`
 * - Cargar partida     → `adoptSnapshot()` (mismo camino que cruzar un portal)
 * - Respawn / portal   → `ensureSystemState()` / `buildRestartContext()`
 */
@Injectable({ providedIn: 'root' })
export class UniverseStateSnapshotService {
  constructor(
    private readonly gameInitializer: GameInitializer,
    private readonly gameState: GameStateStore,
    private readonly portalPersistence: PortalPersistenceService,
    private readonly logger: LoggingService
  ) {}

  private get engine(): GameEngine {
    const engine = this.gameInitializer.getGameEngine();
    if (!engine) {
      throw new Error('GameEngine not initialized');
    }
    return engine;
  }

  /**
   * Captura el sistema solar activo como snapshot autocontenido (para guardar la partida).
   * Es la misma representación que se usa al viajar por portal o al reaparecer.
   */
  public captureCurrentSnapshot(): SolarSystemSnapshot {
    const engine = this.engine;
    const serializer = engine.runtimeSerializer;
    const snapshot = serializer ? serializer.captureCurrentSnapshot(engine) : this.getCurrentSnapshot();
    if (!snapshot) {
      throw new Error('No active solar system snapshot available to capture.');
    }
    return this.cloneSnapshot(snapshot);
  }

  /**
   * Adopta un snapshot embebido (de una partida guardada) como sistema activo: lo persiste bajo
   * una etiqueta pineada y lo aplica al mundo. Es el ÚNICO camino de carga, idéntico a cruzar un
   * portal. Devuelve el descriptor runtime usado para construir el contexto de reinicio.
   */
  public adoptSnapshot(options: AdoptSnapshotOptions): RuntimeSolarSystemState {
    const snapshot = this.cloneSnapshot(options.snapshot);
    const systemId = this.firstNonEmpty(options.systemId, resolveSystemId(snapshot)) ?? 'unknown-system';
    const label = this.normalizeSnapshotLabel(options.snapshotLabel, systemId);
    snapshot.meta = { ...(snapshot.meta || {}), snapshotLabel: label };
    this.portalPersistence.save(label, snapshot);
    this.portalPersistence.pin(label);
    const applied = this.applySnapshot(snapshot, options.reason ?? 'load-game');
    if (!applied) {
      this.logger.log(LogLevel.ERROR, LogCategory.SAVE_SYSTEM, 'Failed to apply embedded savegame snapshot', {
        systemId,
        label
      });
    }
    try {
      this.gameInitializer.getGameEngine()?.setCurrentSnapshotLabel?.(label, { mutateSnapshot: false });
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.SAVE_SYSTEM, 'Failed to set current snapshot label after adopt', { label, error });
    }
    return {
      systemId,
      snapshotId: resolveSnapshotId(snapshot),
      source: RuntimeStateSource.SNAPSHOT,
      capturedAt: Date.now(),
      payload: null
    };
  }

  public pinSnapshotLabel(label: string | null | undefined): void {
    this.portalPersistence.pin(label);
  }

  public unpinSnapshotLabel(label: string | null | undefined): void {
    this.portalPersistence.unpin(label);
  }

  /** Ensure that the requested systemId is loaded; reuse live state when already active. */
  public ensureSystemState(systemId: string, options?: EnsureSystemStateOptions): RuntimeSolarSystemState {
    const requestedSnapshot = this.resolveSnapshotFromOptions(options);
    if (requestedSnapshot) {
      const appliedState = this.applySnapshot(requestedSnapshot, options?.reason ?? 'ensureSystemState');
      if (appliedState) {
        return appliedState;
      }
      return {
        systemId,
        snapshotId: resolveSnapshotId(requestedSnapshot),
        source: RuntimeStateSource.SNAPSHOT,
        capturedAt: Date.now(),
        payload: null
      };
    }

    const currentId = this.getCurrentSystemId();
    if (currentId && currentId === systemId) {
      this.logger.log(LogLevel.INFO, LogCategory.SOLAR_SYSTEM_GENERATION, 'Universe state reused live store', { systemId });
      return {
        systemId,
        snapshotId: this.getCurrentSnapshotId(),
        source: RuntimeStateSource.LIVE,
        capturedAt: Date.now(),
        payload: null
      };
    }

    this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Unable to resolve snapshot for system', {
      requestedSystemId: systemId,
      snapshotId: options?.snapshotId,
      label: options?.snapshotLabel,
      reason: options?.reason
    });
    return {
      systemId,
      snapshotId: null,
      source: RuntimeStateSource.LIVE,
      capturedAt: Date.now(),
      payload: null
    };
  }

  /** Expose current system id for services needing fallback anchors. */
  public getActiveSystemId(): string | null {
    return this.getCurrentSystemId();
  }

  /** Expose current snapshot id when available. */
  public getActiveSnapshotId(): string | null {
    return this.getCurrentSnapshotId();
  }

  /** Builds a restart context combining runtime state and player reset data. */
  public buildRestartContext(params: {
    targetSystemId: string;
    playerState: PlayerResetState;
    respawnAnchor?: RespawnAnchorMetadata | null;
    reason: GameStartContext['restartReason'];
    snapshotOptions?: EnsureSystemStateOptions;
  }): GameStartContext {
    const runtimeState = this.ensureSystemState(params.targetSystemId, params.snapshotOptions);
    return {
      targetSystemId: params.targetSystemId,
      runtimeState,
      playerState: params.playerState,
      respawnAnchor: params.respawnAnchor ?? null,
      restartReason: params.reason
    };
  }

  private applySnapshot(snapshot: SolarSystemSnapshot, reason: string): RuntimeSolarSystemState | null {
    try {
      const applied = this.engine.applySolarSystemSnapshot(snapshot);
      this.logger.log(LogLevel.INFO, LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot applied via universe state service', {
        reason,
        systemId: this.resolveSystemIdFromSnapshot(snapshot),
        portalsCreated: applied?.portalsCreated?.length || 0
      });
      return {
        systemId: this.resolveSystemIdFromSnapshot(snapshot) || 'unknown-system',
        snapshotId: resolveSnapshotId(snapshot),
        source: RuntimeStateSource.SNAPSHOT,
        capturedAt: Date.now(),
        payload: null
      };
    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot application failed', { error });
      return null;
    }
  }

  private resolveSnapshotByLabel(label?: string | null): SolarSystemSnapshot | null {
    if (!label) return null;
    if (typeof this.portalPersistence.get !== 'function') return null;
    try {
      const snapshot = this.portalPersistence.get(label);
      return snapshot ? this.cloneSnapshot(snapshot) : null;
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Failed to resolve snapshot by label', { label, error });
      return null;
    }
  }

  private resolveSnapshotById(snapshotId?: string | null): SolarSystemSnapshot | null {
    if (!snapshotId) return null;
    try {
      const entries = this.portalPersistence.list();
      for (const entry of entries) {
        const candidate = this.portalPersistence.get(entry.label);
        if (!candidate) continue;
        if (resolveSnapshotId(candidate) === snapshotId) {
          return this.cloneSnapshot(candidate);
        }
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Failed to iterate portal snapshots', { error });
    }
    return null;
  }

  private getCurrentSystemId(): string | null {
    return this.resolveSystemIdFromSnapshot(this.getCurrentSnapshot());
  }

  private getCurrentSnapshotId(): string | null {
    return resolveSnapshotId(this.getCurrentSnapshot());
  }

  private getCurrentSnapshot(): SolarSystemSnapshot | null {
    const snapshot = (this.engine as any)?.currentSnapshot;
    return snapshot ?? null;
  }

  private resolveSystemIdFromSnapshot(snapshot: SolarSystemSnapshot | null): string | null {
    // Identidad canónica: system-identity.ts (única fuente).
    return resolveSystemId(snapshot);
  }

  private cloneSnapshot(snapshot: SolarSystemSnapshot): SolarSystemSnapshot {
    return JSON.parse(JSON.stringify(snapshot)) as SolarSystemSnapshot;
  }

  private resolveSnapshotFromOptions(options?: EnsureSystemStateOptions): SolarSystemSnapshot | null {
    if (!options) {
      return null;
    }
    if (options.snapshot) {
      return this.cloneSnapshot(options.snapshot);
    }
    if (options.snapshotLabel) {
      const snapshot = this.resolveSnapshotByLabel(options.snapshotLabel);
      if (snapshot) {
        return snapshot;
      }
      // If we're currently inside the requested system, refresh the label before giving up
      const engineSnapshot = this.getCurrentSnapshot();
      if (engineSnapshot && (engineSnapshot.meta?.['snapshotLabel'] === options.snapshotLabel)) {
        try {
          const refreshed = this.gameInitializer.getGameEngine()?.runtimeSerializer?.saveWithLabel(options.snapshotLabel, this.gameInitializer.getGameEngine());
          if (refreshed) {
            return JSON.parse(JSON.stringify(refreshed)) as SolarSystemSnapshot;
          }
        } catch (error) {
          this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Failed to refresh missing snapshot label', {
            label: options.snapshotLabel,
            error
          });
        }
      }
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot label not found in persistence', {
        label: options.snapshotLabel,
        reason: options.reason
      });
    }
    if (options.snapshotId) {
      return this.resolveSnapshotById(options.snapshotId);
    }
    return null;
  }

  private normalizeSnapshotLabel(label: string | null | undefined, systemId: string): string {
    if (typeof label === 'string' && label.trim().length) {
      return label.trim();
    }
    return `savegame-${systemId}`;
  }

  private firstNonEmpty(...values: Array<string | null | undefined>): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length) {
        return value.trim();
      }
    }
    return null;
  }
}
