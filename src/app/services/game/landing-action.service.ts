import { Injectable } from '@angular/core';
import { Planet } from '../../game/game-objects/Planet';
import { GameStateStore } from './game-state.store';
import { CharacterProfileService } from './character-profile.service';
import { LoggingService, LogCategory, LogLevel } from '../logging.service';
import {
  LandingActionRequest,
  LandingActionKind,
  LandingExploreObjective,
  LandingEventResult,
  LandingActionEffects,
  LandingActionLogEntry,
  LandingDiplomacyAction
} from '../../game/types/landing-action.types';
import {
  PLANET_INTEL_STATUS,
  PlanetMissionState,
  PlanetResourceStock,
  MissionClueToken
} from '../../game/types/planet-intel.types';
import { PlanetInhabitants } from '../../game/types/cosmic-life.types';
import { GameObjectAnimosity } from '../../game/types/animosity.types';
import { GameObjectCategory, GameObjectType, getCategory } from '../../game/types/game-object.types';
import { Vector3 } from '../../types/game.types';
import { GameInitializer } from './game-initializer.service';
import { MissionService } from '../../game/services/game/mission.service';
import { getLandingDiplomacyScript, LandingDiplomacyScript, DiplomacySubTaskConfig } from '../../game/config/landing-diplomacy.config';
import { getRaceDefinition } from '../../game/config/race-catalog.config';
import { getSpellLabel } from '../../game/types/spell.types';
import { LandingNarrativeService } from './landing-narrative.service';
import { EXPLORE_SUCCESS_CHANCE, restSuccessChance } from '../../game/config/landing-odds.config';

interface RollOutcome {
  success: boolean;
  roll: number;
}

interface PlanetCollapseNotification {
  planetId: string;
  position: Vector3;
  radius: number;
  clusterCount: number;
}

interface LandingFatalContext {
  action: LandingActionKind;
  planetId: string;
  detail: string;
}

const VOID_MASS_PER_ENERGY_UNIT = 10; // units of planetary void mass needed per ship energy
const PLANET_MIN_VOID_MASS_TO_SURVIVE = 100; // collapse threshold
const MIN_PLANET_SCALE_RATIO = 0.25; // never shrink below 25% before collapse

@Injectable({ providedIn: 'root' })
export class LandingActionService {
  constructor(
    private readonly gameState: GameStateStore,
    private readonly landingNarrative: LandingNarrativeService,
    private readonly characterProfile: CharacterProfileService,
    private readonly logger: LoggingService,
    private readonly gameInitializer: GameInitializer,
    private readonly missionService: MissionService
  ) {}

  performAction(request: LandingActionRequest): LandingEventResult {
    const planet = this.resolvePlanet(request.planetId);
    if (!planet) {
      return this.buildBlockedResult(request, 'Planeta no disponible', 'missing-planet');
    }

    switch (request.action) {
      case LandingActionKind.REST:
        return this.executeRest(planet, request);
      case LandingActionKind.EXPLORE:
        return this.executeExplore(planet, request);
      case LandingActionKind.DIPLOMACY:
        return this.executeDiplomacy(planet, request);
      default:
        return this.buildBlockedResult(request, 'Acción no implementada aún', 'not-implemented');
    }
  }

