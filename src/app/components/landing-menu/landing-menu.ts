import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { LandingApproachContext, LandingPlanetIntel } from '../../game/types/landing.types';
import {
  LandingActionKind,
  LandingActionRequest,
  LandingActionLogEntry,
  LandingEventResult,
  LandingExploreObjective,
  LandingDiplomacyAction
} from '../../game/types/landing-action.types';
import { LandingActionService } from '../../services/game/landing-action.service';
import { GameStateStore } from '../../services/game/game-state.store';
import {
  PLANET_INTEL_STATUS,
  PlanetIntelSnapshot,
  PlanetIntelStatus,
  PlanetMissionState,
  PlanetMissionStatus,
  MissionClueToken,
  MissionClueTier,
  PlanetResourceStock,
  MissionSubTask
} from '../../game/types/planet-intel.types';
import { LesserBeing, PlanetInhabitants } from '../../game/types/cosmic-life.types';
import { getLandingDiplomacyScript, LandingDiplomacyScript } from '../../game/config/landing-diplomacy.config';
import { MissionService } from '../../game/services/game/mission.service';
import { Planet } from '../../game/game-objects/Planet';
import { GameObjectAnimosity, RelationAffinity } from '../../game/types/animosity.types';

@Component({
  selector: 'app-landing-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landing-menu.html',
  styleUrl: './landing-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LandingMenuComponent implements OnChanges {
  @Input() context: LandingApproachContext | null = null;
  @Input() viewMode: 'actions' | 'diplomacy' = 'actions';

  protected pending = false;
  protected actionLog: LandingEventResult[] = [];
  protected selectedEventId: string | null = null;
  protected readonly LandingExploreObjective = LandingExploreObjective;
  protected readonly LandingDiplomacyAction = LandingDiplomacyAction;

  constructor(
    private readonly landingActions: LandingActionService,
    private readonly gameState: GameStateStore,
    private readonly missionService: MissionService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['context']) {
      this.ensureMissionSeeded();
    }
  }

  protected get hasPlanet(): boolean {
    return Boolean(this.context?.planetId);
  }

  protected get disabled(): boolean {
    return this.pending || !this.hasPlanet;
  }

  protected get canSubmitDiplomacy(): boolean {
    return !this.disabled && !!this.mission;
  }

  protected get showActionSections(): boolean {
    return this.viewMode === 'actions';
  }

  protected get showDiplomacySection(): boolean {
    return this.viewMode === 'diplomacy';
  }

  protected get canAcceptMission(): boolean {
    return !!this.mission && this.mission.status === 'offered' && !this.disabled;
  }

  protected get canReviewMission(): boolean {
    return !!this.mission && !this.disabled;
  }

  protected get mission(): PlanetMissionState | null {
    return this.planetIntel?.pendingMission ?? null;
  }

  protected get missionRequiresCargo(): boolean {
    return Boolean(this.mission?.requiredCargoEntryId);
  }

  protected get missionCargoLabel(): string | null {
    if (!this.missionRequiresCargo) {
      return null;
    }
    return this.mission?.requiredCargoLabel ?? 'Carga solicitada';
  }

  protected get missionHasCargo(): boolean {
    const mission = this.mission;
    if (!mission || !mission.requiredCargoEntryId) {
      return true;
    }
    return this.missionService.hasRequiredCargoReady(mission.id);
  }

  protected get relationAffinity(): RelationAffinity {
    const animosity = this.planetIntel?.animosity ?? GameObjectAnimosity.NEUTRAL;
    switch (animosity) {
      case GameObjectAnimosity.FRIENDLY:
        return 'ally';
      case GameObjectAnimosity.ENEMY:
        return 'enemy';
      default:
        return 'neutral';
    }
  }

  protected get isNeutralRelation(): boolean {
    return this.relationAffinity === 'neutral';
  }

  protected get metallicCargoUnits(): number {
    return this.gameState.getRawMaterialUnits('metallic');
  }

  protected get carbonCargoUnits(): number {
    return this.gameState.getRawMaterialUnits('carbonaceous');
  }

  protected get canUseNeutralRepair(): boolean {
    if (!this.isNeutralRelation || this.disabled) {
      return false;
    }
    const ship = this.gameState.spaceship;
    if (!ship || ship.healthCurrent >= ship.healthMax) {
      return false;
    }
    return this.metallicCargoUnits >= 1;
  }

  protected get canUseNeutralHeal(): boolean {
    if (!this.isNeutralRelation || this.disabled) {
      return false;
    }
    if (this.gameState.characterProfile.health >= 100) {
      return false;
    }
    return this.carbonCargoUnits >= 1;
  }

  protected get diplomacyScript(): LandingDiplomacyScript | null {
    const inhabitants = this.planetIntel?.inhabitants;
    if (!inhabitants || inhabitants === PlanetInhabitants.NONE) {
      return null;
    }
    return getLandingDiplomacyScript(inhabitants);
  }

  protected get clueTokens(): MissionClueToken[] {
    return this.mission?.clueTokens ?? [];
  }

  protected get missingClueTiers(): MissionClueTier[] {
    if (!this.mission?.requiredClueTiers?.length) {
      return [];
    }
    const owned = new Set(this.clueTokens.map(token => token.tier));
    return this.mission.requiredClueTiers.filter(tier => !owned.has(tier));
  }

  protected get subTasks(): MissionSubTask[] {
    return this.mission?.subTasks ?? [];
  }

  protected get resourceStockEntries(): Array<{ key: keyof PlanetResourceStock; value: number }> {
    const stock = this.planetIntel?.resourceStock;
    if (!stock) {
      return [];
    }
    return (Object.keys(stock) as Array<keyof PlanetResourceStock>)
      .filter(key => stock[key] !== undefined)
      .map(key => ({ key, value: stock[key] ?? 0 }));
  }

  protected get isBribeDisabled(): boolean {
    const option = this.diplomacyScript?.bribeOption;
    return (
      this.disabled ||
      !this.mission ||
      !option ||
      (option.cost ? !this.hasResourceStock(this.planetIntel?.resourceStock ?? null, option.cost) : false)
    );
  }

  protected get isSubTaskDisabled(): boolean {
    return this.disabled || !this.mission || !this.diplomacyScript?.subTasks.length;
  }

  protected get isVisionDisabled(): boolean {
    const sanityCost = this.diplomacyScript?.visionOption?.sanityCost ?? 0;
    return this.disabled || !this.mission || (sanityCost > 0 && this.gameState.characterProfile.sanity <= sanityCost);
  }

  protected get canTurnInMission(): boolean {
    const mission = this.mission;
    if (!mission || this.disabled) {
      return false;
    }
    const readyStates: PlanetMissionStatus[] = ['ready-to-turn-in', 'completed'];
    if (!readyStates.includes(mission.status)) {
      return false;
    }
    if (this.missionRequiresCargo && !this.missionHasCargo) {
      return false;
    }
    return true;
  }

  protected get primarySubTaskConfig(): string | undefined {
    return this.diplomacyScript?.subTasks?.[0]?.id;
  }

  protected get isArtifactActionDisabled(): boolean {
    return this.disabled || this.isIntelResolved(this.planetIntel?.artifactIntelStatus);
  }

  protected get isCivilizationActionDisabled(): boolean {
    if (this.disabled) {
      return true;
    }
    const intel = this.planetIntel;
    if (!intel) {
      return true;
    }
    return this.isIntelResolved(intel.civilizationIntelStatus) || this.lifeIntelKnown;
  }

  protected get isLesserBeingActionDisabled(): boolean {
    if (this.disabled) {
      return true;
    }
    const intel = this.planetIntel;
    if (!intel) {
      return true;
    }
    return this.isIntelResolved(intel.lesserBeingIntelStatus) || this.creatureIntelKnown;
  }

  protected get isVoidMassActionDisabled(): boolean {
    return this.disabled;
  }

  protected formatIntelStatus(status?: PlanetIntelStatus | null): string {
    switch (status) {
      case PLANET_INTEL_STATUS.CONFIRMED_PRESENT:
        return 'detectada';
      case PLANET_INTEL_STATUS.CONFIRMED_ABSENT:
        return 'inexistente';
      default:
        return 'desconocido';
    }
  }

  protected get selectedEvent(): LandingEventResult | null {
    if (!this.actionLog.length) {
      return null;
    }
    if (this.selectedEventId) {
      return this.actionLog.find(evt => evt.id === this.selectedEventId) ?? this.actionLog[0];
    }
    return this.actionLog[0];
  }

  protected get history(): LandingEventResult[] {
    return this.actionLog;
  }

  protected trackHistoryById = (_: number, event: LandingEventResult) => event.id;

  protected isHistoryItemActive(event: LandingEventResult, index: number): boolean {
    if (this.selectedEventId) {
      return event.id === this.selectedEventId;
    }
    return index === 0;
  }

  protected handleRest(): void {
    if (!this.hasPlanet || this.disabled) {
      return;
    }
    this.executeAction({
      planetId: this.context!.planetId,
      action: LandingActionKind.REST
    });
  }

  protected handleExplore(objective: LandingExploreObjective): void {
    if (!this.hasPlanet || this.disabled) {
      return;
    }
    this.executeAction({
      planetId: this.context!.planetId,
      action: LandingActionKind.EXPLORE,
      objective
    });
  }

  protected handleDiplomacyBribe(): void {
    if (!this.canSubmitDiplomacy || !this.mission) {
      return;
    }
    this.executeAction({
      planetId: this.context!.planetId,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.OFFER_BRIBE }
    });
  }

  protected handleDiplomacyVision(): void {
    if (!this.canSubmitDiplomacy || !this.mission) {
      return;
    }
    this.executeAction({
      planetId: this.context!.planetId,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.REQUEST_VISION }
    });
  }

  protected handleDiplomacySubTask(subTaskId?: string): void {
    if (!this.canSubmitDiplomacy || !this.mission) {
      return;
    }
    this.executeAction({
      planetId: this.context!.planetId,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.RUN_SUBTASK, subTaskId }
    });
  }

  protected handleDiplomacyTurnIn(): void {
    if (!this.canSubmitDiplomacy || !this.mission) {
      return;
    }
    this.executeAction({
      planetId: this.context!.planetId,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.COMPLETE_MISSION }
    });
  }

  protected handleMissionAccept(): void {
    if (!this.canAcceptMission || !this.context?.planetId) {
      return;
    }
    this.executeAction({
      planetId: this.context.planetId,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.ACCEPT_MISSION }
    });
  }

  protected handleMissionReview(): void {
    if (!this.canReviewMission || !this.context?.planetId) {
      return;
    }
    this.executeAction({
      planetId: this.context.planetId,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.REVIEW_MISSION }
    });
  }

  protected handleNeutralRepair(): void {
    if (!this.canUseNeutralRepair || !this.context?.planetId) {
      return;
    }
    this.executeAction({
      planetId: this.context.planetId,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.REPAIR_SHIP }
    });
  }

  protected handleNeutralHeal(): void {
    if (!this.canUseNeutralHeal || !this.context?.planetId) {
      return;
    }
    this.executeAction({
      planetId: this.context.planetId,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.HEAL_CREW }
    });
  }

  protected selectEvent(event: LandingEventResult): void {
    this.selectedEventId = event.id;
  }

  protected formatDelta(value?: number | null): string {
    if (!value) {
      return value === 0 ? '+0' : '';
    }
    return value > 0 ? `+${value}` : `${value}`;
  }

  protected getToneClass(entry: LandingActionLogEntry): string {
    return `tone-${entry.tone}`;
  }

  protected statusLabel(event: LandingEventResult): string {
    if (event.blocked) {
      return 'Bloqueada';
    }
    return event.success ? 'Éxito' : 'Fallo';
  }

  protected statusClass(event: LandingEventResult): string {
    if (event.blocked) {
      return 'pill--warning';
    }
    return event.success ? 'pill--success' : 'pill--danger';
  }

  protected formatTier(tier: MissionClueTier): string {
    switch (tier) {
      case 'minor':
        return 'Susurro menor';
      case 'major':
        return 'Clave mayor';
      case 'final':
        return 'Visión final';
      default:
        return tier;
    }
  }

  protected formatResourceLabel(key: keyof PlanetResourceStock): string {
    switch (key) {
      case 'metal':
        return 'Metal';
      case 'non_metal':
        return 'Silicatos';
      case 'organic':
        return 'Orgánico';
      case 'void_matter':
        return 'Materia de vacío';
      default:
        return key;
    }
  }

  protected describeCost(cost?: Partial<PlanetResourceStock>): string {
    if (!cost) {
      return 'Sin coste';
    }
    const fragments = (Object.keys(cost) as Array<keyof PlanetResourceStock>)
      .filter(key => (cost[key] ?? 0) > 0)
      .map(key => `${cost[key]} ${this.formatResourceLabel(key)}`);
    return fragments.length ? fragments.join(' + ') : 'Sin coste';
  }

  protected trackClueById = (_: number, token: MissionClueToken) => token.id;
  protected trackSubTaskById = (_: number, task: MissionSubTask) => task.id;

  private get planetIntel(): PlanetIntelSnapshot | null {
    if (!this.hasPlanet) {
      return null;
    }
    return this.gameState.getPlanetIntelSnapshot(this.context!.planetId) ?? null;
  }

  private get landingIntelFallback(): LandingPlanetIntel | null {
    return this.context?.planetIntel ?? null;
  }

  private get lifeIntelKnown(): boolean {
    return Boolean(this.planetIntel?.lifeScanned || this.landingIntelFallback?.planetLifeIntelKnown);
  }

  private get creatureIntelKnown(): boolean {
    return Boolean(this.planetIntel?.creatureScanned || this.landingIntelFallback?.planetCreatureIntelKnown);
  }

  private ensureMissionSeeded(): void {
    if (!this.context?.planetId) {
      return;
    }
    const planet = this.resolveLandingPlanet(this.context.planetId);
    if (!planet) {
      return;
    }
    const hasCivilization = planet.inhabitants && planet.inhabitants !== PlanetInhabitants.NONE;
    if (!hasCivilization) {
      return;
    }
    if (planet.pendingMission) {
      this.gameState.syncPlanetIntelFromPlanet(planet);
      return;
    }
    const script = getLandingDiplomacyScript(planet.inhabitants);
    if (!script) {
      return;
    }
    this.missionService.offerMission(planet, {
      race: planet.inhabitants,
      description: script.missionTemplate.description,
      missionName: script.missionTemplate.name,
      requiredClueTiers: script.missionTemplate.requiredClueTiers
    });
    this.gameState.syncPlanetIntelFromPlanet(planet);
  }

  private resolveLandingPlanet(planetId: string): Planet | null {
    const planet = this.gameState.findPlanetById(planetId) ?? this.gameState.getActiveLandingPlanet();
    if (planet?.id === planetId) {
      return planet;
    }
    return null;
  }

  private isIntelResolved(status?: PlanetIntelStatus | null): boolean {
    return !!status && status !== PLANET_INTEL_STATUS.UNKNOWN;
  }

  private hasResourceStock(stock: PlanetResourceStock | null, cost?: Partial<PlanetResourceStock>): boolean {
    if (!cost) {
      return true;
    }
    const source = stock ?? {};
    for (const key of Object.keys(cost) as Array<keyof PlanetResourceStock>) {
      const required = cost[key];
      if (!required) {
        continue;
      }
      const available = source[key] ?? 0;
      if (available < required) {
        return false;
      }
    }
    return true;
  }

  private executeAction(request: LandingActionRequest): void {
    this.pending = true;
    try {
      const result = this.landingActions.performAction(request);
      this.actionLog = [result, ...this.actionLog].slice(0, 10);
      this.selectedEventId = result.id;
    } catch (error) {
      const fallback: LandingEventResult = {
        id: `landing-error-${Date.now()}`,
        planetId: request.planetId,
        action: request.action,
        objective: request.objective,
        success: false,
        blocked: true,
        title: 'Error al resolver la acción',
        narrative: [
          {
            tone: 'danger',
            text: 'El menú de aterrizaje no pudo ejecutar la acción. Revisa la consola para más detalles.'
          }
        ],
        effects: { blockedReason: 'exception' },
        timestamp: Date.now(),
        metadata: { error: error instanceof Error ? error.message : String(error) }
      };
      this.actionLog = [fallback, ...this.actionLog].slice(0, 10);
      this.selectedEventId = fallback.id;
    } finally {
      this.pending = false;
    }
  }
}
