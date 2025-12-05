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
      const effectiveAnchor = this.resolveEffectiveAnchor(options.forceAnchor);

      const playerState = this.buildPlayerResetState(effectiveAnchor, options.cause ?? 'UNKNOWN');
      const targetSystemId = effectiveAnchor.systemId ?? 'human-system';
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

      throw new Error('GameEngine.restartWithContext is not available');
    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Respawn failed', { error });
      this.resumeLoop();
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
    const ship = this.gameState.spaceship as any;
    const maxCandidate = Number(ship?.voidEnergyMax);
    if (Number.isFinite(maxCandidate) && maxCandidate > 0) {
      return maxCandidate;
    }
    const fallback = Number.isFinite(ship?.voidEnergyCurrent)
      ? Math.max(1, ship.voidEnergyCurrent)
      : 100;
    this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Void energy max missing during respawn state build. Using fallback value.', {
      fallback,
      hasShip: Boolean(ship)
    });
    return fallback;
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

  private resolveAnchorById(anchorId?: string | null): RespawnAnchorMetadata | null {
    if (!anchorId) {
      return this.gameState.getEffectiveRespawnAnchor();
    }
    const anchor = this.gameState.getRespawnAnchor();
    if (anchor && anchor.anchorId === anchorId) {
      return anchor;
    }
    const fallback = this.gameState.getDefaultRespawnAnchor();
    if (fallback && fallback.anchorId === anchorId) {
      return fallback;
    }
    return null;
  }

  private zeroVec(): Vector3 { return { x: 0, y: 0, z: 0 }; }

  private requireEngine(): GameEngine {
    const engine = this.gameInitializer.getGameEngine();
    if (!engine) {
      throw new Error('GameEngine instance is not initialized');
    }
    return engine;
  }

  private resolveEffectiveAnchor(forceAnchor?: RespawnAnchorMetadata | null): RespawnAnchorMetadata {
    if (forceAnchor) {
      return forceAnchor;
    }
    const anchor = this.gameState.getEffectiveRespawnAnchor();
    if (!anchor) {
      throw new Error('No respawn anchors available');
    }
    return anchor;
  }
}