  private executeRest(planet: Planet, request: LandingActionRequest): LandingEventResult {
    planet.markVisited();
    const effects: LandingActionEffects = {};
    const narrative: LandingActionLogEntry[] = [];
    const hasLesserBeing = !!planet.lesserBeing;
    const title = 'Descanso planetario';
    const restScript = this.landingNarrative.getRestScript();
    const introText = this.pickNarrativeText(restScript?.intro, 'Acampas junto a la estela magnética del motor, dejando que la arena púrpura silencie la radio.');
    narrative.push({ tone: 'info', text: introText });

    // Con criatura en el planeta el descanso es una apuesta, no una condena: se puede robar una
    // noche tranquila, pero pocas veces. La probabilidad la publica landing-odds para que el menú
    // muestre exactamente la que se tira aquí.
    const chance = restSuccessChance(hasLesserBeing);
    const roll = this.roll(chance);
    const interrupted = hasLesserBeing && !roll.success;

    const sanityDelta = interrupted ? -1 : 1;
    const healthDelta = interrupted ? -5 : 5;
    effects.sanityDelta = sanityDelta;
    effects.healthDelta = healthDelta;
    effects.ageDaysDelta = this.applyAgeDelta(1);

    this.applyVitalsDelta(
      { sanity: sanityDelta, health: healthDelta },
      { action: request.action, planetId: planet.id, detail: 'rest' }
    );

    if (interrupted) {
      planet.lesserBeingIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_PRESENT;
      planet.markCreatureScanned();
      effects.interrupted = true;
      effects.intel = { lesserBeing: planet.lesserBeingIntelStatus };
      const interruptedText = this.pickNarrativeText(
        restScript?.outcomes?.interrupted,
        'Un chillido subarmónico rompe el refugio; la criatura muerde tu mente antes de incorporarte.'
      );
      narrative.push({ tone: 'danger', text: interruptedText });
    } else {
      const successText = this.pickNarrativeText(
        restScript?.outcomes?.success,
        'Sueñas con constelaciones imposibles. Recuperas fuerza y cordura.'
      );
      narrative.push({ tone: 'success', text: successText });
      if (hasLesserBeing) {
        narrative.push({ tone: 'info', text: 'La criatura no te encontró esta noche.' });
      }
    }

    const result = this.composeResult(request, planet, {
      title,
      narrative,
      effects,
      success: !interrupted,
      roll: hasLesserBeing ? roll.roll : undefined,
      probability: hasLesserBeing ? chance : undefined,
    });

    this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Rest action resolved', {
      planetId: planet.id,
      success: result.success,
      interrupted: effects.interrupted
    });

    return result;
  }

  private executeExplore(planet: Planet, request: LandingActionRequest): LandingEventResult {
    switch (request.objective) {
      case LandingExploreObjective.ARTIFACT:
        return this.exploreArtifact(planet, request);
      case LandingExploreObjective.VOID_MASS:
        return this.exploreVoidMass(planet, request);
      case LandingExploreObjective.CIVILIZATION:
        return this.exploreCivilization(planet, request);
      case LandingExploreObjective.LESSER_BEING:
        return this.exploreLesserBeing(planet, request);
      default:
        return this.buildBlockedResult(request, 'Exploración sin objetivo', 'missing-objective');
    }
  }

  private executeDiplomacy(planet: Planet, request: LandingActionRequest): LandingEventResult {
    if (planet.inhabitants === PlanetInhabitants.NONE) {
      return this.buildBlockedResult(request, 'No hay civilización para negociar.', 'no-inhabitants');
    }
    const diplomacy = request.diplomacy;
    if (!diplomacy) {
      return this.buildBlockedResult(request, 'Falta seleccionar una opción diplomática.', 'missing-diplomacy-action');
    }
    if (diplomacy.action === LandingDiplomacyAction.REPAIR_SHIP) {
      return this.handleNeutralRepair(planet, request);
    }
    if (diplomacy.action === LandingDiplomacyAction.HEAL_CREW) {
      return this.handleNeutralHeal(planet, request);
    }
    if (diplomacy.action === LandingDiplomacyAction.ALLY_FULL_REPAIR) {
      return this.handleAllyFullRepair(planet, request);
    }
    if (diplomacy.action === LandingDiplomacyAction.ALLY_WISDOM_RITE) {
      return this.handleAllyWisdom(planet, request);
    }
    if (diplomacy.action === LandingDiplomacyAction.ALLY_SHARE_LIFESPAN) {
      return this.handleAllyLifespan(planet, request);
    }
    if (diplomacy.action === LandingDiplomacyAction.ENEMY_CONFRONT_LESSER) {
      return this.handleEnemyConfrontation(planet, request);
    }
    const script = getLandingDiplomacyScript(planet.inhabitants);
    if (!script) {
      return this.buildBlockedResult(request, 'Esta civilización no puede negociar todavía.', 'missing-diplomacy-script');
    }
    const mission = this.ensureMissionForDiplomacy(planet, script);

    switch (diplomacy.action) {
      case LandingDiplomacyAction.OFFER_BRIBE:
        return this.handleDiplomacyBribe(planet, mission, script, request);
      case LandingDiplomacyAction.REQUEST_VISION:
        return this.handleDiplomacyVision(planet, mission, script, request);
      case LandingDiplomacyAction.RUN_SUBTASK:
        return this.handleDiplomacySubTask(planet, mission, script, request, diplomacy.subTaskId);
      case LandingDiplomacyAction.COMPLETE_MISSION:
        return this.handleDiplomacyCompletion(planet, mission, request);
      case LandingDiplomacyAction.ACCEPT_MISSION:
        return this.handleMissionAccept(planet, mission, request);
      case LandingDiplomacyAction.REVIEW_MISSION:
        return this.handleMissionReview(planet, mission, request);
      default:
        return this.buildBlockedResult(request, 'Acción diplomática desconocida.', 'unknown-diplomacy-action');
    }
  }

  private ensureMissionForDiplomacy(planet: Planet, script: LandingDiplomacyScript): PlanetMissionState {
    if (planet.pendingMission) {
      return planet.pendingMission;
    }
    return this.missionService.offerMission(planet, {
      race: planet.inhabitants ?? PlanetInhabitants.NONE,
      description: script.missionTemplate.description,
      missionName: script.missionTemplate.name,
      requiredClueTiers: script.missionTemplate.requiredClueTiers,
      type: script.missionTemplate.type,
      preferredResourceKind: script.missionTemplate.preferredResourceKind,
      objectiveSummary: script.missionTemplate.objectiveSummary,
      targetHint: script.missionTemplate.targetHint,
      reward: script.missionTemplate.memorySharePct
        ? { memorySharePct: script.missionTemplate.memorySharePct }
        : undefined
    });
  }

  private handleMissionAccept(
    planet: Planet,
    mission: PlanetMissionState,
    request: LandingActionRequest
  ): LandingEventResult {
    if (mission.status !== 'offered') {
      return this.buildBlockedResult(
        request,
        'Solo puedes aceptar encargos recién ofrecidos por la facción.',
        'mission-not-offered'
      );
    }
    const updated = this.missionService.acceptMission(mission.id) ?? mission;
    const narrative: LandingActionLogEntry[] = [
      { tone: 'info', text: 'Presentas tus credenciales y sellas el pacto tribal.' },
      { tone: 'success', text: 'El encargo queda registrado en tu bitácora diplomática.' }
    ];
    return this.composeResult(request, planet, {
      title: 'Aceptar misión',
      narrative,
      effects: { missionStatus: updated.status },
      success: true,
      metadata: { missionId: mission.id }
    });
  }

  private handleMissionReview(
    planet: Planet,
    mission: PlanetMissionState,
    request: LandingActionRequest
  ): LandingEventResult {
    const snapshot = this.missionService.getMissionSnapshot(mission.id) ?? mission;
    const missingClues = this.missionService.getMissingClueTiers(mission.id);
    const hasCargo = this.missionService.hasRequiredCargoReady(mission.id);
    const requiredLabel = snapshot.requiredCargoLabel ?? 'el cargamento solicitado';
    const pendingSubTasks = (snapshot.subTasks ?? []).filter(task => task.status !== 'completed').length;

    const narrative: LandingActionLogEntry[] = [
      { tone: 'info', text: `Estado actual: ${snapshot.status}.` }
    ];
    if (missingClues.length) {
      narrative.push({
        tone: 'warning',
        text: `Faltan pistas clave: ${missingClues.map(tier => tier).join(', ')}.`
      });
    } else {
      narrative.push({ tone: 'success', text: 'Todas las pistas requeridas están aseguradas.' });
    }
    if (snapshot.requiredCargoEntryId) {
      narrative.push({
        tone: hasCargo ? 'success' : 'warning',
        text: hasCargo ? `Carga lista para entregar (${requiredLabel}).` : `Aún falta ${requiredLabel}.`
      });
    }
    if (pendingSubTasks > 0) {
      narrative.push({
        tone: 'info',
        text: `Recados activos pendientes: ${pendingSubTasks}.`
      });
    }

    return this.composeResult(request, planet, {
      title: 'Revisar misión',
      narrative,
      effects: { missionStatus: snapshot.status },
      success: true,
      metadata: { missionId: mission.id }
    });
  }

  private handleNeutralRepair(planet: Planet, request: LandingActionRequest): LandingEventResult {
    if (!this.isNeutralPlanet(planet)) {
      return this.buildBlockedResult(request, 'Necesitas una relación neutral para acceder al taller.', 'relation-mismatch');
    }
    const ship = this.gameState.spaceship;
    if (!ship) {
      return this.buildBlockedResult(request, 'No hay nave para reparar.', 'missing-ship');
    }
    const missingHealth = Math.max(0, ship.healthMax - ship.healthCurrent);
    if (missingHealth <= 0) {
      return this.buildBlockedResult(request, 'La nave ya está a plena integridad.', 'ship-full-health');
    }
    if (this.gameState.getRawMaterialUnits('metallic') < 1) {
      return this.buildBlockedResult(request, 'Hace falta 1 unidad de mineral metálico.', 'missing-metal-resource');
    }
    const consumed = this.gameState.spendRawMaterial('metallic', 1);
    if (consumed < 1) {
      return this.buildBlockedResult(request, 'No se pudo consumir el mineral metálico.', 'spend-metal-failed');
    }
    const repairAmount = Math.max(1, Math.round(ship.healthMax * 0.1));
    const applied = Math.min(repairAmount, missingHealth);
    ship.healthCurrent = ship.healthCurrent + applied;

    const narrative: LandingActionLogEntry[] = [
      { tone: 'info', text: 'La fragua tribal enciende crisoles con tu mineral como tributo.' },
      { tone: 'success', text: 'Las placas del casco quedan alineadas; la nave vibra como nueva.' }
    ];
    const effects: LandingActionEffects = {
      shipHealthDelta: applied,
      shipHealthSnapshot: { current: ship.healthCurrent, max: ship.healthMax },
      cargoSpent: [{ kind: 'metallic', units: consumed }]
    };
    return this.composeResult(request, planet, {
      title: 'Reparar casco',
      narrative,
      effects,
      success: true
    });
  }

  private handleNeutralHeal(planet: Planet, request: LandingActionRequest): LandingEventResult {
    if (!this.isNeutralPlanet(planet)) {
      return this.buildBlockedResult(request, 'La cofradía solo ofrece cuidados a visitantes neutrales.', 'relation-mismatch');
    }
    const currentHealth = this.gameState.characterProfile.health;
    const missingHealth = Math.max(0, 100 - currentHealth);
    if (missingHealth <= 0) {
      return this.buildBlockedResult(request, 'Ya estás al máximo de salud.', 'pilot-full-health');
    }
    if (this.gameState.getRawMaterialUnits('carbonaceous') < 1) {
      return this.buildBlockedResult(request, 'Necesitas 1 unidad de material carbonáceo.', 'missing-carbon-resource');
    }
    const consumed = this.gameState.spendRawMaterial('carbonaceous', 1);
    if (consumed < 1) {
      return this.buildBlockedResult(request, 'No se pudo consumir el material carbonáceo.', 'spend-carbon-failed');
    }
    const healDelta = Math.min(10, missingHealth);
    this.applyVitalsDelta({ health: healDelta }, { action: request.action, planetId: planet.id, detail: 'neutral-heal' });

    const narrative: LandingActionLogEntry[] = [
      { tone: 'info', text: 'Los sanadores carbonizan resinas aromáticas para purificar la sangre.' },
      { tone: 'success', text: 'Sientes la carne sellarse mientras entregas el paquete de compuestos.' }
    ];
    const effects: LandingActionEffects = {
      healthDelta: healDelta,
      cargoSpent: [{ kind: 'carbonaceous', units: consumed }]
    };
    return this.composeResult(request, planet, {
      title: 'Ritual de sanación',
      narrative,
      effects,
      success: true
    });
  }

  private handleAllyFullRepair(planet: Planet, request: LandingActionRequest): LandingEventResult {
    if (!this.isAllyPlanet(planet)) {
      return this.buildBlockedResult(request, 'Solo los aliados acceden a la forja total.', 'relation-mismatch');
    }
    const ship = this.gameState.spaceship;
    if (!ship) {
      return this.buildBlockedResult(request, 'Necesitas una nave para recibir la forja.', 'missing-ship');
    }
    const missingHealth = Math.max(0, ship.healthMax - ship.healthCurrent);
    if (missingHealth <= 0) {
      return this.buildBlockedResult(request, 'El casco ya vibra a plenitud.', 'ship-full-health');
    }
    const alloyCost = 10;
    if (this.gameState.getRawMaterialUnits('metallic') < alloyCost) {
      return this.buildBlockedResult(request, 'La forja exige 10 unidades metálicas.', 'missing-metal-resource');
    }
    const consumed = this.gameState.spendRawMaterial('metallic', alloyCost);
    if (consumed < alloyCost) {
      return this.buildBlockedResult(request, 'No se pudo consagrar todo el metal requerido.', 'spend-metal-failed');
    }
    ship.healthCurrent = ship.healthMax;

    const narrative: LandingActionLogEntry[] = [
      { tone: 'info', text: 'Los maestros calientan crisoles arcanos y sumergen la nave en luz líquida.' },
      { tone: 'success', text: 'Cada plancha vuelve a soldarse: sales de la forja como recién lanzado.' }
    ];
    const effects: LandingActionEffects = {
      shipHealthDelta: missingHealth,
      shipHealthSnapshot: { current: ship.healthCurrent, max: ship.healthMax },
      cargoSpent: [{ kind: 'metallic', units: consumed }]
    };
    return this.composeResult(request, planet, {
      title: 'Forja de alianza',
      narrative,
      effects,
      success: true
    });
  }

  private handleAllyWisdom(planet: Planet, request: LandingActionRequest): LandingEventResult {
    if (!this.isAllyPlanet(planet)) {
      return this.buildBlockedResult(request, 'Necesitas confianza aliada para recibir sus glifos.', 'relation-mismatch');
    }
    const organicCost = 1;
    const silicateCost = 1;
    if (this.gameState.getRawMaterialUnits('organic') < organicCost) {
      return this.buildBlockedResult(request, 'Falta una muestra orgánica viva para el ritual.', 'missing-organic-resource');
    }
    if (this.gameState.getRawMaterialUnits('silicate') < silicateCost) {
      return this.buildBlockedResult(request, 'Requiere cristales silicatados para grabar el glifo.', 'missing-silicate-resource');
    }
    const spentOrganic = this.gameState.spendRawMaterial('organic', organicCost);
    if (spentOrganic < organicCost) {
      return this.buildBlockedResult(request, 'No se pudo ofrendar el tejido orgánico.', 'spend-organic-failed');
    }
    const spentSilicate = this.gameState.spendRawMaterial('silicate', silicateCost);
    if (spentSilicate < silicateCost) {
      return this.buildBlockedResult(request, 'El cristal silicatado no quedó consagrado.', 'spend-silicate-failed');
    }
    const memoryGain = 2;
    this.gameState.memoryPercent = Math.min(100, this.gameState.memoryPercent + memoryGain);
    this.gameState.characterProfile.memory = Math.min(100, this.gameState.characterProfile.memory + memoryGain);

    const narrative: LandingActionLogEntry[] = [
      { tone: 'info', text: 'El consejo despliega pergaminos vivos y talla el glifo sobre tus retinas.' },
      { tone: 'success', text: 'Recuerdas fragmentos dormidos: la runa despierta memoria ancestral.' }
    ];
    // El glifo que enseña esta raza. Antes se prometía "recibir sus glifos" y sólo se entregaba un
    // adorno de bitácora: `learnSpell` no se llamaba nunca y el grimorio no cambiaba.
    const teachable = getRaceDefinition(planet.inhabitants)?.teachableGlyph ?? null;
    const learned = teachable && !this.gameState.hasSpell(teachable);
    if (learned && teachable) {
      this.gameState.learnSpell(teachable);
      narrative.push({ tone: 'success', text: `Un glifo nuevo arde en tu grimorio: ${getSpellLabel(teachable)}.` });
    }
    const glyphRewardId = `ally-glyph-${Date.now().toString(36)}`;
    const effects: LandingActionEffects = {
      cargoSpent: [
        { kind: 'organic', units: spentOrganic },
        { kind: 'silicate', units: spentSilicate }
      ],
      memoryDelta: memoryGain,
      itemsAwarded: learned && teachable
        ? [{ id: glyphRewardId, label: getSpellLabel(teachable), type: 'spell', quantity: 1 }]
        : [{ id: glyphRewardId, label: 'Sabiduría compartida', type: 'memory', quantity: memoryGain }]
    };
    return this.composeResult(request, planet, {
      title: 'Profundizar en sabiduría',
      narrative,
      effects,
      success: true
    });
  }

  private handleAllyLifespan(planet: Planet, request: LandingActionRequest): LandingEventResult {
    if (!this.isAllyPlanet(planet)) {
      return this.buildBlockedResult(request, 'Solo aliados comparten su tiempo de vida.', 'relation-mismatch');
    }
    const profile = this.characterProfile.profile;
    const sanityDelta = 100 - profile.sanity;
    const healthDelta = 100 - profile.health;
    if (sanityDelta || healthDelta) {
      this.applyVitalsDelta(
        { sanity: sanityDelta || undefined, health: healthDelta || undefined },
        { action: request.action, planetId: planet.id, detail: 'ally-lifespan-restore' }
      );
    }
    const daysShared = Math.floor(Math.random() * 11) + 20;
    const ageDaysDelta = this.applyAgeDelta(daysShared);

    const narrative: LandingActionLogEntry[] = [
      { tone: 'info', text: 'Pasas un día entero compartiendo historias ante braseros que doblan el tiempo.' },
      { tone: 'warning', text: 'Sientes la edad avanzar décadas, pero la mente y el cuerpo quedan restaurados.' }
    ];
    const effects: LandingActionEffects = {
      sanityDelta: sanityDelta || undefined,
      healthDelta: healthDelta || undefined,
      ageDaysDelta
    };
    return this.composeResult(request, planet, {
      title: 'Compartir tiempo de vida',
      narrative,
      effects,
      success: true
    });
  }

  private handleEnemyConfrontation(planet: Planet, request: LandingActionRequest): LandingEventResult {
    if (!this.isEnemyPlanet(planet)) {
      return this.buildBlockedResult(request, 'Solo los planetas hostiles exigen esta confrontación.', 'relation-mismatch');
    }
    if (!planet.lesserBeing) {
      return this.buildBlockedResult(request, 'El lesser being ya no ronda este mundo.', 'no-lesser-being');
    }
    const profile = this.characterProfile.profile;
    const newHealth = Math.max(1, Math.floor(profile.health / 2));
    const healthDelta = newHealth - profile.health;
    const sanityDelta = 100 - profile.sanity;
    this.applyVitalsDelta(
      { health: healthDelta, sanity: sanityDelta },
      { action: request.action, planetId: planet.id, detail: 'enemy-confrontation' }
    );
    const ageDaysDelta = this.applyAgeDelta(2);
    const experienceDelta = 25;
    this.characterProfile.awardExperience(experienceDelta, 'landing-lesser-confrontation');

    planet.setLesserBeing(null);
    planet.creatureScanned = true;
    planet.lesserBeingIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_ABSENT;
    const missionSnapshot = planet.pendingMission?.id
      ? this.missionService.getMissionSnapshot(planet.pendingMission.id)
      : null;
    if (missionSnapshot?.status === 'completed') {
      planet.setAnimosity(GameObjectAnimosity.FRIENDLY);
    }

    const narrative: LandingActionLogEntry[] = [
      { tone: 'danger', text: 'Desciendes a la sima donde la criatura cantaba tu nombre al revés.' },
      { tone: 'success', text: 'Regresas cubierto de hollín cósmico: el lesser being se disuelve en silencio.' }
    ];
    const effects: LandingActionEffects = {
      healthDelta,
      sanityDelta,
      ageDaysDelta,
      experienceDelta,
      intel: { lesserBeing: planet.lesserBeingIntelStatus }
    };
    return this.composeResult(request, planet, {
      title: 'Confrontar lesser being',
      narrative,
      effects,
      success: true
    });
  }

  private isNeutralPlanet(planet: Planet): boolean {
    return (planet.animosity ?? GameObjectAnimosity.NEUTRAL) === GameObjectAnimosity.NEUTRAL;
  }

  private isAllyPlanet(planet: Planet): boolean {
    return (planet.animosity ?? GameObjectAnimosity.NEUTRAL) === GameObjectAnimosity.FRIENDLY;
  }

  private isEnemyPlanet(planet: Planet): boolean {
    return (planet.animosity ?? GameObjectAnimosity.NEUTRAL) === GameObjectAnimosity.ENEMY;
  }

  private handleDiplomacyBribe(
    planet: Planet,
    mission: PlanetMissionState,
    script: LandingDiplomacyScript,
    request: LandingActionRequest
  ): LandingEventResult {
    const option = script.bribeOption;
    if (option.cost && !this.hasResourceStock(planet.resourceStock, option.cost)) {
      return this.buildBlockedResult(request, option.narrativeFailure ?? 'Requiere más recursos.', 'insufficient-resources');
    }

    const before = this.missionService.getMissionSnapshot(mission.id);
    if (option.cost) {
      this.consumePlanetResources(planet, option.cost);
    }
    const updated = this.missionService.addClueToken(
      mission.id,
      option.clueTier,
      option.clueSummary,
      option.method,
      option.cost
    );
    const clues = this.extractNewClues(before, updated);
    const narrative: LandingActionLogEntry[] = [
      { tone: 'info', text: 'Extiendes el tributo sobre la losa ritual.' },
      { tone: 'success', text: option.narrativeSuccess }
    ];
    const effects: LandingActionEffects = {
      resourcesSpent: option.cost ? { ...option.cost } : undefined,
      clueTokensAwarded: clues.length ? clues : undefined,
      missionStatus: updated?.status
    };
    return this.composeResult(request, planet, {
      title: option.label,
      narrative,
      effects,
      success: true,
      metadata: { missionId: mission.id, diplomacyAction: option.id }
    });
  }

  private handleDiplomacyVision(
    planet: Planet,
    mission: PlanetMissionState,
    script: LandingDiplomacyScript,
    request: LandingActionRequest
  ): LandingEventResult {
    const option = script.visionOption;
    const sanityCost = option.sanityCost ?? 0;
    const currentSanity = this.characterProfile.profile.sanity;
    if (sanityCost > 0 && currentSanity <= sanityCost) {
      return this.buildBlockedResult(request, option.narrativeFailure ?? 'Te falta cordura.', 'insufficient-sanity');
    }
    if (sanityCost) {
      this.applyVitalsDelta(
        { sanity: -sanityCost },
        { action: request.action, planetId: planet.id, detail: 'diplomacy-vision' }
      );
    }
    const before = this.missionService.getMissionSnapshot(mission.id);
    const updated = this.missionService.addClueToken(
      mission.id,
      option.clueTier,
      option.clueSummary,
      option.method
    );
    const clues = this.extractNewClues(before, updated);
    const narrative: LandingActionLogEntry[] = [
      { tone: 'warning', text: 'Permites que sus mentes inunden la tuya.' },
      { tone: 'success', text: option.narrativeSuccess }
    ];
    const effects: LandingActionEffects = {
      sanityDelta: sanityCost ? -sanityCost : undefined,
      clueTokensAwarded: clues.length ? clues : undefined,
      missionStatus: updated?.status
    };
    return this.composeResult(request, planet, {
      title: option.label,
      narrative,
      effects,
      success: true,
      metadata: { missionId: mission.id, diplomacyAction: option.id }
    });
  }

  private handleDiplomacySubTask(
    planet: Planet,
    mission: PlanetMissionState,
    script: LandingDiplomacyScript,
    request: LandingActionRequest,
    subTaskId?: string
  ): LandingEventResult {
    const config = this.pickSubTask(script, subTaskId);
    if (!config) {
      return this.buildBlockedResult(request, 'La facción no tiene recados activos.', 'no-subtasks');
    }
    if (config.cost && !this.hasResourceStock(planet.resourceStock, config.cost)) {
      return this.buildBlockedResult(request, 'Recado requiere más recursos.', 'subtask-resource-shortage');
    }

    this.missionService.registerSubTask(mission.id, {
      id: config.id,
      label: config.label,
      description: config.description,
      rewardTier: config.rewardTier,
      cooldownMs: config.cooldownMs,
      cost: config.cost
    });
    if (config.cost) {
      this.consumePlanetResources(planet, config.cost);
    }
    const before = this.missionService.getMissionSnapshot(mission.id);
    const roll = this.roll(config.successProbability);
    let updated: PlanetMissionState | null = null;
    let sanityDelta = 0;
    let healthDelta = 0;
    if (roll.success) {
      updated = this.missionService.setSubTaskStatus(mission.id, config.id, 'completed', {
        clueSummary: config.clueSummary
      });
    } else {
      updated = this.missionService.setSubTaskStatus(mission.id, config.id, 'failed');
      if (config.healthCostOnFail) {
        healthDelta -= config.healthCostOnFail;
      }
      if (config.sanityCostOnFail) {
        sanityDelta -= config.sanityCostOnFail;
      }
      if (healthDelta || sanityDelta) {
        this.applyVitalsDelta(
          {
            health: healthDelta || undefined,
            sanity: sanityDelta || undefined
          },
          { action: request.action, planetId: planet.id, detail: 'diplomacy-subtask' }
        );
      }
    }
    const clues = roll.success ? this.extractNewClues(before, updated) : [];
    const narrative: LandingActionLogEntry[] = [
      { tone: 'info', text: config.description },
      {
        tone: roll.success ? 'success' : 'danger',
        text: roll.success ? config.logSuccess : config.logFailure
      }
    ];
    const effects: LandingActionEffects = {
      sanityDelta: sanityDelta || undefined,
      healthDelta: healthDelta || undefined,
      clueTokensAwarded: clues.length ? clues : undefined,
      missionStatus: updated?.status,
      subTaskUpdate: { id: config.id, status: roll.success ? 'completed' : 'failed' },
      resourcesSpent: config.cost ? { ...config.cost } : undefined
    };
    return this.composeResult(request, planet, {
      title: config.label,
      narrative,
      effects,
      success: roll.success,
      roll: roll.roll,
      probability: config.successProbability,
      metadata: { missionId: mission.id, diplomacyAction: config.id }
    });
  }

  private handleDiplomacyCompletion(
    planet: Planet,
    mission: PlanetMissionState,
    request: LandingActionRequest
  ): LandingEventResult {
    if (mission.requiredCargoEntryId && !this.missionService.hasRequiredCargoReady(mission.id)) {
      const label = mission.requiredCargoLabel ?? 'el cargamento solicitado';
      return this.buildBlockedResult(request, `Debes entregar ${label}.`, 'missing-mission-cargo');
    }
    const updated = this.missionService.completeMission(mission.id);
    if (updated?.status === 'completed') {
      const narrative: LandingActionLogEntry[] = [
        { tone: 'success', text: 'La facción reconoce tu lealtad y honra el pacto.' }
      ];
      return this.composeResult(request, planet, {
        title: 'Entregar misión',
        narrative,
        effects: { missionStatus: updated.status },
        success: true,
        metadata: { missionId: mission.id, diplomacyAction: 'complete' }
      });
    }
    const missing = this.missionService.getMissingClueTiers(mission.id);
    const reason = missing.length
      ? `Faltan pistas: ${missing.join(', ')}`
      : 'La misión aún no cumple los requisitos.';
    return this.buildBlockedResult(request, reason, 'mission-not-ready');
  }

  private pickSubTask(script: LandingDiplomacyScript, subTaskId?: string): DiplomacySubTaskConfig | null {
    if (!script.subTasks.length) {
      return null;
    }
    if (subTaskId) {
      const match = script.subTasks.find(task => task.id === subTaskId);
      if (match) {
        return match;
      }
    }
    return script.subTasks[0];
  }

  private exploreArtifact(planet: Planet, request: LandingActionRequest): LandingEventResult {
    planet.markVisited();
    const effects: LandingActionEffects = { ageDaysDelta: this.applyAgeDelta(2) };
    const script = this.landingNarrative.getExplorationScript(LandingExploreObjective.ARTIFACT);
    const roll = this.roll(EXPLORE_SUCCESS_CHANCE);
    const introText = this.pickNarrativeText(
      script?.intro,
      'Sigues las runas talladas en pilares basálticos hacia una cámara de ozono quemado.'
    );
    const narrative: LandingActionLogEntry[] = [{ tone: 'info', text: introText }];

    if (roll.success) {
      if (planet.hasArtifact) {
        planet.hasArtifact = false;
        planet.artifactIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_PRESENT;
        effects.intel = { artifact: planet.artifactIntelStatus };
        effects.itemsAwarded = [
          { id: `artifact-${planet.id}-${Date.now()}`, label: 'Artefacto translúcido recuperado', type: 'artifact', quantity: 1 }
        ];
        const successText = this.pickNestedNarrativeText(
          script,
          ['success', 'hasArtifact'],
          'Entre la grava hallas un prisma translúcido que late al contacto.'
        );
        narrative.push({ tone: 'success', text: successText });
        const cargoAssignments = this.missionService.registerArtifactRecovery(planet, {
          cargoLabel: `Artefacto recuperado de ${planet.getDisplayName?.() ?? planet.id}`
        });
        if (cargoAssignments.length) {
          narrative.push({
            tone: 'success',
            text: cargoAssignments.length > 1
              ? 'Varias cofradías identifican el hallazgo y etiquetan el cargamento en tu bodega.'
              : 'El encargo activo reconoce el hallazgo y el artefacto queda listo para su entrega.'
          });
          effects.missionStatus = cargoAssignments[0].mission.status;
        }
      } else {
        planet.artifactIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_ABSENT;
        effects.intel = { artifact: planet.artifactIntelStatus };
        this.characterProfile.awardExperience(1, 'landing-artifact-absence');
        effects.experienceDelta = 1;
        const absentText = this.pickNestedNarrativeText(
          script,
          ['success', 'confirmedAbsent'],
          'Los nichos están vacíos: registras que el guardián evacuó el tesoro hace siglos.'
        );
        narrative.push({ tone: 'info', text: absentText });
      }

      const result = this.composeResult(request, planet, {
        title: 'Búsqueda de artefacto',
        narrative,
        effects,
        success: true,
        roll: roll.roll,
        probability: EXPLORE_SUCCESS_CHANCE,
      });
      this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Artifact search success', { planetId: planet.id, absent: !planet.hasArtifact });
      return result;
    }

    this.applyVitalsDelta({ health: -5 }, { action: request.action, planetId: planet.id, detail: 'artifact-search-fail' });
    effects.healthDelta = -5;
    effects.needsRetry = true;
    const failureText = this.pickNarrativeText(
      script?.failure,
      'Un mecanismo despierta y te hiere con agujas de luz negra. Necesitas reagruparte.'
    );
    narrative.push({ tone: 'danger', text: failureText });

    const result = this.composeResult(request, planet, {
      title: 'Búsqueda de artefacto',
      narrative,
      effects,
      success: false,
      roll: roll.roll,
      probability: EXPLORE_SUCCESS_CHANCE,
    });
    this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Artifact search failed', { planetId: planet.id, roll: roll.roll });
    return result;
  }

  private exploreVoidMass(planet: Planet, request: LandingActionRequest): LandingEventResult {
    const ship = this.gameState.spaceship;
    if (!ship) {
      return this.buildBlockedResult(request, 'La nave no está disponible', 'ship-missing');
    }
    if (ship.voidEnergyCurrent >= ship.voidEnergyMax) {
      return this.buildBlockedResult(request, 'Depósitos de vacío ya están llenos', 'void-energy-full');
    }

    planet.markVisited();
    const effects: LandingActionEffects = { ageDaysDelta: this.applyAgeDelta(2) };
    const script = this.landingNarrative.getExplorationScript(LandingExploreObjective.VOID_MASS);
    const introText = this.pickNarrativeText(
      script?.intro,
      'Descendiste a una catarata gravitacional que canta frecuencias imposibles.'
    );
    const narrative: LandingActionLogEntry[] = [{ tone: 'info', text: introText }];

    if (planet.voidMassRemaining <= 0) {
      planet.voidMassIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_ABSENT;
      effects.intel = { voidMass: planet.voidMassIntelStatus };
      this.characterProfile.awardExperience(1, 'landing-void-absence');
      effects.experienceDelta = 1;
      narrative.push({ tone: 'warning', text: 'Los sensores confirman que el vacío fue drenado hace eras.' });
    } else {
      const probability = EXPLORE_SUCCESS_CHANCE;
      const roll = this.roll(probability);
      planet.voidMassIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_PRESENT;
      effects.intel = { voidMass: planet.voidMassIntelStatus };

      if (roll.success) {
        const harvest = this.harvestVoidMass(planet, ship);
        effects.voidEnergyDelta = harvest.energyGained;
        effects.voidMassDrained = harvest.massDrained;
        effects.planetVoidMassRemaining = harvest.remainingMass;
        effects.planetCollapsed = harvest.collapsed;
        const successText = this.pickNarrativeText(
          script?.success,
          'La catarata gravitacional llena los depósitos de la nave y chisporrotea contra el fuselaje.'
        );
        narrative.push({ tone: 'success', text: successText });
        if (!harvest.filledShip) {
          narrative.push({ tone: 'warning', text: 'Drenas todo lo accesible, pero la reserva planetaria estaba casi agotada.' });
        }
        if (harvest.massDrained > 0) {
          narrative.push({ tone: 'info', text: `La corteza se repliega ${harvest.collapsed ? 'antes de implosionar en un filo negro' : 'y contrae el planeta hasta un cascarón hueco'}.` });
        }
        if (harvest.collapsed) {
          narrative.push({ tone: 'danger', text: 'El núcleo se extingue: el planeta se colapsa en una navaja de polvo oscuro.' });
        }

        const metadata = effects.voidMassDrained ? {
          voidMassDrained: effects.voidMassDrained,
          voidMassRemaining: effects.planetVoidMassRemaining,
          planetCollapsed: effects.planetCollapsed
        } : undefined;
        const result = this.composeResult(request, planet, {
          title: 'Captura de void mass',
          narrative,
          effects,
          success: true,
          metadata,
          roll: roll.roll,
          probability
        });
        this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Void mass harvest resolved', {
          planetId: planet.id,
          drained: effects.voidMassDrained ?? 0,
          remaining: planet.voidMassRemaining,
          collapsed: effects.planetCollapsed,
          roll: roll.roll
        });
        return result;
      }

      const sanityLoss = -3;
      const healthLoss = -6;
      this.applyVitalsDelta(
        { sanity: sanityLoss, health: healthLoss },
        { action: request.action, planetId: planet.id, detail: 'void-mass-fail' }
      );
      effects.sanityDelta = sanityLoss;
      effects.healthDelta = healthLoss;
      effects.needsRetry = true;
      const failureText = this.pickNarrativeText(
        script?.failure,
        'La catarata se desborda y la nave vibra hasta casi partirse; la extracción fracasa.'
      );
      narrative.push({ tone: 'danger', text: failureText });
      narrative.push({ tone: 'warning', text: 'Pierdes salud y cordura antes de poder estabilizar los campos.' });

      const result = this.composeResult(request, planet, {
        title: 'Captura de void mass',
        narrative,
        effects,
        success: false,
        roll: roll.roll,
        probability
      });
      this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Void mass harvest failed', {
        planetId: planet.id,
        roll: roll.roll
      });
      return result;
    }

    const metadata = effects.voidMassDrained ? {
      voidMassDrained: effects.voidMassDrained,
      voidMassRemaining: effects.planetVoidMassRemaining,
      planetCollapsed: effects.planetCollapsed
    } : undefined;
    const result = this.composeResult(request, planet, {
      title: 'Captura de void mass',
      narrative,
      effects,
      success: true,
      metadata
    });
    this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Void mass harvest resolved (empty planet)', {
      planetId: planet.id,
      remaining: planet.voidMassRemaining
    });
    return result;
  }

  private exploreCivilization(planet: Planet, request: LandingActionRequest): LandingEventResult {
    planet.markVisited();
    const effects: LandingActionEffects = { ageDaysDelta: this.applyAgeDelta(2) };
    const script = this.landingNarrative.getExplorationScript(LandingExploreObjective.CIVILIZATION);
    const roll = this.roll(EXPLORE_SUCCESS_CHANCE);
    const introText = this.pickNarrativeText(
      script?.intro,
      'Te recibe una plaza en silencio, con emisarios telepáticos aguardando tu gesto.'
    );
    const narrative: LandingActionLogEntry[] = [{ tone: 'info', text: introText }];

    if (roll.success) {
      planet.markLifeScanned();
      if (planet.inhabitants !== PlanetInhabitants.NONE) {
        planet.civilizationIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_PRESENT;
        const successText = this.pickNarrativeText(
          script?.success,
          'El consejo local comparte símbolos y reconoce tu llegada.'
        );
        narrative.push({ tone: 'success', text: successText });
      } else {
        planet.civilizationIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_ABSENT;
        this.characterProfile.awardExperience(1, 'landing-civilization-absence');
        effects.experienceDelta = 1;
        narrative.push({ tone: 'warning', text: 'Solo quedan ecos en la plaza; registras la extinción en tus bitácoras.' });
      }
      effects.intel = { civilization: planet.civilizationIntelStatus };

      const result = this.composeResult(request, planet, {
        title: 'Contacto con civilización',
        narrative,
        effects,
        success: true,
        roll: roll.roll,
        probability: EXPLORE_SUCCESS_CHANCE,
      });
      this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Civilization contact success', { planetId: planet.id });
      return result;
    }

    this.applyVitalsDelta({ health: -5 }, { action: request.action, planetId: planet.id, detail: 'civilization-contact-fail' });
    effects.healthDelta = -5;
    const failureText = this.pickNarrativeText(
      script?.failure,
      'Negociadores hostiles regresan con lanzas sónicas. Te retiras herido.'
    );
    narrative.push({ tone: 'danger', text: failureText });

    const result = this.composeResult(request, planet, {
      title: 'Contacto con civilización',
      narrative,
      effects,
      success: false,
      roll: roll.roll,
      probability: EXPLORE_SUCCESS_CHANCE,
    });
    this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Civilization contact failed', { planetId: planet.id, roll: roll.roll });
    return result;
  }

  private exploreLesserBeing(planet: Planet, request: LandingActionRequest): LandingEventResult {
    planet.markVisited();
    const effects: LandingActionEffects = { ageDaysDelta: this.applyAgeDelta(2) };
    const script = this.landingNarrative.getExplorationScript(LandingExploreObjective.LESSER_BEING);
    const roll = this.roll(EXPLORE_SUCCESS_CHANCE);
    const introText = this.pickNarrativeText(
      script?.intro,
      'Desciendes a catacumbas donde el eco pronuncia tu nombre al revés.'
    );
    const narrative: LandingActionLogEntry[] = [{ tone: 'info', text: introText }];

    if (roll.success) {
      planet.markCreatureScanned();
      const hasBeing = !!planet.lesserBeing;
      planet.lesserBeingIntelStatus = hasBeing ? PLANET_INTEL_STATUS.CONFIRMED_PRESENT : PLANET_INTEL_STATUS.CONFIRMED_ABSENT;
      effects.intel = { lesserBeing: planet.lesserBeingIntelStatus };
      if (hasBeing) {
        this.applyVitalsDelta({ sanity: -5 }, { action: request.action, planetId: planet.id, detail: 'lesser-being-scan' });
        effects.sanityDelta = -5;
        const presentText = this.pickNestedNarrativeText(
          script,
          ['success', 'present'],
          'Lo observas, pero el precio es la cordura: la criatura canta desde tu mente.'
        );
        narrative.push({ tone: 'warning', text: presentText });
      } else {
        const absentText = this.pickNestedNarrativeText(
          script,
          ['success', 'absent'],
          'Solo encuentras un sarcófago vacío: confirmas que no hay lesser beings activos.'
        );
        narrative.push({ tone: 'success', text: absentText });
      }

      const result = this.composeResult(request, planet, {
        title: 'Rastrear lesser being',
        narrative,
        effects,
        success: true,
        roll: roll.roll,
        probability: EXPLORE_SUCCESS_CHANCE,
      });
      this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Lesser being search success', { planetId: planet.id, present: !!planet.lesserBeing });
      return result;
    }

    this.applyVitalsDelta({ health: -5 }, { action: request.action, planetId: planet.id, detail: 'lesser-being-search-fail' });
    effects.healthDelta = -5;
    const failureText = this.pickNarrativeText(
      script?.failure,
      'Trampas psíquicas cortan el paso y sales herido.'
    );
    narrative.push({ tone: 'danger', text: failureText });

    const result = this.composeResult(request, planet, {
      title: 'Rastrear lesser being',
      narrative,
      effects,
      success: false,
      roll: roll.roll,
      probability: EXPLORE_SUCCESS_CHANCE,
    });
    this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Lesser being search failed', { planetId: planet.id, roll: roll.roll });
    return result;
  }

  private hasResourceStock(stock: PlanetResourceStock | null | undefined, cost?: Partial<PlanetResourceStock>): boolean {
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

  private consumePlanetResources(planet: Planet, cost: Partial<PlanetResourceStock>): void {
    for (const key of Object.keys(cost) as Array<keyof PlanetResourceStock>) {
      const amount = cost[key];
      if (!amount) {
        continue;
      }
      const current = planet.resourceStock[key] ?? 0;
      planet.resourceStock[key] = Math.max(0, current - amount);
    }
  }

  private extractNewClues(before: PlanetMissionState | null, after: PlanetMissionState | null): MissionClueToken[] {
    if (!after) {
      return [];
    }
    const beforeIds = new Set((before?.clueTokens ?? []).map(token => token.id));
    return (after.clueTokens ?? []).filter(token => !beforeIds.has(token.id));
  }

  private composeResult(
    request: LandingActionRequest,
    planet: Planet,
    params: {
      title: string;
      narrative: LandingActionLogEntry[];
      effects: LandingActionEffects;
      success: boolean;
      roll?: number;
      probability?: number;
      metadata?: Record<string, any>;
    }
  ): LandingEventResult {
    const result: LandingEventResult = {
      id: `${request.action}-${Date.now()}`,
      planetId: planet.id,
      action: request.action,
      objective: request.objective,
      success: params.success,
      blocked: false,
      title: params.title,
      narrative: params.narrative,
      effects: params.effects,
      probability: params.probability,
      roll: params.roll,
      timestamp: Date.now(),
      metadata: params.metadata,
    };
    this.gameState.syncPlanetIntelFromPlanet(planet);
    return result;
  }

  private buildBlockedResult(request: LandingActionRequest, text: string, reason: string): LandingEventResult {
    const effects: LandingActionEffects = { blockedReason: reason };
    const narrative: LandingActionLogEntry[] = [{ tone: 'warning', text }];
    return {
      id: `${request.action}-${Date.now()}`,
      planetId: request.planetId,
      action: request.action,
      objective: request.objective,
      success: false,
      blocked: true,
      title: 'Acción bloqueada',
      narrative,
      effects,
      timestamp: Date.now(),
    };
  }

  private resolvePlanet(planetId: string): Planet | null {
    const resolveCandidate = (candidate?: Planet | null) => {
      if (!candidate || typeof candidate.getType !== 'function') {
        return null;
      }
      if (typeof candidate.isActive === 'function' && !candidate.isActive()) {
        return null;
      }
      const type = candidate.getType();
      if (!type) {
        return null;
      }
      const belongsToPlanetCategory = type === GameObjectType.PLANET || getCategory(type) === GameObjectCategory.PLANET;
      return belongsToPlanetCategory ? candidate : null;
    };

    const direct = resolveCandidate(this.gameState.findPlanetById(planetId));
    if (direct) {
      return direct;
    }
    const fallback = resolveCandidate(this.gameState.getActiveLandingPlanet?.() || null);
    if (fallback && fallback.id === planetId) {
      return fallback;
    }
    return null;
  }

  private roll(probability: number): RollOutcome {
    const roll = Math.random();
    return { success: roll <= probability, roll };
  }

  private applyAgeDelta(days: number): number {
    if (!days) {
      return 0;
    }

    const engine = this.gameInitializer.getGameEngine();
    if (engine && typeof (engine as any).applyExternalAgeDelta === 'function') {
      try {
        const outcome = (engine as any).applyExternalAgeDelta(days, 'landing');
        return outcome?.daysApplied ?? 0;
      } catch (error) {
        this.logger.log(LogLevel.ERROR, LogCategory.LANDING, 'Failed to route age delta through engine', {
          days,
          error
        });
      }
    }

    const info = this.characterProfile.addDaysToAge(days);
    this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Age delta applied without engine hook', {
      days,
      daysApplied: info?.daysApplied ?? 0
    });
    return info?.daysApplied ?? 0;
  }

  private applyVitalsDelta(delta: { sanity?: number; health?: number }, context: LandingFatalContext): void {
    if (!delta) {
      return;
    }
    this.characterProfile.adjustVitals(delta);
    this.evaluateLandingFatality(context);
  }

  private evaluateLandingFatality(context: LandingFatalContext): void {
    const profile = this.gameState.characterProfile;
    let source: 'landing-health' | 'landing-sanity' | null = null;
    if (profile.health <= 0) {
      source = 'landing-health';
    } else if (profile.sanity <= 0) {
      source = 'landing-sanity';
    }

    if (!source) {
      return;
    }

    const engine = this.gameInitializer.getGameEngine();
    const metadata = {
      ...context,
      health: profile.health,
      sanity: profile.sanity
    };

    if (engine && typeof (engine as any).triggerLandingFatality === 'function') {
      try {
        (engine as any).triggerLandingFatality(source, metadata);
        return;
      } catch (error) {
        this.logger.log(LogLevel.ERROR, LogCategory.LANDING, 'Failed to trigger landing fatality', {
          source,
          metadata,
          error
        });
      }
    }

    this.logger.log(LogLevel.ERROR, LogCategory.LANDING, 'Game engine unavailable for landing fatality', {
      source,
      metadata
    });
  }

  private harvestVoidMass(planet: Planet, ship: { voidEnergyCurrent: number; voidEnergyMax: number }): {
    energyGained: number;
    massDrained: number;
    remainingMass: number;
    collapsed: boolean;
    filledShip: boolean;
  } {
    const capacityDelta = Math.max(0, ship.voidEnergyMax - ship.voidEnergyCurrent);
    if (capacityDelta <= 0) {
      return { energyGained: 0, massDrained: 0, remainingMass: planet.voidMassRemaining, collapsed: false, filledShip: true };
    }
    const massNeeded = capacityDelta * VOID_MASS_PER_ENERGY_UNIT;
    const available = Math.max(0, planet.voidMassRemaining);
    const massDrained = Math.min(available, massNeeded);
    const energyGained = massDrained / VOID_MASS_PER_ENERGY_UNIT;
    const newEnergy = Math.min(ship.voidEnergyMax, ship.voidEnergyCurrent + energyGained);
    ship.voidEnergyCurrent = newEnergy;
    planet.voidMassRemaining = Math.max(0, available - massDrained);
    planet.refreshVoidMassFlags();
    planet.updateScaleFromVoidMass(MIN_PLANET_SCALE_RATIO);
    const collapsed = planet.voidMassRemaining <= PLANET_MIN_VOID_MASS_TO_SURVIVE;
    if (collapsed) {
      this.processPlanetCollapse(planet);
    }
    return {
      energyGained,
      massDrained,
      remainingMass: planet.voidMassRemaining,
      collapsed,
      filledShip: Math.abs(newEnergy - ship.voidEnergyMax) < 1e-3
    };
  }

  private retireDepletedPlanet(planet: Planet): void {
    planet.voidMassRemaining = 0;
    planet.hasVoidMass = false;
    planet.voidMassIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_ABSENT;
    planet.refreshVoidMassFlags();
    planet.visible = false;
    planet.active = false;
    planet.renderOpacity = 0;
    try { this.gameState.removeObject(planet); } catch {}
    this.gameState.upsertPlanetIntelSnapshot(planet.id, {
      hasVoidMass: false,
      voidMassRemaining: 0,
      voidMassCapacity: planet.voidMassCapacity,
      voidMassIntelStatus: PLANET_INTEL_STATUS.CONFIRMED_ABSENT
    });
  }

  private processPlanetCollapse(planet: Planet): void {
    const info = this.buildPlanetCollapseNotification(planet);
    this.retireDepletedPlanet(planet);
    this.dispatchPlanetCollapse(planet, info);
  }

  private buildPlanetCollapseNotification(planet: Planet): PlanetCollapseNotification {
    const radiusCandidates = [
      planet.scale?.x ?? 0,
      planet.initialRadius ?? 0,
      planet.boundingSphere?.radius ?? 0,
      planet.voidMassCapacity > 0 ? planet.voidMassCapacity ** (1 / 3) : 0
    ];
    const radius = Math.max(100, ...radiusCandidates.filter(v => Number.isFinite(v)));
    return {
      planetId: planet.id,
      position: { ...planet.position },
      radius,
      clusterCount: 40
    };
  }

  private dispatchPlanetCollapse(planet: Planet, info: PlanetCollapseNotification): void {
    try {
      const engine = this.gameInitializer.getGameEngine();
      if (!engine || typeof (engine as any).handleLandingPlanetCollapse !== 'function') {
        this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Game engine not ready for collapse dispatch', {
          planetId: planet.id
        });
        return;
      }
      (engine as any).handleLandingPlanetCollapse(planet, info);
    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.LANDING, 'Failed to dispatch planet collapse to engine', {
        planetId: planet.id,
        error
      });
    }
  }

  private pickNarrativeText(entry: unknown, fallback: string): string {
    if (entry == null) {
      return fallback;
    }
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      return trimmed.length ? trimmed : fallback;
    }
    if (typeof entry === 'object' && 'text' in (entry as Record<string, unknown>)) {
      const textValue = (entry as { text?: string }).text;
      if (typeof textValue === 'string') {
        const trimmed = textValue.trim();
        return trimmed.length ? trimmed : fallback;
      }
    }
    return fallback;
  }

  private pickNestedNarrativeText(source: unknown, path: string[], fallback: string): string {
    let cursor: unknown = source;
    for (const segment of path) {
      if (cursor == null || typeof cursor !== 'object') {
        cursor = undefined;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    return this.pickNarrativeText(cursor, fallback);
  }
}
