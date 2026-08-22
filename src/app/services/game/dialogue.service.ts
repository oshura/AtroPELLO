import { Injectable } from '@angular/core';
import { Planet } from '../../game/game-objects/Planet';
import { getRaceDefinition } from '../../game/config/race-catalog.config';
import { PLANET_INHABITANT_LABELS, PlanetInhabitants } from '../../game/types/cosmic-life.types';
import { SpellType, getSpellLabel } from '../../game/types/spell.types';
import {
  DialogueChoice,
  DialogueLine,
  DialogueSessionState,
  RaceMissionScript,
} from '../../game/types/dialogue.types';
import { PlanetMissionState } from '../../game/types/planet-intel.types';
import { MissionService } from '../../game/services/game/mission.service';
import { DialogueScriptService } from './dialogue-script.service';
import { GameStateStore } from './game-state.store';
import { RaceOutfittingBridgeService } from './race-outfitting-bridge.service';
import { LoggingService, LogCategory, LogLevel } from '../logging.service';

/**
 * DialogueService — conversación con una raza (Fase 13 — docs/RAZAS.md).
 *
 * El formato que pedía el diseño: una escena narrada, opciones para preguntar y profundizar cuantas
 * veces quieras, y salir cuando te apetezca. Aceptar el encargo es UNA opción más de la charla, no
 * algo que ocurra a tus espaldas por abrir un panel.
 *
 * La sesión es efímera: lo que persiste es la misión que salga de ella.
 */
@Injectable({ providedIn: 'root' })
export class DialogueService {
  constructor(
    private readonly scripts: DialogueScriptService,
    private readonly missions: MissionService,
    private readonly gameState: GameStateStore,
    private readonly engineBridge: RaceOutfittingBridgeService,
    private readonly logger: LoggingService
  ) {}

  private planet: Planet | null = null;
  private script: RaceMissionScript | null = null;
  private state: DialogueSessionState | null = null;
  private askedOptionIds = new Set<string>();

  /** ¿Hay conversación disponible en este planeta? */
  canTalk(planet: Planet | null | undefined): boolean {
    return !!planet && this.scripts.hasScript(planet.inhabitants);
  }

  getState(): DialogueSessionState | null {
    return this.state;
  }

  /** Abre la conversación. Devuelve null si esta raza no tiene guion. */
  start(planet: Planet): DialogueSessionState | null {
    const script = this.scripts.getMissionScript(planet.inhabitants);
    if (!script) {
      return null;
    }
    this.planet = planet;
    this.script = script;
    this.askedOptionIds = new Set<string>();

    // Un hostil no negocia: la conversación nace cerrada, con la puerta en las narices.
    const race = planet.inhabitants ?? PlanetInhabitants.NONE;
    if (this.gameState.getRaceStanding?.(race)?.standing === 'hostile') {
      this.state = {
        raceLabel: this.resolveRaceLabel(planet.inhabitants),
        phase: 'closed',
        log: [{
          speaker: 'narrator',
          text: 'Nadie sale a recibirte. Lo que sea que vive aquí te observa desde dentro, y no como a un visitante.'
        }],
        choices: [{ id: 'leave', label: 'Marcharse', kind: 'leave' }],
        missionSummary: null,
      };
      return this.state;
    }

    const mission = this.findMission(planet);
    const phase = mission && this.isReadyToTurnIn(mission) ? 'turn-in' : 'offer';
    const opening = phase === 'turn-in' ? script.turnIn.success : script.offer.scene;
    this.state = {
      raceLabel: this.resolveRaceLabel(planet.inhabitants),
      phase,
      log: [{ speaker: 'race', text: opening }],
      choices: [],
      missionSummary: this.describeMission(mission),
    };
    this.refreshChoices();
    return this.state;
  }

  /** Aplica una elección del jugador y devuelve el estado actualizado. */
  choose(choiceId: string): DialogueSessionState | null {
    const state = this.state;
    const script = this.script;
    const planet = this.planet;
    if (!state || !script || !planet) {
      return null;
    }
    const choice = state.choices.find(c => c.id === choiceId);
    if (!choice) {
      return state;
    }
    switch (choice.kind) {
      case 'ask':
        this.appendAnswer(state, script, choiceId);
        break;
      case 'accept':
        this.acceptMission(state, script, planet);
        break;
      case 'turn-in':
        this.turnInMission(state, script, planet);
        break;
      case 'tune':
        this.applyPostMissionTune(state, script);
        break;
      case 'leave':
        this.end();
        return this.state;
    }
    this.refreshChoices();
    return this.state;
  }

