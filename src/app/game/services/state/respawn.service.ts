import { Injectable } from '@angular/core';
import type { GameEngine } from '../../../game/GameEngine';
import { GameStateStore } from '../../../services/game/game-state.store';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';
import { UniverseStateSnapshotService } from './universe-state-snapshot.service';
import { GameStartContext, GameRestartReason, PlayerResetState } from '../../types/universe-state.types';
import { OrientationSnapshot, RespawnAnchorMetadata } from '../../types/respawn.types';
import { Vector3 } from '../../../types/game.types';
import { GameInitializer } from '../../../services/game/game-initializer.service';

export type DeathCause = 'SHIP_DESTROYED' | 'ZERO_HEALTH' | 'ZERO_SANITY' | 'UNKNOWN';

interface RespawnOptions {
  forceAnchor?: RespawnAnchorMetadata | null;
  reason?: GameRestartReason;
  cause?: DeathCause;
}

@Injectable({ providedIn: 'root' })
export class RespawnService {
  constructor(
    private readonly gameInitializer: GameInitializer,
    private readonly gameState: GameStateStore,
    private readonly universeState: UniverseStateSnapshotService,
    private readonly logger: LoggingService
  ) {}

  /** Public entry-point to respawn after death. */
  public respawnFromDeath(cause: DeathCause): void {
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Respawn requested', { cause });
    this.performRespawn({ cause, reason: 'RESPAWN' });
  }

  /** Debug helper: respawn at a specific anchor id or fallback to default. */
  public respawnAtAnchor(anchorId?: string | null): void {
    const anchor = this.resolveAnchorById(anchorId);
    this.performRespawn({ forceAnchor: anchor, reason: 'DEBUG', cause: 'UNKNOWN' });
  }

  private performRespawn(options: RespawnOptions): void {
    try {
      this.pauseLoop();
      const anchor = options.forceAnchor ?? this.gameState.getRespawnAnchor();
      const effectiveAnchor = anchor ?? this.createFallbackAnchor();

      if (!effectiveAnchor) {
        this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Respawn aborted: no anchor available');
        if (!this.startLegacyRespawn('missing-anchor')) {
          this.resumeLoop();
        }
        return;
      }

      const playerState = this.buildPlayerResetState(effectiveAnchor, options.cause ?? 'UNKNOWN');
      const targetSystemId = effectiveAnchor.systemId ?? 'human-start';
      const context: GameStartContext = this.universeState.buildRestartContext({
        targetSystemId,
        playerState,
        respawnAnchor: effectiveAnchor,
        reason: options.reason ?? 'RESPAWN',
        snapshotOptions: {
          snapshotId: effectiveAnchor.snapshotId ?? null,
          snapshotLabel: effectiveAnchor.snapshotLabel ?? null,
          reason: 'respawn-anchor'
        }
      });
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Respawn context prepared', {
        systemId: context.targetSystemId,
        reason: context.restartReason,
        anchorId: effectiveAnchor.anchorId
      });

      const engine = this.requireEngine();

