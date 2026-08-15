import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Modal } from '../modal/modal';
import { LandingApproachContext, LandingPlanetIntel } from '../../game/types/landing.types';
import { LandingMenuComponent } from '../landing-menu/landing-menu';
import { GameStateStore } from '../../services/game/game-state.store';
import { DisembarkService } from '../../services/game/disembark.service';
import {
  PLANET_INTEL_STATUS,
  PlanetIntelSnapshot,
  PlanetIntelStatus,
  PlanetMissionState,
  PlanetMissionStatus,
  MissionClueTier,
  MissionClueToken
} from '../../game/types/planet-intel.types';
import { PlanetInhabitants, PLANET_INHABITANT_LABELS, LesserBeing, LESSER_BEING_LABELS } from '../../game/types/cosmic-life.types';

@Component({
  selector: 'app-landing-panel',
  standalone: true,
  imports: [CommonModule, Modal, LandingMenuComponent],
  templateUrl: './landing-panel.html',
  styleUrl: './landing-panel.scss'
})
export class LandingPanelComponent implements OnChanges {
  @Input() visible: boolean = false;
  @Input() context: LandingApproachContext | null = null;
  @Output() takeoff = new EventEmitter<void>();
  @Output() stay = new EventEmitter<void>();
  protected viewMode: 'overview' | 'actions' | 'diplomacy' = 'overview';

  constructor(
    private readonly gameState: GameStateStore,
    private readonly disembark: DisembarkService
  ) {}

  /** ¿Se puede "bajar de la nave" aquí? (muestra el botón; el Sol no). */
  protected get canDisembark(): boolean {
    return !!this.context && this.disembark.canDisembark({ kind: 'planet', planetType: this.context.planetType });
  }

