import { DisembarkService } from './disembark.service';
import { PlanetType } from '../../game/game-objects/Planet';

describe('DisembarkService (placeholder: sin salto a juegos externos)', () => {
  let svc: DisembarkService;
  let logger: { info: jasmine.Spy; warn: jasmine.Spy };

  beforeEach(() => {
    logger = { info: jasmine.createSpy('info'), warn: jasmine.createSpy('warn') };
    svc = new DisembarkService(logger as any);
  });

  it('el botón se muestra en estación y planetas (también sin tipo)', () => {
    expect(svc.canDisembark({ kind: 'station' })).toBe(true);
    expect(svc.canDisembark({ kind: 'planet', planetType: PlanetType.Tierra })).toBe(true);
    expect(svc.canDisembark({ kind: 'planet', planetType: PlanetType.Planetoid })).toBe(true);
    expect(svc.canDisembark({ kind: 'planet' })).toBe(true);
  });

  it('el Sol no es aterrizable (botón oculto)', () => {
    expect(svc.canDisembark({ kind: 'planet', planetType: PlanetType.Sun })).toBe(false);
    expect(svc.disembark({ kind: 'planet', planetType: PlanetType.Sun })).toBe(false);
  });

  it('disembark NO abre ningún otro juego ni pestaña (el salto al 2D se retiró)', () => {
    const openSpy = spyOn(window, 'open');
    expect(svc.disembark({ kind: 'station' })).toBe(true);
    expect(svc.disembark({ kind: 'planet', planetType: PlanetType.Tierra })).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });
});
