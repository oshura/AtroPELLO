import { Injectable } from '@angular/core';
import type { GameEngine } from '../../../game/GameEngine';
import { PortalPersistenceService } from '../game/portal-persistence.service';
import { GameStateStore } from '../../../services/game/game-state.store';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';
import { SolarSystemSnapshot } from '../../types/solar-system.types';
import {
  GameStartContext,
  HealthSnapshot,
  PlayerResetState,
  RuntimeSolarSystemState,
  RuntimeStateSource,
  SerializedGameObjectState,
  SerializedLesserBeingState,
  SerializedPortalState,
  SerializedUniversePayload
} from '../../types/universe-state.types';
import { RespawnAnchorMetadata, OrientationSnapshot } from '../../types/respawn.types';
import { GameObject } from '../../GameObject';
import { GameObjectType } from '../../types/game-object.types';
import { Vector3 } from '../../../types/game.types';
import { LesserBeingInstanceSnapshot } from '../../types/cosmic-life.types';
import { GameInitializer } from '../../../services/game/game-initializer.service';

export interface EnsureSystemStateOptions {
  snapshot?: SolarSystemSnapshot | null;
  snapshotId?: string | null;
  snapshotLabel?: string | null;
  reason?: string;
}

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

  /** Returns a RuntimeSolarSystemState describing the system currently loaded in memory. */
  public captureRuntimeState(systemId?: string): RuntimeSolarSystemState {
    const resolvedSystemId = systemId ?? this.getCurrentSystemId() ?? 'unknown-system';
    const payload = this.captureLivePayload(resolvedSystemId);
    return {
      systemId: resolvedSystemId,
      snapshotId: this.getCurrentSnapshotId(),
      source: RuntimeStateSource.LIVE,
      capturedAt: Date.now(),
      payload
    };
  }

  /** Builds a runtime descriptor directly from an embedded serialized payload (fallback path). */
  public buildRuntimeStateFromPayload(
    systemId: string,
    payload: SerializedUniversePayload,
    snapshotId?: string | null,
    reason?: string
  ): RuntimeSolarSystemState {
    if (!payload) {
      throw new Error('Serialized universe payload is empty.');
    }
    this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Using embedded universe payload for runtime state', {
      systemId,
      snapshotId: snapshotId ?? null,
      reason
    });
    return {
      systemId,
      snapshotId: snapshotId ?? null,
      source: RuntimeStateSource.SNAPSHOT,
      capturedAt: Date.now(),
      payload
    };
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
        snapshotId: requestedSnapshot.id ?? requestedSnapshot.meta?.['proceduralSystemId'] ?? null,
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

  private captureLivePayload(systemId: string): SerializedUniversePayload {
    return {
      objects: this.captureGameObjects(),
      portals: this.capturePortals(),
      lesserBeings: this.captureLesserBeings(systemId),
      environment: { ambientScene: (this.engine as any)?.audio?.currentScene ?? null }
    };
  }

  private captureGameObjects(): SerializedGameObjectState[] {
    const objects = this.gameState.getAllObjects();
    return objects.map(obj => this.serializeGameObject(obj));
  }

  private capturePortals(): SerializedPortalState[] {
    return this.gameState.portals.map(portal => ({
      id: portal.id,
      position: { ...portal.position },
      linkedPortalId: portal.linkedPortalId,
      radius: portal.radius,
      custom: {
        animosity: portal.animosity,
        concordSealActive: (portal as any).concordSealActive ?? false
      }
    }));
  }

  private captureLesserBeings(systemId: string): SerializedLesserBeingState[] {
    const snapshots: LesserBeingInstanceSnapshot[] = this.gameState.getLesserBeingSnapshots(systemId);
    return snapshots.map(s => ({
      id: s.id,
      archetype: s.type,
      position: { ...s.position },
      velocity: s.velocity ? { ...s.velocity } : null,
      custom: this.cloneLesserBeingCustom(s)
    }));
  }

  private cloneLesserBeingCustom(snapshot: LesserBeingInstanceSnapshot): Record<string, any> | null {
    const payload: Record<string, any> = {};
    if (snapshot.forward) {
      payload['forward'] = { ...snapshot.forward };
    }
    if (snapshot.hasLanded !== undefined) {
      payload['hasLanded'] = snapshot.hasLanded;
    }
    if (snapshot.landedPlanetId) {
      payload['landedPlanetId'] = snapshot.landedPlanetId;
    }
    if (snapshot.health) {
      payload['health'] = { ...snapshot.health };
    }
    if (snapshot.metadata) {
      payload['metadata'] = { ...snapshot.metadata };
    }
    return Object.keys(payload).length ? payload : null;
  }

  private serializeGameObject(obj: GameObject): SerializedGameObjectState {
    const position = { ...obj.position };
    const velocity = obj.velocity ? { ...obj.velocity } : undefined;
    const scale = obj.scale ? { ...obj.scale } : undefined;
    return {
      id: obj.id,
      type: typeof obj.getType === 'function' ? obj.getType() : GameObjectType.UNKNOWN,
      position,
      velocity,
      scale,
      orientation: this.captureOrientation(obj),
      health: this.captureHealth(obj),
      custom: undefined
    };
  }

  private captureOrientation(obj: GameObject): OrientationSnapshot | null {
    const asAny = obj as any;
    if (typeof asAny.getOrientationQuaternion === 'function') {
      const quatValue = asAny.getOrientationQuaternion();
      const matrixValue = asAny.getOrientationMatrix?.();
      return {
        quaternion: Array.isArray(quatValue) ? (quatValue as [number, number, number, number]) : undefined,
        matrix: Array.isArray(matrixValue) ? (matrixValue as number[]) : undefined,
        forward: this.cloneVec(asAny.forwardVector),
        up: this.cloneVec(asAny.upVector)
      };
    }
    return null;
  }

  private captureHealth(obj: GameObject): HealthSnapshot | null {
    const current = (obj as any)?.healthCurrent;
    const max = (obj as any)?.healthMax;
    if (typeof current === 'number' && typeof max === 'number') {
      return { current, max };
    }
    return null;
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
        snapshotId: snapshot.id ?? snapshot.meta?.['proceduralSystemId'] ?? null,
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
        const idMatches = candidate.id === snapshotId || candidate.meta?.['proceduralSystemId'] === snapshotId;
        if (idMatches) {
          return this.cloneSnapshot(candidate);
        }
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Failed to iterate portal snapshots', { error });
    }
    return null;
  }

  private getCurrentSystemId(): string | null {
    const snapshot = this.getCurrentSnapshot();
    return snapshot ? this.resolveSystemIdFromSnapshot(snapshot) : null;
  }

  private getCurrentSnapshotId(): string | null {
    const snapshot = this.getCurrentSnapshot();
    if (!snapshot) return null;
    return snapshot.id ?? snapshot.meta?.['proceduralSystemId'] ?? snapshot.meta?.['systemId'] ?? null;
  }

  private getCurrentSnapshot(): SolarSystemSnapshot | null {
    const snapshot = (this.engine as any)?.currentSnapshot;
    return snapshot ?? null;
  }

  private resolveSystemIdFromSnapshot(snapshot: SolarSystemSnapshot | null): string | null {
    if (!snapshot) return null;
    return snapshot.meta?.['proceduralSystemId']
      || snapshot.meta?.['systemId']
      || snapshot.id
      || null;
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

  private cloneVec(vec?: Vector3 | null): Vector3 | null {
    if (!vec) return null;
    return { x: vec.x, y: vec.y, z: vec.z };
  }
}
