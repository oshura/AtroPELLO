import { Injectable } from '@angular/core';
import { GameStateStore } from '../game-state.store';
import { SaveGameGameStateSection, SaveGameCooldownState, SaveGameTimerState } from '../../../game/types/save-game.types';
import { LandingStatus, LandingThreatState } from '../../../game/types/landing.types';

@Injectable({ providedIn: 'root' })
export class GameStateSnapshotAdapter {
  constructor(private readonly gameState: GameStateStore) {}

  capture(): SaveGameGameStateSection {
    return {
      missions: this.gameState.getActiveMissionsSnapshot(),
      planetIntel: this.gameState.getPlanetIntelSnapshots(),
      lesserBeingMemory: this.gameState.getLesserBeingMemorySnapshot(),
      proceduralArchive: this.gameState.getProceduralSystemArchiveSnapshot(),
      timers: this.captureTimers(),
      landing: this.captureLandingState(),
      runtime: {
        frameCount: this.gameState.frameCount,
        lastFrameTime: this.gameState.lastFrameTime,
        gameRunning: this.gameState.gameRunning
      },
      cooldowns: this.captureCooldowns()
    };
  }

  restore(section: SaveGameGameStateSection | null | undefined): void {
    if (!section) {
      return;
    }
    this.restoreMissions(section.missions ?? []);
    this.restorePlanetIntel(section.planetIntel ?? []);
    this.restoreLesserBeingMemory(section.lesserBeingMemory ?? {});
    this.gameState.replaceProceduralSystemArchive(section.proceduralArchive ?? []);
    this.restoreTimers(section.timers);
    this.restoreLanding(section.landing);
    this.restoreRuntime(section.runtime);
    this.restoreCooldowns(section.cooldowns);
  }

  private captureTimers(): SaveGameTimerState {
    return {
      mapReopenAllowedAtMs: this.gameState.mapReopenAllowedAtMs,
      grimoireReopenAllowedAtMs: this.gameState.grimoireReopenAllowedAtMs,
      inventoryReopenAllowedAtMs: this.gameState.inventoryReopenAllowedAtMs
    };
  }

  private captureLandingState(): { status: LandingStatus; threat: LandingThreatState } {
    const statusSource = this.gameState.landingStatus;
    const threatSource = this.gameState.landingThreat;
    return {
      status: {
        ready: statusSource.ready,
        context: statusSource.context ? { ...statusSource.context } : null
      },
      threat: {
        active: threatSource.active,
        reasons: [...threatSource.reasons]
      }
    };
  }

  private captureCooldowns(): SaveGameCooldownState {
    return {
      collisionCooldowns: this.gameState.getCollisionCooldownSnapshot(),
      dopplerCues: this.gameState.getDopplerCueSnapshot()
    };
  }

  private restoreMissions(missions: SaveGameGameStateSection['missions']): void {
    this.gameState.activeMissions.clear();
    for (const mission of missions) {
      if (!mission) {
        continue;
      }
      this.gameState.upsertPlanetMission(mission);
    }
  }

  private restorePlanetIntel(entries: SaveGameGameStateSection['planetIntel']): void {
    this.gameState.clearPlanetIntelCache();
    for (const snapshot of entries) {
      if (!snapshot?.planetId) {
        continue;
      }
      this.gameState.upsertPlanetIntelSnapshot(snapshot.planetId, snapshot);
    }
  }

  private restoreLesserBeingMemory(memory: SaveGameGameStateSection['lesserBeingMemory']): void {
    this.gameState.lesserBeingMemoryBySystem.clear();
    for (const [systemId, snapshots] of Object.entries(memory)) {
      if (!systemId || !Array.isArray(snapshots)) {
        continue;
      }
      this.gameState.saveLesserBeingSnapshots(systemId, snapshots);
    }
  }

  private restoreTimers(timers: SaveGameTimerState | null | undefined): void {
    if (!timers) {
      this.gameState.mapReopenAllowedAtMs = 0;
      this.gameState.grimoireReopenAllowedAtMs = 0;
      this.gameState.inventoryReopenAllowedAtMs = 0;
      return;
    }
    this.gameState.mapReopenAllowedAtMs = this.safeNumber(timers.mapReopenAllowedAtMs);
    this.gameState.grimoireReopenAllowedAtMs = this.safeNumber(timers.grimoireReopenAllowedAtMs);
    this.gameState.inventoryReopenAllowedAtMs = this.safeNumber(timers.inventoryReopenAllowedAtMs);
  }

  private restoreLanding(landing: SaveGameGameStateSection['landing'] | null | undefined): void {
    if (!landing) {
      this.gameState.setLandingStatus({ ready: false, context: null });
      this.gameState.setLandingThreat({ active: false, reasons: [] });
      return;
    }
    this.gameState.setLandingStatus(landing.status);
    this.gameState.setLandingThreat(landing.threat);
  }

  private restoreRuntime(runtime: SaveGameGameStateSection['runtime'] | null | undefined): void {
    if (!runtime) {
      this.gameState.frameCount = 0;
      this.gameState.lastFrameTime = 0;
      this.gameState.gameRunning = false;
      return;
    }
    this.gameState.frameCount = Math.max(0, Math.floor(this.safeNumber(runtime.frameCount)));
    this.gameState.lastFrameTime = this.safeNumber(runtime.lastFrameTime);
    this.gameState.gameRunning = Boolean(runtime.gameRunning);
  }

  private restoreCooldowns(cooldowns: SaveGameCooldownState | null | undefined): void {
    this.gameState.collisionCooldowns.clear();
    this.gameState.dopplerCues.clear();
    if (!cooldowns) {
      return;
    }
    for (const entry of cooldowns.collisionCooldowns ?? []) {
      if (!entry?.objectId) {
        continue;
      }
      this.gameState.collisionCooldowns.set(entry.objectId, this.safeNumber(entry.allowDamageAt));
    }
    if (cooldowns.dopplerCues) {
      for (const [objectId, cue] of Object.entries(cooldowns.dopplerCues)) {
        if (!objectId) {
          continue;
        }
        this.gameState.dopplerCues.set(objectId, this.cloneJson(cue));
      }
    }
  }

  private safeNumber(value: number | undefined): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Number(value);
  }

  private cloneJson<T>(value: T): T {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value as T;
    }
  }
}
