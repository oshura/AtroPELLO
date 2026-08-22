import { GameStateStore } from './game-state.store';
import { LoggingService } from '../logging.service';

/**
 * Progresión de experiencia.
 *
 * El caso que motiva estos tests: el piloto empieza en nivel 0 con la barra a 0/100 y abatir un ser
 * menor da exactamente 100 XP. La barra se llena, promociona y vuelve a 0 — de modo que, sin avisar
 * del ascenso, parece que la recompensa no se aplicó. `adjustExperience` devuelve `leveledUp`
 * precisamente para poder decirlo.
 */
describe('Progresión de experiencia', () => {
  let store: GameStateStore;

  beforeEach(() => {
    const logger = { log: () => undefined } as unknown as LoggingService;
    store = new GameStateStore(logger);
  });

  it('el piloto arranca en nivel 0 con la barra vacía', () => {
    expect(store.characterProfile.level).toBe(0);
    expect(store.characterProfile.experience).toBe(0);
    expect(store.characterProfile.experienceMax).toBe(100);
  });

  it('abatir un ser menor (100 XP) promociona y REINICIA la barra', () => {
    const result = store.adjustExperience(100, { reason: 'lesser-being' });

    expect(result.leveledUp).toBe(true);
    expect(result.levelBefore).toBe(0);
    expect(result.level).toBe(1);
    // La barra vuelve a cero: esto es lo que hace creer que no se ganó nada.
    expect(store.characterProfile.experience).toBe(0);
    expect(store.characterProfile.experienceMax).toBe(200);
  });

  it('una ganancia que no llena la barra no promociona', () => {
    const result = store.adjustExperience(40, { reason: 'test' });

    expect(result.leveledUp).toBe(false);
    expect(result.level).toBe(0);
    expect(store.characterProfile.experience).toBe(40);
  });

  it('una ganancia enorme encadena varias promociones', () => {
    const result = store.adjustExperience(1000, { reason: 'test' });

    expect(result.leveledUp).toBe(true);
    expect(result.level).toBeGreaterThan(1);
    expect(store.characterProfile.experience).toBeLessThan(store.characterProfile.experienceMax);
  });

  it('restar experiencia nunca baja de cero ni promociona', () => {
    store.adjustExperience(40, { reason: 'test' });
    const result = store.adjustExperience(-500, { reason: 'muerte' });

    expect(result.leveledUp).toBe(false);
    expect(store.characterProfile.experience).toBe(0);
  });

  it('un delta nulo no altera nada', () => {
    store.adjustExperience(40, { reason: 'test' });
    const result = store.adjustExperience(0, { reason: 'test' });

    expect(result.leveledUp).toBe(false);
    expect(store.characterProfile.experience).toBe(40);
  });
});
