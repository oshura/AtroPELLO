import { Injectable } from '@angular/core';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';
import { GameStateStore } from '../../../services/game/game-state.store';
import { Planet } from '../../game-objects/Planet';
import { PlanetInhabitants } from '../../types/cosmic-life.types';
import { SpellType } from '../../types/spell.types';
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
  /** Planeta que encarga la misión (donde se entrega). */
  originPlanetId?: string;
  /** Criatura a abatir en misiones de caza. */
  huntTarget?: { lesserBeing: string; elderGod?: string };
  /** Nombre de la prueba que aparecerá en la bodega al lograr la caza. */
  trophyLabel?: string;
  /** Exterminio (Fase 15): raza objetivo y cuota de planetas/estaciones a destruir. */
  exterminateTarget?: { race: string; planets: number; stations: number };
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
      targetHint: options?.targetHint,
      originPlanetId: options?.originPlanetId ?? planet.id,
      huntTarget: options?.huntTarget,
      exterminationTarget: options?.exterminateTarget
        ? {
            race: options.exterminateTarget.race,
            planetsRequired: Math.max(0, options.exterminateTarget.planets),
            stationsRequired: Math.max(0, options.exterminateTarget.stations),
            planetsDestroyed: 0,
            stationsDestroyed: 0
          }
        : undefined,
      requiredCargoLabel: options?.trophyLabel
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
    // Un exterminio no se cobra a cuenta: la cuota de destrucción debe estar cumplida.
    if (snapshot.type === 'exterminate' && !this.exterminationComplete(snapshot)) {
      this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Mission completion blocked: extermination quota unmet', {
        missionId,
        progress: snapshot.exterminationTarget
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

  /**
   * Registra la muerte de una criatura y, si satisface una misión de caza activa, materializa la
   * PRUEBA en la bodega (patrón del caparazón de la tortuga espacial). Devuelve la misión que
   * quedó lista para entregar, o null si esta muerte no le servía a nadie.
   *
   * La prueba sólo aparece con la misión ya aceptada: matar al bicho "por si acaso" antes de que
   * te lo encarguen no cuenta, y el propio diálogo lo advierte.
   */
  public registerHuntKill(lesserBeing: string, systemElderGod?: string | null): PlanetMissionState | null {
    if (!lesserBeing) {
      return null;
    }
    for (const mission of this.listMissions()) {
      if (mission.type !== 'hunt' || mission.requiredCargoEntryId) {
        continue;
      }
      if (mission.status !== 'accepted' && mission.status !== 'in-progress') {
        continue;
      }
      const hunt = mission.huntTarget;
      if (!hunt || hunt.lesserBeing !== lesserBeing) {
        continue;
      }
      if (hunt.elderGod && systemElderGod && hunt.elderGod !== systemElderGod) {
        continue; // la criatura correcta, pero en un sistema que no es el que dominaba el primigenio
      }
      const label = mission.requiredCargoLabel ?? 'Prueba de la cacería';
      const entry = this.createMissionCargoEntry(mission, { label });
      const updated = this.updateMission(
        mission.id,
        state => {
          state.requiredCargoEntryId = entry.id;
          state.requiredCargoLabel = entry.label;
          state.status = 'ready-to-turn-in';
        },
        'hunt-trophy-secured',
        { lesserBeing, cargoEntryId: entry.id }
      );
      this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Hunt trophy secured', {
        missionId: mission.id,
        lesserBeing,
        cargoEntryId: entry.id
      });
      return updated;
    }
    return null;
  }

  /**
   * Registra la destrucción de un planeta o estación de una raza y avanza las misiones de
   * exterminio activas que la señalen (Fase 15; patrón `registerHuntKill`). Devuelve la misión
   * que avanzó, o null si esta destrucción no le servía a nadie.
   */
  public registerExterminationEvent(race: string, kind: 'planet' | 'station'): PlanetMissionState | null {
    if (!race) {
      return null;
    }
    for (const mission of this.listMissions()) {
      if (mission.type !== 'exterminate' || !mission.exterminationTarget) {
        continue;
      }
      if (mission.status !== 'accepted' && mission.status !== 'in-progress') {
        continue;
      }
      if (mission.exterminationTarget.race !== race) {
        continue;
      }
      const target = mission.exterminationTarget;
      const alreadyMet =
        kind === 'planet'
          ? target.planetsDestroyed >= target.planetsRequired
          : target.stationsDestroyed >= target.stationsRequired;
      if (alreadyMet) {
        continue; // esa cuota ya está cubierta; el excedente no cuenta para nadie
      }
      const updated = this.updateMission(
        mission.id,
        state => {
          const progress = state.exterminationTarget;
          if (!progress) {
            return;
          }
          if (kind === 'planet') {
            progress.planetsDestroyed += 1;
          } else {
            progress.stationsDestroyed += 1;
          }
          if (this.exterminationComplete(state)) {
            state.status = 'ready-to-turn-in';
          } else if (state.status === 'accepted') {
            state.status = 'in-progress';
          }
        },
        `extermination-${kind}`,
        { race, kind }
      );
      this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Extermination progress registered', {
        missionId: mission.id,
        race,
        kind,
        progress: updated?.exterminationTarget
      });
      return updated;
    }
    return null;
  }

  private exterminationComplete(mission: PlanetMissionState): boolean {
    const target = mission.exterminationTarget;
    if (!target) {
      return false;
    }
    return (
      target.planetsDestroyed >= target.planetsRequired &&
      target.stationsDestroyed >= target.stationsRequired
    );
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
      // Una cacería SOLO está lista cuando existe la prueba física, que la crea `registerHuntKill`.
      // Sin esta salvaguarda, al no llevar pistas requeridas la misión se marcaba lista en el mismo
      // instante de aceptarla: se podía cobrar la recompensa sin cazar nada y el trofeo no llegaba
      // a generarse nunca (registerHuntKill sólo mira misiones aceptadas o en curso).
      if (mission.type === 'hunt' && !mission.requiredCargoEntryId) {
        return;
      }
      // Un exterminio SOLO está listo cuando la cuota de destrucción se ha cumplido: la marca
      // `registerExterminationEvent`, nunca esta transición automática (mismo peligro que hunt).
      if (mission.type === 'exterminate' && !this.exterminationComplete(mission)) {
        return;
      }
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
    const extermination = mission.exterminationTarget;
    if (extermination && extermination.planetsDestroyed + extermination.stationsDestroyed > 0) {
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
    // Glifo único: la recompensa que el jugador ve prometida en el diálogo. Antes se declaraba en
    // el tipo y NADIE lo consumía, así que las razas prometían glifos que jamás llegaban.
    const glyph = this.resolveRewardGlyph(reward.uniqueGlyphId);
    if (glyph && !this.gameState.hasSpell(glyph)) {
      this.gameState.learnSpell(glyph);
      this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Mission reward glyph learned', {
        missionId: mission.id,
        glyph
      });
    }
    this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Mission reward applied', {
      missionId: mission.id,
      reward
    });
  }

  /** `uniqueGlyphId` es texto libre en los guiones: sólo vale si nombra un hechizo real. */
  private resolveRewardGlyph(uniqueGlyphId: string | undefined): SpellType | null {
    if (!uniqueGlyphId) {
      return null;
    }
    const candidate = uniqueGlyphId.toUpperCase();
    const known = Object.values(SpellType).find(spell => String(spell).toUpperCase() === candidate);
    return (known as SpellType) ?? null;
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
    if (mission.type === 'hunt') {
      // La caza no ocurre en un planeta: el objetivo es una criatura en algún sistema del dominio.
      mission.objectiveSummary =
        mission.objectiveSummary ?? `Abate a la criatura señalada y trae la prueba a ${this.describePlanet(origin)}.`;
      return;
    }
    if (mission.type === 'exterminate') {
      const target = mission.exterminationTarget;
      mission.objectiveSummary =
        mission.objectiveSummary ??
        (target
          ? `Destruye ${target.planetsRequired} planeta(s) y ${target.stationsRequired} estación(es) de la raza señalada y vuelve a informar.`
          : 'Termina la presencia de la raza señalada y vuelve a informar.');
      return;
    }
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
    // Los trofeos de caza son piezas únicas y ligeras, como el artefacto; el material es a granel.
    const unique = mission.type === 'artifact' || mission.type === 'hunt';
    const entry: CargoManifestEntry = {
      id: this.generateCargoEntryId(mission.id),
      type: unique ? CargoItemType.ARTIFACT : CargoItemType.RAW_MATERIAL,
      label: context.label,
      massTons: unique ? 5 : 20,
      units: unique ? 1 : 25,
      source: GameObjectType.PLANET,
      rarity: unique ? RarityTier.UNIQUE : RarityTier.RARE,
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
      // Una cacería sin trofeo no está cumplida: la prueba ES el objetivo.
      return mission.type !== 'hunt';
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

  /**
   * Asciende a aliado al planeta que ENCARGÓ la misión, no al del objetivo.
   * Antes se promocionaba `targetLocation.planetId`, que en una misión de caza es el escenario del
   * encargo, no quien te lo dio: la raza que te ayudaba nunca llegaba a considerarte aliado.
   */
  private promotePlanetToAlly(mission: PlanetMissionState): void {
    const race = mission.requestedBy ?? mission.race;
    if (race && race !== PlanetInhabitants.NONE) {
      this.gameState.setRaceStanding(race, 'ally', true);
    }
    const planetId = mission.originPlanetId ?? mission.targetLocation.planetId;
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