  /** "Bajar de la nave" (placeholder: la experiencia propia está por implementar; sin salto externo). */
  onDisembark(): void {
    if (this.context) {
      this.disembark.disembark({ kind: 'planet', planetType: this.context.planetType });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['visible'] && !this.visible) || changes['context']) {
      this.viewMode = 'overview';
    }
  }

  get title(): string {
    return this.context?.planetName
      ? `Aterrizado en ${this.context.planetName}`
      : 'Aterrizaje completado';
  }

  protected get planetType(): string {
    return this.context?.planetType ? String(this.context.planetType) : 'Desconocido';
  }

  protected get radiusKm(): number | null {
    return this.context ? Math.round(this.context.radius) : null;
  }

  protected get altitude(): number | null {
    return this.context ? Math.round(this.context.distanceToSurface) : null;
  }

  protected get alignment(): number | null {
    if (!this.context) {
      return null;
    }
    return Math.abs(this.context.alignmentDot);
  }

  protected get showIntelSection(): boolean {
    return Boolean(this.inhabitantsIntel || this.lifeProbabilityIntel || this.lesserBeingIntel);
  }

  protected get inMenuView(): boolean {
    return this.viewMode !== 'overview' && !!this.context;
  }

  protected get inDiplomacyView(): boolean {
    return this.viewMode === 'diplomacy';
  }

  protected get landingMenuViewMode(): 'actions' | 'diplomacy' {
    return this.inDiplomacyView ? 'diplomacy' : 'actions';
  }

  protected get canOpenDiplomacyPanel(): boolean {
    const snapshot = this.rawPlanetIntelSnapshot;
    if (snapshot) {
      const hasCivilization = !!snapshot.inhabitants && snapshot.inhabitants !== PlanetInhabitants.NONE;
      if (!hasCivilization) {
        return false;
      }
      return snapshot.lifeScanned || this.isIntelResolved(snapshot.civilizationIntelStatus);
    }
    return Boolean(this.context?.planetIntel?.planetHasKnownSpecies);
  }

  protected get inhabitantsIntel(): string | null {
    const intel = this.planetIntelSnapshot;
    if (!intel || !intel.planetLifeIntelKnown || !intel.planetHasKnownSpecies) {
      return null;
    }
    const label = (intel.planetInhabitantsDisplay || '').trim();
    return label.length ? label : null;
  }

  protected get inhabitantsHint(): string | null {
    return this.inhabitantsIntel ? 'Escáner completado' : null;
  }

  protected get lifeProbabilityIntel(): string | null {
    if (this.planetIntelSnapshot?.planetLifeIntelKnown) {
      return null;
    }
    const pctRaw = this.context?.probabilityOfLifePct;
    if (typeof pctRaw !== 'number' || !Number.isFinite(pctRaw)) {
      return null;
    }
    const pct = Math.max(0, Math.min(100, Math.round(pctRaw)));
    return `${pct}%`;
  }

  protected get lifeProbabilityHint(): string | null {
    return this.lifeProbabilityIntel ? 'Escáner pendiente' : null;
  }

  protected get lesserBeingIntel(): string | null {
    const intel = this.planetIntelSnapshot;
    if (!intel) {
      return null;
    }
    const label = (intel.planetLesserBeingDisplay || '').trim();
    return label.length ? label : null;
  }

  protected get lesserBeingHint(): string | null {
    const intel = this.planetIntelSnapshot;
    if (!intel) {
      return null;
    }
    return intel.planetCreatureIntelKnown ? 'Lectura confirmada' : 'Escáner pendiente';
  }

  protected get missionIntel(): PlanetMissionState | null {
    return this.rawPlanetIntelSnapshot?.pendingMission ?? null;
  }

  protected get missionStatusLabel(): string | null {
    const mission = this.missionIntel;
    if (!mission) {
      return null;
    }
    return this.missionStatusMeta[mission.status]?.label ?? mission.status;
  }

  protected get missionStatusPillClass(): string {
    const mission = this.missionIntel;
    if (!mission) {
      return 'landing-panel__pill--neutral';
    }
    return this.missionStatusMeta[mission.status]?.pillClass ?? 'landing-panel__pill--neutral';
  }

  protected get missionIntelSummary(): string | null {
    const mission = this.missionIntel;
    if (!mission) {
      return null;
    }
    return mission.objectiveSummary ?? mission.description ?? null;
  }

  protected get missionTargetDisplay(): string | null {
    const mission = this.missionIntel;
    if (!mission) {
      return null;
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
    return mission.targetHint ?? null;
  }

  protected get missionRewardMemoryShare(): number | null {
    const reward = this.missionIntel?.reward?.memorySharePct;
    return typeof reward === 'number' ? reward : null;
  }

  protected get missionClueProgress(): Array<{ tier: MissionClueTier; obtained: boolean }> {
    const mission = this.missionIntel;
    if (!mission?.requiredClueTiers?.length) {
      return [];
    }
    const owned = new Set((mission.clueTokens ?? []).map(token => token.tier));
    return mission.requiredClueTiers.map(tier => ({ tier, obtained: owned.has(tier) }));
  }

  protected get missionRecentClues(): MissionClueToken[] {
    const mission = this.missionIntel;
    if (!mission?.clueTokens?.length) {
      return [];
    }
    return [...mission.clueTokens]
      .sort((a, b) => b.obtainedAt - a.obtainedAt)
      .slice(0, 2);
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

  private get planetIntelSnapshot(): LandingPlanetIntel | null {
    const planetId = this.context?.planetId;
    if (!planetId) {
      return this.context?.planetIntel ?? null;
    }
    const snapshot = this.gameState.getPlanetIntelSnapshot(planetId);
    if (!snapshot) {
      return this.context?.planetIntel ?? null;
    }
    return this.mapSnapshotToLandingIntel(snapshot);
  }

  private get rawPlanetIntelSnapshot(): PlanetIntelSnapshot | null {
    const planetId = this.context?.planetId;
    if (!planetId) {
      return null;
    }
    return this.gameState.getPlanetIntelSnapshot(planetId) ?? null;
  }

  private mapSnapshotToLandingIntel(snapshot: PlanetIntelSnapshot): LandingPlanetIntel {
    const lifeKnown = !!snapshot.lifeScanned;
    const creatureKnown = !!snapshot.creatureScanned;
    const inhabitants = snapshot.inhabitants ?? PlanetInhabitants.NONE;
    const lesserBeing = snapshot.lesserBeing ?? LesserBeing.NONE;
    const inhabitantsDisplay = lifeKnown
      ? PLANET_INHABITANT_LABELS[inhabitants] ?? this.humanizeEnum(inhabitants)
      : 'Desconocido';
    const lesserBeingDisplay = creatureKnown
      ? LESSER_BEING_LABELS[lesserBeing] ?? this.humanizeEnum(lesserBeing)
      : 'Desconocido';

    return {
      planetInhabitantsDisplay: inhabitantsDisplay,
      planetLesserBeingDisplay: lesserBeingDisplay,
      planetLifeIntelKnown: lifeKnown,
      planetCreatureIntelKnown: creatureKnown,
      planetHasKnownSpecies: lifeKnown && inhabitants !== PlanetInhabitants.NONE,
      planetVisited: !!snapshot.visited,
    };
  }

  private humanizeEnum(value: string | number): string {
    return String(value)
      .split('_')
      .map(chunk => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
      .join(' ');
  }

  onTakeoff(): void {
    this.takeoff.emit();
  }

  enterMenu(): void {
    if (!this.context) {
      return;
    }
    this.viewMode = 'actions';
  }

  enterDiplomacyMenu(): void {
    if (!this.context || !this.canOpenDiplomacyPanel) {
      return;
    }
    this.viewMode = 'diplomacy';
  }

  exitMenu(): void {
    this.viewMode = 'overview';
  }

  onStay(): void {
    this.viewMode = 'overview';
    this.stay.emit();
  }

  @HostListener('wheel', ['$event'])
  handleWheelWithinPanel(event: WheelEvent): void {
    event.stopPropagation();
  }

  private isIntelResolved(status?: PlanetIntelStatus | null): boolean {
    return !!status && status !== PLANET_INTEL_STATUS.UNKNOWN;
  }

  private readonly missionStatusMeta: Record<PlanetMissionStatus, { label: string; pillClass: string }> = {
    offered: { label: 'Oferta pendiente', pillClass: 'landing-panel__pill--neutral' },
    accepted: { label: 'Contrato aceptado', pillClass: 'landing-panel__pill--neutral' },
    'in-progress': { label: 'En progreso', pillClass: 'landing-panel__pill--warning' },
    'ready-to-turn-in': { label: 'Listo para entrega', pillClass: 'landing-panel__pill--success' },
    completed: { label: 'Completada', pillClass: 'landing-panel__pill--success' },
    failed: { label: 'Fracaso', pillClass: 'landing-panel__pill--danger' }
  };
}
