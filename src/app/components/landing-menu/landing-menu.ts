import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
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
  MissionClueProgress,
  MissionClueTierProgress,
  PlanetResourceStock,
  MissionSubTask
} from '../../game/types/planet-intel.types';
import { LesserBeing, PlanetInhabitants, LESSER_BEING_LABELS } from '../../game/types/cosmic-life.types';
import { getLandingDiplomacyScript, LandingDiplomacyScript } from '../../game/config/landing-diplomacy.config';
import { MissionService } from '../../game/services/game/mission.service';
import { Planet } from '../../game/game-objects/Planet';
import { GameObjectAnimosity, RelationAffinity } from '../../game/types/animosity.types';
import { DialogueService } from '../../services/game/dialogue.service';
import { DialogueChoice, DialogueSessionState } from '../../game/types/dialogue.types';
import { EXPLORE_SUCCESS_CHANCE, formatChance, restSuccessChance } from '../../game/config/landing-odds.config';
import { RaceOutfittingBridgeService } from '../../services/game/race-outfitting-bridge.service';
import { RaceShopOffer } from '../../game/types/race.types';
import { CargoCompositionKind } from '../../game/types/inventory.types';

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
  /** "Contactar civilización" abre la vista de contacto, que gestiona el panel padre. */
  @Output() openContact = new EventEmitter<void>();

  protected pending = false;
  protected actionLog: LandingEventResult[] = [];
  protected selectedEventId: string | null = null;
  protected readonly LandingExploreObjective = LandingExploreObjective;
  protected readonly LandingDiplomacyAction = LandingDiplomacyAction;

  constructor(
    private readonly landingActions: LandingActionService,
    private readonly gameState: GameStateStore,
    private readonly missionService: MissionService,
    private readonly dialogue: DialogueService,
    private readonly raceOutfitting: RaceOutfittingBridgeService
  ) {}

  // ── Probabilidades visibles ──────────────────────────────────────────────────────────────────
  // El jugador ve la misma cifra que se tira: ambas salen de landing-odds.config.

  /** "35%" si dormir es arriesgado; null en un mundo tranquilo (no se pinta nada). */
  protected get restChanceLabel(): string | null {
    return formatChance(restSuccessChance(this.planetHasLesserBeing));
  }

  protected get exploreChanceLabel(): string {
    return formatChance(EXPLORE_SUCCESS_CHANCE) ?? '';
  }

  private get planetHasLesserBeing(): boolean {
    const being = this.planetIntel?.lesserBeing;
    return !!being && being !== LesserBeing.NONE;
  }

  // ── Contacto con la civilización ─────────────────────────────────────────────────────────────

  /**
   * ¿Hay alguien con quien tratar y el piloto lo SABE?
   * Sin la segunda condición, el botón delataría que el mundo está habitado antes de escanearlo.
   * Misma puerta que usa el panel para dejar entrar en Contacto.
   */
  protected get canContactCivilization(): boolean {
    const inhabitants = this.planetIntel?.inhabitants;
    if (!inhabitants || inhabitants === PlanetInhabitants.NONE) {
      return false;
    }
    return this.isIntelResolved(this.planetIntel?.civilizationIntelStatus) || this.lifeIntelKnown;
  }

  /**
   * Un solo botón para toda la relación con la raza:
   * mientras no sepas quién vive aquí, es la tirada de primer contacto; después, abre Contacto.
   */
  protected handleContactCivilization(): void {
    if (this.canContactCivilization) {
      this.openContact.emit();
      return;
    }
    this.handleExplore(LandingExploreObjective.CIVILIZATION);
  }

  /** Conversación en curso dentro de la vista de contacto. */
  protected get conversation(): DialogueSessionState | null {
    return this.dialogue.getState();
  }

  protected get canConverse(): boolean {
    const planet = this.resolveContextPlanet();
    return !!planet && this.dialogue.canTalk(planet);
  }

  /** Abre (o reabre) la charla al entrar en Contacto. */
  protected startConversation(): void {
    const planet = this.resolveContextPlanet();
    if (!planet) {
      return;
    }
    this.dialogue.start(planet);
  }

  /**
   * Cada elección se resuelve y se vuelca a la bitácora: la conversación queda registrada junto al
   * resto de eventos del aterrizaje, que es donde el jugador espera releerla.
   */
  protected chooseDialogue(choice: DialogueChoice): void {
    if (choice.kind === 'leave') {
      this.dialogue.end();
      return;
    }
    const before = this.conversation?.log.length ?? 0;
    const next = this.dialogue.choose(choice.id);
    if (!next) {
      return;
    }
    const fresh = next.log.slice(before);
    if (fresh.length) {
      this.appendConversationToLog(choice, fresh.map(line => ({
        tone: line.speaker === 'narrator' ? 'info' as const : 'success' as const,
        text: line.text,
      })));
    }
    const planet = this.resolveContextPlanet();
    if (planet) {
      this.gameState.syncPlanetIntelFromPlanet(planet);
    }
  }

  private appendConversationToLog(choice: DialogueChoice, narrative: LandingActionLogEntry[]): void {
    const planetId = this.context?.planetId;
    if (!planetId) {
      return;
    }
    const title = choice.kind === 'accept'
      ? 'Encargo aceptado'
      : choice.kind === 'turn-in'
        ? 'Encargo entregado'
        : this.conversation?.raceLabel ?? 'Conversación';
    this.persistActionResult(planetId, {
      id: `dialogue-${Date.now().toString(36)}`,
      planetId,
      action: LandingActionKind.DIPLOMACY,
      title,
      timestamp: Date.now(),
      narrative,
      effects: {},
      success: true,
    });
  }

  private resolveContextPlanet(): Planet | null {
    const planetId = this.context?.planetId;
    return planetId ? this.resolveLandingPlanet(planetId) : null;
  }

  // ── Taller de la raza ────────────────────────────────────────────────────────────────────────

  /** Ofertas disponibles: vacío mientras la raza no te considere aliado. */
  protected get shopOffers(): RaceShopOffer[] {
    const inhabitants = this.planetIntel?.inhabitants;
    return inhabitants ? this.raceOutfitting.getShopOffers(inhabitants) : [];
  }

  protected describeOfferCost(offer: RaceShopOffer): string {
    const parts = Object.entries(offer.cost).map(
      ([kind, units]) => `${units} ${kind} (${this.gameState.getRawMaterialUnits(kind as CargoCompositionKind)}u)`
    );
    return parts.join(' + ') || 'gratis';
  }

  protected purchaseOffer(offer: RaceShopOffer): void {
    const planetId = this.context?.planetId;
    const inhabitants = this.planetIntel?.inhabitants;
    if (!planetId || !inhabitants) {
      return;
    }
    const failure = this.raceOutfitting.purchase(inhabitants, offer.id);
    this.persistActionResult(planetId, {
      id: `shop-${Date.now().toString(36)}`,
      planetId,
      action: LandingActionKind.DIPLOMACY,
      title: offer.label,
      timestamp: Date.now(),
      narrative: [{ tone: failure ? 'warning' : 'success', text: failure ?? `${offer.label}: instalado.` }],
      effects: {},
      success: !failure,
    });
  }

  /** Una línea que resume qué se puede hacer con esta gente ahora mismo. */
  protected get contactSummary(): string {
    if (!this.canContactCivilization) {
      return 'Barre la superficie en busca de señales de vida inteligente.';
    }
    if (this.mission?.status === 'ready-to-turn-in') {
      return 'Tienes lo que te pidieron: es momento de entregarlo.';
    }
    if (this.mission) {
      return 'Tienes un encargo en curso con ellos.';
    }
    if (this.isEnemyRelation) {
      return 'La órbita está tomada: no habrá tratos hasta despejarla.';
    }
    return 'Habla con ellos, escucha lo que ofrecen y negocia.';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['context']) {
      this.loadActionLog();
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

  protected get missionClueProgress(): MissionClueProgress | null {
    const mission = this.mission;
    if (!mission) {
      return null;
    }
    return this.missionService.summarizeClueProgress(mission);
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

  protected get missionStatusLabel(): string {
    const mission = this.mission;
    if (!mission) {
      return 'Sin misión';
    }
    return this.missionStatusMeta[mission.status]?.label ?? mission.status;
  }

  protected get missionStatusDescription(): string {
    const mission = this.mission;
    if (!mission) {
      return 'Contacta una civilización para recibir encargos.';
    }
    const meta = this.missionStatusMeta[mission.status];
    return meta?.description ?? '';
  }

  protected get missionStatusPillClass(): string {
    const mission = this.mission;
    if (!mission) {
      return 'pill--neutral';
    }
    return this.missionStatusMeta[mission.status]?.pillClass ?? 'pill--neutral';
  }

  protected get missionObjectiveSummary(): string | null {
    return this.mission?.objectiveSummary ?? this.diplomacyScript?.missionTemplate.objectiveSummary ?? null;
  }

  protected get missionTargetName(): string | null {
    const mission = this.mission;
    if (!mission) {
      return this.diplomacyScript?.missionTemplate.targetHint ?? null;
    }
    const targetPlanetId = mission.targetLocation?.planetId;
    if (targetPlanetId) {
      const target = this.gameState.findPlanetById(targetPlanetId);
      if (target) {
        try {
          if (typeof target.getDisplayName === 'function') {
            return target.getDisplayName();
          }
        } catch {}
        return target.customName ?? targetPlanetId;
      }
      return mission.targetHint ?? targetPlanetId;
    }
    return mission.targetHint ?? this.diplomacyScript?.missionTemplate.targetHint ?? null;
  }

  protected get missionRewardMemoryShare(): number | null {
    const missionShare = this.mission?.reward?.memorySharePct;
    if (typeof missionShare === 'number') {
      return missionShare;
    }
    const templateShare = this.diplomacyScript?.missionTemplate.memorySharePct;
    return typeof templateShare === 'number' ? templateShare : null;
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

  protected get isAllyRelation(): boolean {
    return this.relationAffinity === 'ally';
  }

  protected get isEnemyRelation(): boolean {
    return this.relationAffinity === 'enemy';
  }

  protected get metallicCargoUnits(): number {
    return this.gameState.getRawMaterialUnits('metallic');
  }

  protected get carbonCargoUnits(): number {
    return this.gameState.getRawMaterialUnits('carbonaceous');
  }

  protected get organicCargoUnits(): number {
    return this.gameState.getRawMaterialUnits('organic');
  }

  protected get silicateCargoUnits(): number {
    return this.gameState.getRawMaterialUnits('silicate');
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

  protected get canUseAllyRefit(): boolean {
    if (!this.isAllyRelation || this.disabled) {
      return false;
    }
    const ship = this.gameState.spaceship;
    if (!ship || ship.healthCurrent >= ship.healthMax) {
      return false;
    }
    return this.metallicCargoUnits >= 10;
  }

  protected get canUseAllyWisdom(): boolean {
    if (!this.isAllyRelation || this.disabled) {
      return false;
    }
    return this.organicCargoUnits >= 1 && this.silicateCargoUnits >= 1;
  }

  protected get canUseAllyLifespan(): boolean {
    return this.isAllyRelation && !this.disabled;
  }

  protected get canConfrontLesser(): boolean {
    if (!this.isEnemyRelation || this.disabled) {
      return false;
    }
    const being = this.planetIntel?.lesserBeing;
    return Boolean(being && being !== LesserBeing.NONE);
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
    return this.missionClueProgress?.missingTiers ?? [];
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

  protected get lesserBeingName(): string {
    const being = this.planetIntel?.lesserBeing;
    if (!being || being === LesserBeing.NONE) {
      return 'la entidad hostil';
    }
    return LESSER_BEING_LABELS[being] ?? 'la entidad hostil';
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

  protected handleAllyRefit(): void {
    if (!this.canUseAllyRefit || !this.context?.planetId) {
      return;
    }
    this.executeAction({
      planetId: this.context!.planetId,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.ALLY_FULL_REPAIR }
    });
  }

  protected handleAllyWisdom(): void {
    if (!this.canUseAllyWisdom || !this.context?.planetId) {
      return;
    }
    this.executeAction({
      planetId: this.context!.planetId,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.ALLY_WISDOM_RITE }
    });
  }

  protected handleAllyLifespan(): void {
    if (!this.canUseAllyLifespan || !this.context?.planetId) {
      return;
    }
    this.executeAction({
      planetId: this.context!.planetId,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.ALLY_SHARE_LIFESPAN }
    });
  }

  protected handleEnemyConfrontation(): void {
    if (!this.canConfrontLesser || !this.context?.planetId) {
      return;
    }
    this.executeAction({
      planetId: this.context!.planetId,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.ENEMY_CONFRONT_LESSER }
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

  protected formatTierProgress(tier: MissionClueTierProgress): string {
    return `${this.formatTier(tier.tier)} ${tier.obtained}/${tier.required}`;
  }

  protected hasResourceCost(cost?: Partial<PlanetResourceStock>): boolean {
    if (!cost) {
      return false;
    }
    return Object.values(cost).some(value => (value ?? 0) > 0);
  }

  protected methodEntries(methods?: Partial<Record<MissionClueToken['method'], number>>): Array<{ key: MissionClueToken['method']; label: string; count: number }> {
    if (!methods) {
      return [];
    }
    const labels: Record<MissionClueToken['method'], string> = {
      bribe: 'Sobornos',
      subtask: 'Recados',
      vision: 'Visiones',
      reward: 'Recompensas',
      other: 'Otros'
    } as const;
    return Object.entries(methods)
      .filter(([, count]) => (count ?? 0) > 0)
      .map(([key, count]) => ({ key: key as MissionClueToken['method'], label: labels[key as MissionClueToken['method']] ?? key, count: count ?? 0 }));
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

  private readonly missionStatusMeta: Record<PlanetMissionStatus, { label: string; description: string; pillClass: string }> = {
    offered: {
      label: 'Oferta pendiente',
      description: 'Acepta el encargo para registrar el contrato diplomático.',
      pillClass: 'pill--neutral'
    },
    accepted: {
      label: 'Contrato aceptado',
      description: 'Reúne pistas iniciales para demostrar tu compromiso.',
      pillClass: 'pill--neutral'
    },
    'in-progress': {
      label: 'En progreso',
      description: 'Completa recados y consume recursos para avanzar la misión.',
      pillClass: 'pill--warning'
    },
    'ready-to-turn-in': {
      label: 'Listo para entregar',
      description: 'Todos los requisitos están cubiertos. Entrega la misión para sellar la alianza.',
      pillClass: 'pill--success'
    },
    completed: {
      label: 'Completada',
      description: 'La facción ya confía plenamente en ti.',
      pillClass: 'pill--success'
    },
    failed: {
      label: 'Fracaso',
      description: 'La facción retiró su confianza. Requerirá un nuevo intento.',
      pillClass: 'pill--danger'
    }
  };

  private get landingIntelFallback(): LandingPlanetIntel | null {
    return this.context?.planetIntel ?? null;
  }

  private get lifeIntelKnown(): boolean {
    return Boolean(this.planetIntel?.lifeScanned || this.landingIntelFallback?.planetLifeIntelKnown);
  }

  private get creatureIntelKnown(): boolean {
    return Boolean(this.planetIntel?.creatureScanned || this.landingIntelFallback?.planetCreatureIntelKnown);
  }

  /**
   * Sincroniza la intel del planeta al abrir el panel.
   *
   * ANTES esto además SEMBRABA una misión: con sólo abrir el menú, una civilización con la que no
   * habías cruzado palabra te encargaba algo. Los encargos nacen ahora en la conversación
   * (`DialogueService`), que es donde el jugador los oye y los acepta.
   */
  private ensureMissionSeeded(): void {
    if (!this.context?.planetId) {
      return;
    }
    const planet = this.resolveLandingPlanet(this.context.planetId);
    if (planet) {
      this.gameState.syncPlanetIntelFromPlanet(planet);
    }
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
      this.persistActionResult(request.planetId, result);
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
      this.persistActionResult(request.planetId, fallback);
    } finally {
      this.pending = false;
    }
  }

  private loadActionLog(): void {
    if (!this.context?.planetId) {
      this.actionLog = [];
      this.selectedEventId = null;
      return;
    }
    const history = this.gameState.getLandingLogHistory(this.context.planetId);
    this.actionLog = history;
    this.selectedEventId = history[0]?.id ?? null;
  }

  private persistActionResult(planetId: string, event: LandingEventResult): void {
    const history = this.gameState.appendLandingLogEntry(planetId, event);
    this.actionLog = history;
    this.selectedEventId = event.id;
  }
}
