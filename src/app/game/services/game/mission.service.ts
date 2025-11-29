import { Injectable } from '@angular/core';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';
import { GameStateStore } from '../../../services/game/game-state.store';
import { Planet } from '../../game-objects/Planet';
import { PlanetInhabitants } from '../../types/cosmic-life.types';
import { GameObjectAnimosity } from '../../types/animosity.types';
import {
  MissionClueTier,
  MissionClueToken,
  MissionSubTask,
  MissionSubTaskStatus,
  PlanetMissionState,
  PlanetMissionTarget,
  PlanetMissionType,
  PlanetMissionStatus,
  PlanetMissionReward,
  PlanetMissionLogEntry,
  PlanetResourceStock
} from '../../types/planet-intel.types';

export interface MissionOfferOptions {
  race?: PlanetInhabitants;
  type?: PlanetMissionType;
  description?: string;
  dialogueScriptId?: string;
  targetLocation?: PlanetMissionTarget;
  itemId?: string;
  requiredClueTiers?: MissionClueTier[];
  reward?: PlanetMissionReward;
  missionName?: string;
}

@Injectable({ providedIn: 'root' })
export class MissionService {
  constructor(private readonly gameState: GameStateStore, private readonly logger: LoggingService) {}

  /** Snapshot of all currently active missions. */
  public listMissions(): PlanetMissionState[] {
    return this.gameState.getActiveMissionsSnapshot();
  }

