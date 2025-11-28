import { Injectable } from '@angular/core';
import { Planet } from '../../game/game-objects/Planet';
import { GameStateStore } from './game-state.store';
import { CharacterProfileService } from './character-profile.service';
import { LoggingService, LogCategory, LogLevel } from '../logging.service';
import { LandingActionRequest, LandingActionKind, LandingExploreObjective, LandingEventResult, LandingActionEffects, LandingActionLogEntry } from '../../game/types/landing-action.types';
import { PLANET_INTEL_STATUS } from '../../game/types/planet-intel.types';
import { PlanetInhabitants } from '../../game/types/cosmic-life.types';
import { GameObjectCategory, GameObjectType, getCategory } from '../../game/types/game-object.types';

interface RollOutcome {
  success: boolean;
  roll: number;
}

@Injectable({ providedIn: 'root' })
export class LandingActionService {
  constructor(
    private readonly gameState: GameStateStore,
    private readonly characterProfile: CharacterProfileService,
    private readonly logger: LoggingService
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

    const sanityDelta = hasLesserBeing ? -1 : 1;
    const healthDelta = hasLesserBeing ? -5 : 5;
    effects.sanityDelta = sanityDelta;
    effects.healthDelta = healthDelta;
    effects.ageDaysDelta = this.applyAgeDelta(1);

    this.characterProfile.adjustVitals({ sanity: sanityDelta, health: healthDelta });

    if (hasLesserBeing) {
      planet.lesserBeingIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_PRESENT;
      planet.markCreatureScanned();
      effects.interrupted = true;
      effects.intel = { lesserBeing: planet.lesserBeingIntelStatus };
      narrative.push(
        { tone: 'warning', text: 'Un chillido subarmónico rompe el refugio justo cuando cierras los ojos.' },
        { tone: 'danger', text: 'La criatura interrumpe el descanso: pierdes cordura y salud.' }
      );
    } else {
      narrative.push(
        { tone: 'info', text: 'Acampas junto a la estela magnética del motor, dejando que la arena púrpura silencie la radio.' },
        { tone: 'success', text: 'Sueñas con constelaciones imposibles. Recuperas fuerza y cordura.' }
      );
    }

    const result = this.composeResult(request, planet, {
      title,
      narrative,
      effects,
      success: !hasLesserBeing,
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

  private exploreArtifact(planet: Planet, request: LandingActionRequest): LandingEventResult {
    planet.markVisited();
    const effects: LandingActionEffects = { ageDaysDelta: this.applyAgeDelta(2) };
    const roll = this.roll(0.5);
    const narrative: LandingActionLogEntry[] = [
      { tone: 'info', text: 'Sigues las runas talladas en pilares basálticos hacia una cámara de ozono quemado.' }
    ];

    if (roll.success) {
      if (planet.hasArtifact) {
        planet.hasArtifact = false;
        planet.artifactIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_PRESENT;
        effects.intel = { artifact: planet.artifactIntelStatus };
        effects.itemsAwarded = [
          { id: `artifact-${planet.id}-${Date.now()}`, label: 'Artefacto translúcido recuperado', type: 'artifact', quantity: 1 }
        ];
        narrative.push({ tone: 'success', text: 'Entre la grava hallas un prisma translúcido que late al contacto.' });
      } else {
        planet.artifactIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_ABSENT;
        effects.intel = { artifact: planet.artifactIntelStatus };
        this.characterProfile.awardExperience(1, 'landing-artifact-absence');
        effects.experienceDelta = 1;
        narrative.push({ tone: 'info', text: 'Los nichos están vacíos: registras que el guardián evacuó el tesoro hace siglos.' });
      }

      const result = this.composeResult(request, planet, {
        title: 'Búsqueda de artefacto',
        narrative,
        effects,
        success: true,
        roll: roll.roll,
        probability: 0.5,
      });
      this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Artifact search success', { planetId: planet.id, absent: !planet.hasArtifact });
      return result;
    }

    this.characterProfile.adjustVitals({ health: -5 });
    effects.healthDelta = -5;
    effects.needsRetry = true;
    narrative.push({ tone: 'danger', text: 'Un mecanismo despierta y te hiere con agujas de luz negra. Necesitas reagruparte.' });

    const result = this.composeResult(request, planet, {
      title: 'Búsqueda de artefacto',
      narrative,
      effects,
      success: false,
      roll: roll.roll,
      probability: 0.5,
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
    const roll = this.roll(0.5);
    const narrative: LandingActionLogEntry[] = [
      { tone: 'info', text: 'Descendiste a una catarata gravitacional que canta frecuencias imposibles.' }
    ];

    if (roll.success) {
      if (planet.hasVoidMass) {
        const delta = ship.voidEnergyMax - ship.voidEnergyCurrent;
        ship.voidEnergyCurrent = ship.voidEnergyMax;
        effects.voidEnergyDelta = delta;
        planet.voidMassIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_PRESENT;
        effects.intel = { voidMass: planet.voidMassIntelStatus };
        narrative.push({ tone: 'success', text: 'La cascada gravitatoria llena los depósitos de la nave.' });
      } else {
        planet.voidMassIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_ABSENT;
        effects.intel = { voidMass: planet.voidMassIntelStatus };
        this.characterProfile.awardExperience(1, 'landing-void-absence');
        effects.experienceDelta = 1;
        narrative.push({ tone: 'warning', text: 'Los sensores confirman que el vacío fue drenado hace eras.' });
      }

      const result = this.composeResult(request, planet, {
        title: 'Captura de void mass',
        narrative,
        effects,
        success: true,
        roll: roll.roll,
        probability: 0.5,
      });
      this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Void mass search success', { planetId: planet.id });
      return result;
    }

    this.characterProfile.adjustVitals({ health: -5 });
    effects.healthDelta = -5;
    narrative.push({ tone: 'danger', text: 'Deslizas por placas gravitacionales fracturadas y vuelves con heridas abiertas.' });

    const result = this.composeResult(request, planet, {
      title: 'Captura de void mass',
      narrative,
      effects,
      success: false,
      roll: roll.roll,
      probability: 0.5,
    });
    this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Void mass search failed', { planetId: planet.id, roll: roll.roll });
    return result;
  }

  private exploreCivilization(planet: Planet, request: LandingActionRequest): LandingEventResult {
    planet.markVisited();
    const effects: LandingActionEffects = { ageDaysDelta: this.applyAgeDelta(2) };
    const roll = this.roll(0.5);
    const narrative: LandingActionLogEntry[] = [
      { tone: 'info', text: 'Te recibe una plaza en silencio, con emisarios telepáticos aguardando tu gesto.' }
    ];

    if (roll.success) {
      planet.markLifeScanned();
      if (planet.inhabitants !== PlanetInhabitants.NONE) {
        planet.civilizationIntelStatus = PLANET_INTEL_STATUS.CONFIRMED_PRESENT;
        narrative.push({ tone: 'success', text: 'El consejo local comparte símbolos y reconoce tu llegada.' });
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
        probability: 0.5,
      });
      this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Civilization contact success', { planetId: planet.id });
      return result;
    }

    this.characterProfile.adjustVitals({ health: -5 });
    effects.healthDelta = -5;
    narrative.push({ tone: 'danger', text: 'Negociadores hostiles regresan con lanzas sónicas. Te retiras herido.' });

    const result = this.composeResult(request, planet, {
      title: 'Contacto con civilización',
      narrative,
      effects,
      success: false,
      roll: roll.roll,
      probability: 0.5,
    });
    this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Civilization contact failed', { planetId: planet.id, roll: roll.roll });
    return result;
  }

  private exploreLesserBeing(planet: Planet, request: LandingActionRequest): LandingEventResult {
    planet.markVisited();
    const effects: LandingActionEffects = { ageDaysDelta: this.applyAgeDelta(2) };
    const roll = this.roll(0.5);
    const narrative: LandingActionLogEntry[] = [
      { tone: 'info', text: 'Desciendes a catacumbas donde el eco pronuncia tu nombre al revés.' }
    ];

    if (roll.success) {
      planet.markCreatureScanned();
      const hasBeing = !!planet.lesserBeing;
      planet.lesserBeingIntelStatus = hasBeing ? PLANET_INTEL_STATUS.CONFIRMED_PRESENT : PLANET_INTEL_STATUS.CONFIRMED_ABSENT;
      effects.intel = { lesserBeing: planet.lesserBeingIntelStatus };
      if (hasBeing) {
        this.characterProfile.adjustVitals({ sanity: -5 });
        effects.sanityDelta = -5;
        narrative.push({ tone: 'warning', text: 'Lo observas, pero el precio es la cordura: la criatura canta desde tu mente.' });
      } else {
        narrative.push({ tone: 'success', text: 'Solo encuentras un sarcófago vacío: confirmas que no hay lesser beings activos.' });
      }

      const result = this.composeResult(request, planet, {
        title: 'Rastrear lesser being',
        narrative,
        effects,
        success: true,
        roll: roll.roll,
        probability: 0.5,
      });
      this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Lesser being search success', { planetId: planet.id, present: !!planet.lesserBeing });
      return result;
    }

    this.characterProfile.adjustVitals({ health: -5 });
    effects.healthDelta = -5;
    narrative.push({ tone: 'danger', text: 'Trampas psíquicas cortan el paso y sales herido.' });

    const result = this.composeResult(request, planet, {
      title: 'Rastrear lesser being',
      narrative,
      effects,
      success: false,
      roll: roll.roll,
      probability: 0.5,
    });
    this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Lesser being search failed', { planetId: planet.id, roll: roll.roll });
    return result;
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
    const info = this.characterProfile.addDaysToAge(days);
    return info?.daysApplied ?? days;
  }
}