  /** Cierra la conversación. */
  end(): void {
    this.state = null;
    this.script = null;
    this.planet = null;
    this.askedOptionIds.clear();
  }

  private appendAnswer(state: DialogueSessionState, script: RaceMissionScript, optionId: string): void {
    const option = script.offer.options.find(o => o.id === optionId);
    if (!option) {
      return;
    }
    this.askedOptionIds.add(optionId);
    state.log.push({ speaker: 'narrator', text: `— ${option.label}` });
    state.log.push({ speaker: 'race', text: option.text });
  }

  private acceptMission(state: DialogueSessionState, script: RaceMissionScript, planet: Planet): void {
    const race = planet.inhabitants ?? PlanetInhabitants.NONE;
    const meta = script.meta;
    if (meta.missionType === 'none') {
      return; // guiones teaser: no hay encargo que aceptar
    }
    const offered = this.missions.offerMission(planet, {
      race,
      type: meta.missionType,
      dialogueScriptId: this.scripts.getScriptId(race),
      targetHint: meta.targetHint,
      missionName: meta.artifactName,
      reward: {
        memorySharePct: meta.memoryShare,
        uniqueGlyphId: meta.uniqueGlyphId,
        experience: 100,
      },
      originPlanetId: planet.id,
      huntTarget: meta.huntTarget,
      exterminateTarget: meta.exterminateTarget,
      trophyLabel: meta.trophyLabel,
    });
    this.missions.acceptMission(offered.id);
    // El panel de aterrizaje lee la intel cacheada: sin esto, el bloque "Encargo" seguiría vacío
    // hasta cerrar y reabrir el panel.
    this.gameState.syncPlanetIntelFromPlanet?.(planet);
    state.log.push({ speaker: 'narrator', text: 'Aceptas el encargo.' });

    // Lo que la raza pone de su parte al cerrar el trato: sin la nave lista, el encargo es
    // imposible (los Grises rearman el casco; los Mi-Go injertan el maniobrador y los giroscopios).
    const outfitted = this.engineBridge.applyRaceUpgrade(race);
    if (outfitted) {
      state.log.push({
        speaker: 'narrator',
        text: meta.acceptOutfitText ??
          'Desmontan medio casco en silencio. Cuando terminan, la nave zumba distinto: más toberas, un cañón bajo el ala y un depósito de vacío que ya no reconoces.'
      });
    }
    // La herramienta del trabajo se enseña al aceptar, no al cobrar (los Mi-Go: Void Kinesis).
    const grantedGlyph = this.resolveGlyph(meta.grantGlyphOnAccept);
    if (grantedGlyph && !this.gameState.hasSpell(grantedGlyph)) {
      this.gameState.learnSpell(grantedGlyph);
      state.log.push({
        speaker: 'narrator',
        text: `Un glifo nuevo arde en tu grimorio: ${getSpellLabel(grantedGlyph)}.`
      });
    }
    if (meta.acceptTune) {
      const { label, ...tuning } = meta.acceptTune;
      this.engineBridge.tuneNextGateRiteWith(tuning, label);
      state.log.push({
        speaker: 'narrator',
        text: 'Sintonizan tu próximo Rito de la Puerta. La siguiente puerta que abras se inclinará hacia el destino pactado.'
      });
    } else if (meta.huntTarget?.elderGod) {
      this.engineBridge.tuneNextGateRite(meta.huntTarget.elderGod);
      state.log.push({
        speaker: 'narrator',
        text: 'Sintonizan tu próximo Rito de la Puerta. La siguiente puerta que abras se inclinará hacia su dominio.'
      });
    }
    if (meta.targetHint) {
      state.log.push({ speaker: 'race', text: meta.targetHint });
    }
    state.missionSummary = this.describeMission(this.findMission(planet));
    this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Mission accepted through dialogue', {
      missionId: offered.id,
      race,
      planetId: planet.id,
    });
  }

  /** Sintonía post-misión (la senda de Yig): disponible siempre que la raza ya confíe en ti. */
  private applyPostMissionTune(state: DialogueSessionState, script: RaceMissionScript): void {
    const tune = script.meta.postMissionTune;
    if (!tune) {
      return;
    }
    this.engineBridge.tuneNextGateRiteWith({ guaranteedInhabitants: tune.race }, tune.label);
    state.log.push({ speaker: 'race', text: tune.text });
  }

  /** Un nombre de glifo en el guion sólo vale si nombra un hechizo real. */
  private resolveGlyph(name: string | undefined): SpellType | null {
    if (!name) {
      return null;
    }
    const candidate = name.toUpperCase();
    const known = Object.values(SpellType).find(spell => String(spell).toUpperCase() === candidate);
    return (known as SpellType) ?? null;
  }

  private turnInMission(state: DialogueSessionState, script: RaceMissionScript, planet: Planet): void {
    const mission = this.findMission(planet);
    if (!mission || !this.isReadyToTurnIn(mission)) {
      return;
    }
    // La entrega puede rechazarse (p. ej. si el trofeo ya no está en la bodega): sólo se narra el
    // éxito cuando la misión queda realmente completada.
    const updated = this.missions.completeMission(mission.id);
    if (updated?.status !== 'completed') {
      state.log.push({
        speaker: 'narrator',
        text: 'Buscas lo que te pidieron y no lo llevas encima. La conversación se enfría.'
      });
      state.missionSummary = this.describeMission(updated ?? mission);
      return;
    }
    state.phase = 'closed';
    state.log.push({ speaker: 'race', text: script.turnIn.success });
    state.log.push({ speaker: 'narrator', text: script.turnIn.memoryFragment });
    state.missionSummary = null;
    this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Mission turned in through dialogue', {
      missionId: mission.id,
      planetId: planet.id,
    });
  }

  /** Reconstruye las opciones disponibles según la fase y el estado de la misión. */
  private refreshChoices(): void {
    const state = this.state;
    const script = this.script;
    const planet = this.planet;
    if (!state || !script || !planet) {
      return;
    }
    const choices: DialogueChoice[] = [];
    const mission = this.findMission(planet);

    if (state.phase !== 'closed') {
      for (const option of script.offer.options) {
        choices.push({
          id: option.id,
          // Marcar lo ya preguntado sin ocultarlo: releer una respuesta es legítimo.
          label: this.askedOptionIds.has(option.id) ? `${option.label} ·` : option.label,
          kind: 'ask',
        });
      }
      if (!mission) {
        // Un encargo cumplido no se vuelve a ofrecer: cada raza tiene el suyo, una vez.
        if (script.meta.missionType !== 'none' && !this.hasCompletedMissionFor(planet)) {
          choices.push({ id: 'accept', label: 'Aceptar el encargo', kind: 'accept' });
        }
      } else if (this.isReadyToTurnIn(mission)) {
        choices.push({ id: 'turn-in', label: 'Entregar lo prometido', kind: 'turn-in' });
      }
      // Con su confianza ganada, algunas razas abren caminos nuevos (los Mi-Go: la senda de Yig).
      if (script.meta.postMissionTune && this.hasCompletedMissionFor(planet)) {
        choices.push({ id: 'tune', label: script.meta.postMissionTune.label, kind: 'tune' });
      }
    }
    // Salir SIEMPRE está disponible: el jugador cierra cuando quiere.
    choices.push({ id: 'leave', label: 'Terminar conversación', kind: 'leave' });
    state.choices = choices;
  }

  /** ¿Ya se cumplió el encargo de esta raza? (la misión se retira al completarse). */
  private hasCompletedMissionFor(planet: Planet): boolean {
    const race = planet.inhabitants;
    if (!race || race === PlanetInhabitants.NONE) {
      return false;
    }
    return (this.gameState.getRaceStanding?.(race)?.missionsCompleted ?? 0) > 0;
  }

  /**
   * Encargo vivo de ESTE planeta.
   *
   * Los ids de planeta ya son únicos por sistema, pero se coteja además la raza: es la garantía de
   * que nunca se abra la entrega con el interlocutor equivocado, aunque un id se repita.
   */
  private findMission(planet: Planet): PlanetMissionState | null {
    const missions = this.gameState.getActiveMissionsSnapshot?.() ?? [];
    const race = planet.inhabitants ?? PlanetInhabitants.NONE;
    return (
      missions.find(
        m =>
          m.status !== 'completed' &&
          m.status !== 'failed' &&
          (m.requestedBy ?? m.race) === race &&
          (m.originPlanetId === planet.id || m.targetLocation?.planetId === planet.id)
      ) ?? null
    );
  }

  private isReadyToTurnIn(mission: PlanetMissionState): boolean {
    return mission.status === 'ready-to-turn-in';
  }

  private describeMission(mission: PlanetMissionState | null): string | null {
    if (!mission) {
      return null;
    }
    if (mission.status === 'ready-to-turn-in') {
      return 'Tienes lo que te pidieron. Entrégalo.';
    }
    return mission.objectiveSummary ?? mission.targetHint ?? 'Encargo en curso.';
  }

  private resolveRaceLabel(race: PlanetInhabitants | null | undefined): string {
    const definition = getRaceDefinition(race);
    if (definition) {
      return definition.label;
    }
    return race ? PLANET_INHABITANT_LABELS[race] ?? 'Civilización' : 'Civilización';
  }
}
