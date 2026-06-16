import { GameStateStore } from '../../../services/game/game-state.store';
import { CharacterProfileService } from '../../../services/game/character-profile.service';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';
import { AgeProgressionOutcome, AgeProgressionSource, HardcoreDeathContext } from '../../types/progression.types';

/**
 * El host (GameEngine) ejecuta los efectos colaterales de una muerte hardcore
 * (poner salud a 0, cerrar paneles, marquee). La progresión solo decide cuándo ocurre.
 */
export interface ProgressionDeathHost {
  handleHardcoreDeath(context: HardcoreDeathContext): void;
}

/**
 * Sistema de progresión del piloto extraído de GameEngine (docs/ARQUITECTURA.md Fase 5.6).
 * Envejecimiento por tiempo de juego y tiradas de supervivencia hardcore. Clase plana que el
 * engine instancia (sin DI) y a la que pasa `this` como host para los efectos de muerte.
 *
 * Lógica movida verbatim desde GameEngine (comportamiento preservado).
 */
export class PlayerProgressionSystem {
  private readonly AGE_SECONDS_PER_DAY = 60; // 1 minuto de juego = 1 día
  private readonly SURVIVABILITY_DECAY_START_YEAR = 50;
  private ageTimerAccumulatorSec = 0;

  constructor(
    private readonly gameState: GameStateStore,
    private readonly characterProfile: CharacterProfileService,
    private readonly logger: LoggingService
  ) {}

  /** Avanza el reloj de edad con el delta del frame; aplica días completos acumulados. */
  public tickAging(deltaTime: number, host: ProgressionDeathHost): void {
    if (deltaTime <= 0) {
      return;
    }

    this.ageTimerAccumulatorSec += deltaTime;
    if (this.ageTimerAccumulatorSec < this.AGE_SECONDS_PER_DAY) {
      return;
    }

    const daysToApply = Math.floor(this.ageTimerAccumulatorSec / this.AGE_SECONDS_PER_DAY);
    this.ageTimerAccumulatorSec -= daysToApply * this.AGE_SECONDS_PER_DAY;
    if (daysToApply <= 0) {
      return;
    }

    this.applyAgeProgression(daysToApply, 'loop', host);
  }

  public applyExternalAgeDelta(days: number, source: AgeProgressionSource, host: ProgressionDeathHost): AgeProgressionOutcome {
    return this.applyAgeProgression(days, source, host);
  }

  private applyAgeProgression(days: number, source: AgeProgressionSource, host: ProgressionDeathHost): AgeProgressionOutcome {
    const normalizedDays = Math.trunc(days);
    if (!normalizedDays) {
      return {
        daysApplied: 0,
        yearsBefore: this.gameState.characterProfile.age.years,
        yearsAfter: this.gameState.characterProfile.age.years,
        yearsGained: 0,
        newAge: { ...this.gameState.characterProfile.age },
        source,
        deathTriggered: false,
        rollsExecuted: 0
      };
    }

    const ageResult = this.characterProfile.addDaysToAge(normalizedDays);
    if (!ageResult.daysApplied) {
      return { ...ageResult, source, deathTriggered: false, rollsExecuted: 0 };
    }

    this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Age advanced', {
      source,
      daysApplied: ageResult.daysApplied,
      yearsBefore: ageResult.yearsBefore,
      yearsAfter: ageResult.yearsAfter,
      yearsGained: ageResult.yearsGained
    });

    if (ageResult.yearsGained <= 0) {
      return { ...ageResult, source, deathTriggered: false, rollsExecuted: 0 };
    }

    let deathTriggered = false;
    let rollsExecuted = 0;

    for (let year = ageResult.yearsBefore + 1; year <= ageResult.yearsAfter; year++) {
      if (year > this.SURVIVABILITY_DECAY_START_YEAR) {
        rollsExecuted++;
        const before = this.gameState.characterProfile.survivability;
        const after = this.characterProfile.adjustSurvivability(-1);
        this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Survivability decayed due to aging', {
          source,
          year,
          survivabilityBefore: before,
          survivabilityAfter: after
        });
        const rollOutcome = this.performSurvivabilityDeathRoll('aging', after, year, host);
        if (rollOutcome.didDie) {
          deathTriggered = true;
          break;
        }
      }
    }

    return { ...ageResult, source, deathTriggered, rollsExecuted };
  }

  private performSurvivabilityDeathRoll(
    source: 'aging',
    survivability: number,
    ageYears: number,
    host: ProgressionDeathHost
  ): { didDie: boolean; roll: number } {
    const roll = Math.random() * 100;
    const survived = roll <= survivability;
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Hardcore survivability roll executed', {
      source,
      roll: Number(roll.toFixed(2)),
      survivability,
      ageYears,
      survived
    });
    if (survived) {
      return { didDie: false, roll };
    }
    host.handleHardcoreDeath({ source, roll, survivability, ageYears });
    return { didDie: true, roll };
  }
}
