import { Injectable } from '@angular/core';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';
import { GameStateStore } from '../../../services/game/game-state.store';
import { Planet } from '../../game-objects/Planet';
import { PlanetInhabitants } from '../../types/cosmic-life.types';
import { GameObjectAnimosity } from '../../types/animosity.types';
import {
  MissionClueTier,
  MissionClueToken,
  MissionClueProgress,
  MissionClueTierProgress,
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
import { CargoManifestEntry, CargoItemType, CargoCompositionKind, RarityTier } from '../../types/inventory.types';
import { GameObjectType } from '../../types/game-object.types';

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
  preferredResourceKind?: CargoCompositionKind;
  objectiveSummary?: string;
  targetHint?: string;
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
    const resolvedType = this.determineMissionType(planet, options);
    const mission: PlanetMissionState = {
      id: this.generateMissionId(planet.id),
      race: options?.race ?? planet.inhabitants ?? PlanetInhabitants.NONE,
      type: resolvedType,
      targetLocation: options?.targetLocation ?? this.buildDefaultTarget(planet),
      itemId: options?.itemId ?? this.deriveDefaultItemId(resolvedType, planet.id),
      description: options?.description,
      dialogueScriptId: options?.dialogueScriptId,
      status: 'offered',
      reward: options?.reward,
      log: [this.makeLogEntry('offered', { planetId: planet.id })],
      missionName: options?.missionName,
      requestedBy: options?.race ?? planet.inhabitants ?? PlanetInhabitants.NONE,
      clueTokens: [],
      requiredClueTiers: options?.requiredClueTiers,
      subTasks: [],
      objectiveSummary: options?.objectiveSummary,
      targetHint: options?.targetHint
    };
    this.assignMissionObjective(mission, planet, options);
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

  /** Registers that an artifact was recovered on a given planet and tags matching missions. */
  public registerArtifactRecovery(
    planet: Planet,
    options?: { cargoLabel?: string }
  ): Array<{ mission: PlanetMissionState; cargoEntryId: string }> {
    const matches = this.listMissions().filter(mission => this.shouldAttachArtifactPickup(mission, planet.id));
    const updates: Array<{ mission: PlanetMissionState; cargoEntryId: string }> = [];
    let genericAssigned = false;
    for (const mission of matches) {
      const missionHasSpecificTarget = Boolean(mission.targetLocation?.planetId);
      if (!missionHasSpecificTarget && genericAssigned) {
        continue;
      }
      const label = options?.cargoLabel ?? `Artefacto recuperado en ${this.describePlanet(planet)}`;
      const entry = this.createMissionCargoEntry(mission, { label });
      const updated = this.updateMission(
        mission.id,
        state => {
          state.requiredCargoEntryId = entry.id;
          state.requiredCargoLabel = entry.label;
        },
        'artifact-recovered',
        { planetId: planet.id, cargoEntryId: entry.id }
      );
      if (updated) {
        updates.push({ mission: updated, cargoEntryId: entry.id });
        this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Mission artifact cargo secured', {
          missionId: updated.id,
          planetId: planet.id,
          cargoEntryId: entry.id
        });
        if (!missionHasSpecificTarget) {
          genericAssigned = true;
        }
      }
    }
    return updates;
  }

  /** Evaluates new cargo entries produced by mining to see if they satisfy material missions. */
  public handleCargoRegistered(entry: CargoManifestEntry): PlanetMissionState | null {
    if (!entry) {
      return null;
    }
    for (const mission of this.listMissions()) {
      if (!this.matchesMaterialRequirement(mission, entry)) {
        continue;
      }
      const updated = this.updateMission(
        mission.id,
        state => {
          state.requiredCargoEntryId = entry.id;
          state.requiredCargoLabel = entry.label;
        },
        'material-cargo-stowed',
        { entryId: entry.id, composition: entry.composition }
      );
      if (updated) {
        this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Mission material cargo registered', {
          missionId: updated.id,
          entryId: entry.id,
          composition: entry.composition
        });
        return updated;
      }
    }
    return null;
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
    const snapshot = this.gameState.getPlanetMissionSnapshot(missionId);
    if (!snapshot) {
      return null;
    }
    const rewardTier = snapshot?.subTasks?.find(task => task.id === subTaskId)?.rewardTier;
    return this.updateMission(missionId, mission => {
      mission.subTasks = mission.subTasks ?? [];
      const target = mission.subTasks.find(task => task.id === subTaskId);
      if (!target) return;
      target.status = status;
      target.lastUpdatedAt = Date.now();
      if (status === 'completed') {
        this.appendClueTokenInternal(mission, target.rewardTier, options?.clueSummary || target.label, 'subtask');
      }
    }, `subtask-${status}`, {
      subTaskId,
      rewardTier: status === 'completed' ? rewardTier : undefined
    });
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
    }, `clue-${tier}`, { tier, summary, method, cost });
  }

  public getClueProgress(missionId: string): MissionClueProgress | null {
    const snapshot = this.gameState.getPlanetMissionSnapshot(missionId);
    if (!snapshot) {
      return null;
    }
    return this.summarizeClueProgress(snapshot);
  }

  public summarizeClueProgress(mission: PlanetMissionState): MissionClueProgress {
    return this.computeClueProgress(mission);
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
    const statusBefore = snapshot.status;
    mutator(snapshot);
    const statusAfterMutator = snapshot.status;
    this.applyAutoStatusTransitions(snapshot);
    const statusAfter = snapshot.status;
    const logEntries: PlanetMissionLogEntry[] = [this.makeLogEntry(event, payload)];
    if (statusAfter !== statusAfterMutator) {
      logEntries.push(this.makeLogEntry('status-auto-transition', { from: statusAfterMutator, to: statusAfter }));
    } else if (statusAfterMutator !== statusBefore) {
      logEntries.push(this.makeLogEntry('status-change', { from: statusBefore, to: statusAfterMutator }));
    }
    snapshot.log = [...snapshot.log, ...logEntries];
    const stored = this.gameState.upsertPlanetMission(snapshot);
    this.syncPlanetPendingMission(stored);
    return stored;
  }

  private applyAutoStatusTransitions(mission: PlanetMissionState): void {
    const immutableStates: PlanetMissionStatus[] = ['completed', 'failed'];
    if (immutableStates.includes(mission.status)) {
      return;
    }

    if (mission.status === 'offered' && this.hasMissionProgress(mission)) {
      mission.status = 'accepted';
    }

    if (mission.status === 'accepted' && this.hasMissionProgress(mission)) {
      mission.status = 'in-progress';
    }

    if (['accepted', 'in-progress', 'ready-to-turn-in'].includes(mission.status)) {
      if (this.missionMeetsClueRequirements(mission)) {
        mission.status = 'ready-to-turn-in';
        return;
      }
      if (mission.status === 'ready-to-turn-in' && !this.missionMeetsClueRequirements(mission)) {
        mission.status = this.hasMissionProgress(mission) ? 'in-progress' : 'accepted';
      }
    }
  }

  private hasMissionProgress(mission: PlanetMissionState): boolean {
    if ((mission.clueTokens?.length ?? 0) > 0) {
      return true;
    }
    if (mission.requiredCargoEntryId) {
      return true;
    }
    return Boolean(mission.subTasks?.some(task => task.status === 'completed'));
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
  ): MissionClueToken {
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
    return token;
  }

  private determineMissionType(planet: Planet, options?: MissionOfferOptions): PlanetMissionType {
    if (options?.type) {
      return options.type;
    }
    if (options?.targetLocation?.planetId) {
      return 'artifact';
    }
    const candidate = this.pickArtifactDestination(planet.id);
    if (!candidate) {
      return 'material';
    }
    return Math.random() < 0.65 ? 'artifact' : 'material';
  }

  private assignMissionObjective(mission: PlanetMissionState, origin: Planet, options?: MissionOfferOptions): void {
    if (mission.type === 'artifact') {
      const forcedTargetId = options?.targetLocation?.planetId;
      const target = forcedTargetId
        ? this.gameState.findPlanetById(forcedTargetId) ?? null
        : this.pickArtifactDestination(origin.id);
      if (target) {
        mission.targetLocation = {
          systemId: mission.targetLocation?.systemId ?? 'current-system',
          planetId: target.id
        };
        const targetLabel = this.describePlanet(target);
        mission.objectiveSummary = mission.objectiveSummary ?? `Recupera el artefacto custodiado en ${targetLabel}.`;
        mission.targetHint = mission.targetHint ?? targetLabel;
      } else {
        mission.objectiveSummary = mission.objectiveSummary ?? 'Recupera cualquier artefacto intacto y consérvalo para la entrega.';
      }
      return;
    }
    const requirement = this.pickMaterialRequirement(origin, options?.preferredResourceKind);
    mission.requiredCargoComposition = requirement.composition;
    mission.objectiveSummary = mission.objectiveSummary ?? requirement.summary;
    mission.targetHint = mission.targetHint ?? requirement.hint;
  }

  private pickArtifactDestination(excludePlanetId: string): Planet | null {
    const candidates = this.gameState.planets.filter(planet => planet.id !== excludePlanetId && planet.hasArtifact);
    if (!candidates.length) {
      return null;
    }
    candidates.sort((a, b) => Number(a.visited) - Number(b.visited));
    return candidates[0];
  }

  private shouldAttachArtifactPickup(mission: PlanetMissionState, planetId: string): boolean {
    if (mission.type !== 'artifact' || mission.requiredCargoEntryId) {
      return false;
    }
    const targetId = mission.targetLocation?.planetId;
    if (!targetId) {
      return true;
    }
    return targetId === planetId;
  }

  private pickMaterialRequirement(
    planet: Planet,
    preferred?: CargoCompositionKind
  ): { composition: CargoCompositionKind; summary: string; hint: string } {
    const composition = preferred ?? this.resolvePreferredCompositionFromStock(planet) ?? 'metallic';
    const label = this.describeMaterial(composition);
    return {
      composition,
      summary: `Recolecta una muestra ${label} y mantenla intacta hasta entregar el encargo.`,
      hint: label
    };
  }

  private resolvePreferredCompositionFromStock(planet: Planet): CargoCompositionKind | null {
    const stock = planet.resourceStock ?? ({} as PlanetResourceStock);
    const mapping: Array<{ key: keyof PlanetResourceStock; kind: CargoCompositionKind }> = [
      { key: 'metal', kind: 'metallic' },
      { key: 'non_metal', kind: 'silicate' },
      { key: 'organic', kind: 'organic' },
      { key: 'void_matter', kind: 'mixed' }
    ];
    mapping.sort((a, b) => (stock[a.key] ?? 0) - (stock[b.key] ?? 0));
    return mapping[0]?.kind ?? null;
  }

  private describeMaterial(kind: CargoCompositionKind): string {
    switch (kind) {
      case 'metallic':
        return 'metálica consagrada';
      case 'carbonaceous':
        return 'carbonácea purificada';
      case 'organic':
        return 'orgánica viva';
      case 'silicate':
        return 'silicatada resonante';
      case 'mixed':
        return 'híbrida arcana';
      default:
        return 'de origen desconocido';
    }
  }

  private describePlanet(planet: Planet): string {
    try {
      if (typeof planet.getDisplayName === 'function') {
        return planet.getDisplayName();
      }
    } catch {}
    return planet.customName ?? planet.id;
  }

  private createMissionCargoEntry(
    mission: PlanetMissionState,
    context: { label: string }
  ): CargoManifestEntry {
    const entry: CargoManifestEntry = {
      id: this.generateCargoEntryId(mission.id),
      type: mission.type === 'artifact' ? CargoItemType.ARTIFACT : CargoItemType.RAW_MATERIAL,
      label: context.label,
      massTons: mission.type === 'artifact' ? 5 : 20,
      units: mission.type === 'artifact' ? 1 : 25,
      source: GameObjectType.PLANET,
      rarity: mission.type === 'artifact' ? RarityTier.UNIQUE : RarityTier.RARE,
      composition: mission.requiredCargoComposition ?? 'unknown'
    };
    this.gameState.upsertCargoEntry(entry);
    return entry;
  }

  private generateCargoEntryId(missionId: string): string {
    return `${missionId}-cargo-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
  }

  private matchesMaterialRequirement(mission: PlanetMissionState, entry: CargoManifestEntry): boolean {
    if (mission.type !== 'material' || mission.requiredCargoEntryId) {
      return false;
    }
    if (!mission.requiredCargoComposition) {
      return false;
    }
    if (entry.type !== CargoItemType.RAW_MATERIAL) {
      return false;
    }
    const composition = entry.composition ?? 'unknown';
    return composition === mission.requiredCargoComposition;
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

  private computeClueProgress(mission: PlanetMissionState): MissionClueProgress {
    const required = mission.requiredClueTiers ?? [];
    const tokens = mission.clueTokens ?? [];
    const requiredCounts = new Map<MissionClueTier, number>();
    for (const tier of required) {
      requiredCounts.set(tier, (requiredCounts.get(tier) ?? 0) + 1);
    }
    const obtainedCounts = new Map<MissionClueTier, number>();
    for (const token of tokens) {
      obtainedCounts.set(token.tier, (obtainedCounts.get(token.tier) ?? 0) + 1);
    }
    const tiers: MissionClueTierProgress[] = [];
    requiredCounts.forEach((count, tier) => {
      const obtained = Math.min(count, obtainedCounts.get(tier) ?? 0);
      tiers.push({ tier, required: count, obtained, remaining: Math.max(0, count - obtained) });
    });
    const methodCounts: Partial<Record<MissionClueToken['method'], number>> = {};
    const totalResources: Partial<PlanetResourceStock> = {};
    for (const token of tokens) {
      methodCounts[token.method] = (methodCounts[token.method] ?? 0) + 1;
      this.accumulateResourceCost(totalResources, token.cost);
    }
    const missingTiers: MissionClueTier[] = [];
    const remainingForTier: Partial<Record<MissionClueTier, number>> = {};
    for (const tier of required) {
      remainingForTier[tier] = (remainingForTier[tier] ?? 0) + 1;
    }
    for (const token of tokens) {
      if (remainingForTier[token.tier]) {
        remainingForTier[token.tier]! -= 1;
      }
    }
    for (const tier of required) {
      if ((remainingForTier[tier] ?? 0) > 0) {
        remainingForTier[tier]! -= 1;
        missingTiers.push(tier);
      }
    }
    return {
      tiers,
      missingTiers,
      tokens,
      methodsUsed: methodCounts,
      totalResourcesSpent: totalResources
    };
  }

  private accumulateResourceCost(target: Partial<PlanetResourceStock>, cost?: Partial<PlanetResourceStock>): void {
    if (!cost) {
      return;
    }
    for (const key of Object.keys(cost) as Array<keyof PlanetResourceStock>) {
      const delta = cost[key];
      if (!delta) {
        continue;
      }
      target[key] = (target[key] ?? 0) + delta;
    }
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