  /** Create (or refresh) a mission for the given planet and return the stored state. */
  public offerMission(planet: Planet, options?: MissionOfferOptions): PlanetMissionState {
    const mission: PlanetMissionState = {
      id: this.generateMissionId(planet.id),
      race: options?.race ?? planet.inhabitants ?? PlanetInhabitants.NONE,
      type: options?.type ?? 'artifact',
      targetLocation: options?.targetLocation ?? this.buildDefaultTarget(planet),
      itemId: options?.itemId ?? this.deriveDefaultItemId(options?.type ?? 'artifact', planet.id),
      description: options?.description,
      dialogueScriptId: options?.dialogueScriptId,
      status: 'offered',
      reward: options?.reward,
      log: [this.makeLogEntry('offered', { planetId: planet.id })],
      missionName: options?.missionName,
      requestedBy: options?.race ?? planet.inhabitants ?? PlanetInhabitants.NONE,
      clueTokens: [],
      requiredClueTiers: options?.requiredClueTiers,
      subTasks: []
    };
    const stored = this.gameState.upsertPlanetMission(mission);
    planet.setPendingMission(stored);
    this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Planet mission offered', {
      missionId: stored.id,
      planetId: planet.id,
      race: stored.race,
      type: stored.type
    });
    return stored;
  }

  public acceptMission(missionId: string): PlanetMissionState | null {
    return this.updateMission(missionId, mission => {
      if (mission.status === 'offered') {
        mission.status = 'accepted';
      }
    }, 'accepted');
  }

  public markInProgress(missionId: string): PlanetMissionState | null {
    return this.updateMission(missionId, mission => {
      mission.status = 'in-progress';
    }, 'in-progress');
  }

  public markReadyForTurnIn(missionId: string): PlanetMissionState | null {
    const snapshot = this.gameState.getPlanetMissionSnapshot(missionId);
    if (!snapshot) {
      return null;
    }
    if (!this.missionMeetsClueRequirements(snapshot)) {
      this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Mission lacks required clues', {
        missionId,
        required: snapshot.requiredClueTiers,
        owned: snapshot.clueTokens?.map(token => token.tier)
      });
      return snapshot;
    }
    return this.updateMission(missionId, mission => {
      mission.status = 'ready-to-turn-in';
    }, 'ready-to-turn-in');
  }

  public completeMission(missionId: string): PlanetMissionState | null {
    const snapshot = this.gameState.getPlanetMissionSnapshot(missionId);
    if (!snapshot) {
      return null;
    }
    if (!this.missionMeetsClueRequirements(snapshot)) {
      this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Mission completion blocked: missing clues', {
        missionId,
        required: snapshot.requiredClueTiers,
        owned: snapshot.clueTokens?.map(token => token.tier)
      });
      return snapshot;
    }
    if (!this.missionHasRequiredCargo(snapshot)) {
      this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Mission completion blocked: delivery cargo missing', {
        missionId,
        requiredCargoEntryId: snapshot.requiredCargoEntryId,
        cargoSize: this.gameState.cargoManifest.length
      });
      return snapshot;
    }
    const updated = this.updateMission(
      missionId,
      mission => {
        mission.status = 'completed';
      },
      'completed'
    );
    if (updated) {
      this.consumeMissionCargo(updated);
      this.promotePlanetToAlly(updated);
      this.restorePilotVitals();
      this.applyMissionReward(updated);
      this.detachMission(updated.id);
    }
    return updated;
  }

  public hasRequiredCargoReady(missionId: string): boolean {
    const snapshot = this.gameState.getPlanetMissionSnapshot(missionId);
    if (!snapshot) {
      return false;
    }
    return this.missionHasRequiredCargo(snapshot);
  }

  public failMission(missionId: string, reason?: string): PlanetMissionState | null {
    const updated = this.updateMission(
      missionId,
      mission => {
        mission.status = 'failed';
      },
      'failed',
      reason ? { reason } : undefined
    );
    if (updated) {
      this.detachMission(updated.id);
    }
    return updated;
  }

  public appendLog(missionId: string, event: string, payload?: Record<string, any>): PlanetMissionState | null {
    return this.updateMission(missionId, () => void 0, event, payload);
  }

  /** Registers or updates a sub-task available for this mission. */
  public registerSubTask(missionId: string, task: Omit<MissionSubTask, 'status' | 'lastUpdatedAt'> & { status?: MissionSubTaskStatus }): PlanetMissionState | null {
    return this.updateMission(missionId, mission => {
      mission.subTasks = mission.subTasks ?? [];
      const existingIdx = mission.subTasks.findIndex(t => t.id === task.id);
      const now = Date.now();
      const normalized: MissionSubTask = {
        ...task,
        status: task.status ?? 'available',
        lastUpdatedAt: now
      } as MissionSubTask;
      if (existingIdx >= 0) {
        mission.subTasks[existingIdx] = { ...mission.subTasks[existingIdx], ...normalized };
      } else {
        mission.subTasks.push(normalized);
      }
    }, 'subtask-upsert', { taskId: task.id });
  }

  /** Updates sub-task status and optionally grants a clue token upon completion. */
  public setSubTaskStatus(
    missionId: string,
    subTaskId: string,
    status: MissionSubTaskStatus,
    options?: { clueSummary?: string }
  ): PlanetMissionState | null {
    return this.updateMission(missionId, mission => {
      mission.subTasks = mission.subTasks ?? [];
      const target = mission.subTasks.find(task => task.id === subTaskId);
      if (!target) return;
      target.status = status;
      target.lastUpdatedAt = Date.now();
      if (status === 'completed') {
        this.appendClueTokenInternal(mission, target.rewardTier, options?.clueSummary || target.label, 'subtask');
      }
    }, `subtask-${status}`, { subTaskId });
  }

  /** Adds a clue token directly (e.g., bribe or vision). */
  public addClueToken(
    missionId: string,
    tier: MissionClueTier,
    summary: string,
    method: MissionClueToken['method'],
    cost?: Partial<PlanetResourceStock>
  ): PlanetMissionState | null {
    return this.updateMission(missionId, mission => {
      this.appendClueTokenInternal(mission, tier, summary, method, cost);
    }, `clue-${tier}`, { tier, summary, method });
  }

  public hasClueTier(missionId: string, tier: MissionClueTier): boolean {
    const snapshot = this.gameState.getPlanetMissionSnapshot(missionId);
    if (!snapshot) return false;
    return Boolean(snapshot.clueTokens?.some(token => token.tier === tier));
  }

  public getMissingClueTiers(missionId: string): MissionClueTier[] {
    const snapshot = this.gameState.getPlanetMissionSnapshot(missionId);
    if (!snapshot || !snapshot.requiredClueTiers?.length) return [];
    const owned = new Set(snapshot.clueTokens?.map(token => token.tier));
    return snapshot.requiredClueTiers.filter(tier => !owned.has(tier));
  }

  public getMissionSnapshot(missionId: string): PlanetMissionState | null {
    return this.gameState.getPlanetMissionSnapshot(missionId);
  }

  private updateMission(
    missionId: string,
    mutator: (mission: PlanetMissionState) => void,
    event: string,
    payload?: Record<string, any>
  ): PlanetMissionState | null {
    const snapshot = this.gameState.getPlanetMissionSnapshot(missionId);
    if (!snapshot) {
      return null;
    }
    mutator(snapshot);
    snapshot.log = [...snapshot.log, this.makeLogEntry(event, payload)];
    const stored = this.gameState.upsertPlanetMission(snapshot);
    this.syncPlanetPendingMission(stored);
    return stored;
  }

  private syncPlanetPendingMission(mission: PlanetMissionState): void {
    for (const planet of this.gameState.planets) {
      if (planet.pendingMission?.id === mission.id) {
        planet.setPendingMission(mission);
        break;
      }
    }
  }

  private detachMission(missionId: string): void {
    this.gameState.removePlanetMission(missionId);
    for (const planet of this.gameState.planets) {
      if (planet.pendingMission?.id === missionId) {
        planet.setPendingMission(null);
      }
    }
  }

  private applyMissionReward(mission: PlanetMissionState): void {
    const reward = mission.reward;
    if (!reward) {
      return;
    }
    if (typeof reward.memorySharePct === 'number') {
      const delta = Math.max(0, reward.memorySharePct);
      this.gameState.memoryPercent = Math.min(100, this.gameState.memoryPercent + delta);
      this.gameState.characterProfile.memory = Math.min(100, this.gameState.characterProfile.memory + delta);
    }
    if (typeof reward.experience === 'number' && reward.experience > 0) {
      this.gameState.characterProfile.experience = Math.min(
        this.gameState.characterProfile.experience + reward.experience,
        this.gameState.characterProfile.experienceMax
      );
    }
    // TODO: entregar recursos únicos al inventario de la nave.
    this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Mission reward applied', {
      missionId: mission.id,
      reward
    });
  }

  private buildDefaultTarget(planet: Planet): PlanetMissionTarget {
    return {
      systemId: 'current-system',
      planetId: planet.id
    };
  }

  private appendClueTokenInternal(
    mission: PlanetMissionState,
    tier: MissionClueTier,
    summary: string,
    method: MissionClueToken['method'],
    cost?: Partial<PlanetResourceStock>
  ): void {
    mission.clueTokens = mission.clueTokens ?? [];
    const token: MissionClueToken = {
      id: this.generateClueId(mission.id, tier),
      tier,
      summary,
      method,
      obtainedAt: Date.now(),
      cost
    };
    mission.clueTokens.push(token);
  }

  private missionMeetsClueRequirements(mission: PlanetMissionState): boolean {
    if (!mission.requiredClueTiers || !mission.requiredClueTiers.length) {
      return true;
    }
    const owned = new Set((mission.clueTokens || []).map(token => token.tier));
    return mission.requiredClueTiers.every(tier => owned.has(tier));
  }

  private missionHasRequiredCargo(mission: PlanetMissionState): boolean {
    if (!mission.requiredCargoEntryId) {
      return true;
    }
    return this.gameState.cargoManifest.some(entry => entry.id === mission.requiredCargoEntryId);
  }

  private consumeMissionCargo(mission: PlanetMissionState): void {
    if (!mission.requiredCargoEntryId) {
      return;
    }
    const removed = this.gameState.removeCargoEntry(mission.requiredCargoEntryId);
    this.logger.log(removed ? LogLevel.INFO : LogLevel.WARN, LogCategory.LANDING, 'Mission cargo delivery processed', {
      missionId: mission.id,
      cargoEntryId: mission.requiredCargoEntryId,
      removed
    });
  }

  private promotePlanetToAlly(mission: PlanetMissionState): void {
    const planetId = mission.targetLocation.planetId;
    if (!planetId) {
      return;
    }
    const planet = this.gameState.findPlanetById(planetId);
    if (!planet) {
      return;
    }
    try { planet.setAnimosity(GameObjectAnimosity.FRIENDLY); } catch {}
    planet.setPendingMission(null);
    this.gameState.syncPlanetIntelFromPlanet(planet);
  }

  private restorePilotVitals(): void {
    this.gameState.updateCharacterVitals({ health: 100, sanity: 100 });
  }

  private generateClueId(missionId: string, tier: MissionClueTier): string {
    return `${missionId}-clue-${tier}-${Date.now().toString(36)}`;
  }

  private deriveDefaultItemId(type: PlanetMissionType, planetId: string): string {
    if (type === 'material') {
      return `mat-${planetId}`;
    }
    return `artifact-${planetId}`;
  }

  private generateMissionId(seed: string): string {
    return `mission-${seed}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  }

  private makeLogEntry(event: string, payload?: Record<string, any>): PlanetMissionLogEntry {
    return {
      timestamp: Date.now(),
      event,
      payload
    };
  }
}