      if (typeof engine.restartWithContext === 'function') {
        engine.restartWithContext(context);
        return;
      }

      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'GameEngine.restartWithContext missing, falling back to legacy respawn');
      if (!this.startLegacyRespawn('restartWithContext-missing')) {
        this.resumeLoop();
      }
    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Respawn failed', { error });
      if (!this.startLegacyRespawn('respawn-error')) {
        this.resumeLoop();
      }
    }
  }

  private pauseLoop(): void {
    try {
      const engine = this.requireEngine();
      engine.setAudioPausedForGame?.(true);
      engine.stop?.();
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed pausing loop/audio', { error });
    }
  }

  private resumeLoop(): void {
    try {
      const engine = this.gameInitializer.getGameEngine();
      engine?.setAudioPausedForGame?.(false);
      engine?.start?.();
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed resuming loop/audio', { error });
    }
  }

  private buildPlayerResetState(anchor: RespawnAnchorMetadata, cause: DeathCause): PlayerResetState {
    const shipHealth = this.resolveShipHealthState(cause);
    const voidEnergy = this.resolveVoidEnergy();
    const { sanity, vitality, restoredStat } = this.resolveCharacterStats(cause);
    return {
      position: { ...anchor.shipPosition },
      velocity: anchor.shipVelocity ? { ...anchor.shipVelocity } : this.zeroVec(),
      orientation: anchor.shipOrientation ?? null,
      shipHealth,
      voidEnergy,
      sanity,
      vitality,
      restoredStat
    };
  }

  private resolveShipHealthState(cause: DeathCause): PlayerResetState['shipHealth'] {
    const ship = this.gameState.spaceship;
    const max = ship?.healthMax ?? 540;
    const current = cause === 'SHIP_DESTROYED' ? Math.max(1, max) : max;
    return { current, max };
  }

  private resolveVoidEnergy(): number {
    const ship = this.gameState.spaceship;
    return (ship as any)?.voidEnergyMax ?? 100;
  }

  private resolveCharacterStats(cause: DeathCause): { sanity: number; vitality: number; restoredStat: 'health' | 'sanity' | 'void' | null } {
    const profile = this.gameState.characterProfile;
    let sanity = profile.sanity;
    let vitality = profile.health;
    let restoredStat: 'health' | 'sanity' | 'void' | null = null;
    if (cause === 'ZERO_SANITY') {
      sanity = Math.max(1, sanity);
      restoredStat = 'sanity';
    } else if (cause === 'ZERO_HEALTH') {
      vitality = Math.max(1, vitality);
      restoredStat = 'health';
    }
    return { sanity, vitality, restoredStat };
  }

  private createFallbackAnchor(): RespawnAnchorMetadata | null {
    const now = Date.now();
    const sun = this.gameState.sun as any;
    const referencePosition = sun?.position ?? { x: 0, y: 0, z: 0 };
    const scale = Number(sun?.scale?.x ?? 3000);
    const safeDistance = Math.max(8000, scale * 3);
    const approachVector = this.normalize({ x: 0.65, y: 0.15, z: 1 });
    const shipPosition = {
      x: referencePosition.x + approachVector.x * safeDistance,
      y: referencePosition.y + approachVector.y * safeDistance,
      z: referencePosition.z + approachVector.z * safeDistance
    };

    const forward = this.normalize({
      x: referencePosition.x - shipPosition.x,
      y: referencePosition.y - shipPosition.y,
      z: referencePosition.z - shipPosition.z
    });

    const shipOrientation: OrientationSnapshot = {
      quaternion: [0, 0, 0, 1],
      forward,
      up: { x: 0, y: 1, z: 0 }
    };

    return {
      anchorId: `fallback-${now}`,
      systemId: this.universeState.getActiveSystemId() ?? 'human-start',
      snapshotId: this.universeState.getActiveSnapshotId(),
      snapshotLabel: null,
      createdAt: now,
      shipPosition,
      shipVelocity: this.zeroVec(),
      shipOrientation,
      planetName: sun?.customName ?? 'Solar Beacon',
      label: 'Trail Entry'
    };
  }

  private captureShipOrientation(ship: any): OrientationSnapshot | null {
    try {
      if (!ship || typeof ship.getOrientationQuaternion !== 'function') {
        return null;
      }

      const quatValue = ship.getOrientationQuaternion();
      const quaternion: [number, number, number, number] = [
        Number(quatValue[0] ?? 0),
        Number(quatValue[1] ?? 0),
        Number(quatValue[2] ?? 0),
        Number(quatValue[3] ?? 1)
      ];
      const basis = typeof ship.getOrientationBasis === 'function' ? ship.getOrientationBasis() : null;
      return {
        quaternion,
        forward: basis?.forward ? { ...basis.forward } : null,
        up: basis?.up ? { ...basis.up } : null
      };
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to capture fallback orientation', { error });
      return null;
    }
  }

  private resolveAnchorById(anchorId?: string | null): RespawnAnchorMetadata | null {
    if (!anchorId) {
      return this.gameState.getRespawnAnchor();
    }
    const anchor = this.gameState.getRespawnAnchor();
    if (anchor && anchor.anchorId === anchorId) {
      return anchor;
    }
    return null;
  }

  private zeroVec(): Vector3 { return { x: 0, y: 0, z: 0 }; }

  private normalize(vec: Vector3): Vector3 {
    const length = Math.hypot(vec.x, vec.y, vec.z) || 1;
    return { x: vec.x / length, y: vec.y / length, z: vec.z / length };
  }

  private startLegacyRespawn(reason: string): boolean {
    try {
      const engine = this.gameInitializer.getGameEngine();
      if (engine && typeof (engine as any).respawnGame === 'function') {
        this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Falling back to legacy respawn', { reason });
        (engine as any).respawnGame();
        return true;
      }
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Legacy respawn unavailable', { reason });
    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Legacy respawn fallback failed', { error, reason });
    }
    return false;
  }

  private requireEngine(): GameEngine {
    const engine = this.gameInitializer.getGameEngine();
    if (!engine) {
      throw new Error('GameEngine instance is not initialized');
    }
    return engine;
  }
}
