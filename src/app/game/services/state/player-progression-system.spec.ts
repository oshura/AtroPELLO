import { PlayerProgressionSystem, ProgressionDeathHost } from './player-progression-system';
import { GameStateStore } from '../../../services/game/game-state.store';
import { CharacterProfileService } from '../../../services/game/character-profile.service';
import { LoggingService } from '../../../services/logging.service';
import { HardcoreDeathContext } from '../../types/progression.types';

/** Host falso que registra las muertes solicitadas. */
class DeathHostFake implements ProgressionDeathHost {
  public deaths: HardcoreDeathContext[] = [];
  handleHardcoreDeath(context: HardcoreDeathContext): void {
    this.deaths.push(context);
  }
}

/** GameStateStore mínimo: solo el characterProfile que la progresión lee. */
function fakeGameState(age = { years: 40, days: 0, totalDays: 40 * 365 }, survivability = 100): GameStateStore {
  return { characterProfile: { age, survivability } } as unknown as GameStateStore;
}

describe('PlayerProgressionSystem', () => {
  let logger: LoggingService;

  beforeEach(() => {
    logger = new LoggingService();
    spyOn(logger, 'log').and.stub();
  });

  it('no envejece por debajo de un día completo (60s)', () => {
    const addDaysToAge = jasmine.createSpy('addDaysToAge');
    const profile = { addDaysToAge, adjustSurvivability: jasmine.createSpy('adjustSurvivability') } as unknown as CharacterProfileService;
    const system = new PlayerProgressionSystem(fakeGameState(), profile, logger);

    system.tickAging(59, new DeathHostFake());
    expect(addDaysToAge).not.toHaveBeenCalled();
  });

  it('aplica días completos acumulados a la tasa 60s/día', () => {
    const addDaysToAge = jasmine.createSpy('addDaysToAge').and.returnValue({
      daysApplied: 2, yearsBefore: 40, yearsAfter: 40, yearsGained: 0, newAge: { years: 40, days: 2, totalDays: 40 * 365 + 2 }
    });
    const profile = { addDaysToAge, adjustSurvivability: jasmine.createSpy('adjustSurvivability') } as unknown as CharacterProfileService;
    const system = new PlayerProgressionSystem(fakeGameState(), profile, logger);

    system.tickAging(125, new DeathHostFake()); // 125s = 2 días + 5s de resto
    expect(addDaysToAge).toHaveBeenCalledWith(2);
  });

  it('decae la supervivencia por cada año tras el umbral y mata si falla la tirada', () => {
    const addDaysToAge = jasmine.createSpy('addDaysToAge').and.returnValue({
      daysApplied: 730, yearsBefore: 50, yearsAfter: 52, yearsGained: 2, newAge: { years: 52, days: 0, totalDays: 52 * 365 }
    });
    const adjustSurvivability = jasmine.createSpy('adjustSurvivability').and.returnValue(40);
    const profile = { addDaysToAge, adjustSurvivability } as unknown as CharacterProfileService;
    const host = new DeathHostFake();
    const system = new PlayerProgressionSystem(fakeGameState({ years: 50, days: 0, totalDays: 50 * 365 }, 40), profile, logger);

    spyOn(Math, 'random').and.returnValue(0.99); // roll = 99 > survivability 40 ⇒ muere

    const outcome = system.applyExternalAgeDelta(730, 'landing', host);

    expect(outcome.deathTriggered).toBeTrue();
    expect(outcome.rollsExecuted).toBe(1); // muere en la primera tirada (año 51) y se detiene
    expect(host.deaths.length).toBe(1);
    expect(host.deaths[0].source).toBe('aging');
  });

  it('sobrevive cuando la tirada es favorable (sin muerte)', () => {
    const addDaysToAge = jasmine.createSpy('addDaysToAge').and.returnValue({
      daysApplied: 365, yearsBefore: 50, yearsAfter: 51, yearsGained: 1, newAge: { years: 51, days: 0, totalDays: 51 * 365 }
    });
    const adjustSurvivability = jasmine.createSpy('adjustSurvivability').and.returnValue(80);
    const profile = { addDaysToAge, adjustSurvivability } as unknown as CharacterProfileService;
    const host = new DeathHostFake();
    const system = new PlayerProgressionSystem(fakeGameState({ years: 50, days: 0, totalDays: 50 * 365 }, 80), profile, logger);

    spyOn(Math, 'random').and.returnValue(0.10); // roll = 10 <= 80 ⇒ sobrevive

    const outcome = system.applyExternalAgeDelta(365, 'landing', host);

    expect(outcome.deathTriggered).toBeFalse();
    expect(host.deaths.length).toBe(0);
  });
});
