import { DisembarkService } from './disembark.service';
import { PlanetType } from '../../game/game-objects/Planet';

describe('DisembarkService', () => {
  let svc: DisembarkService;
  let logger: { info: jasmine.Spy; warn: jasmine.Spy };

  beforeEach(() => {
    logger = { info: jasmine.createSpy('info'), warn: jasmine.createSpy('warn') };
    svc = new DisembarkService(logger as any);
  });

  it('mapea la estación → estacion-humana', () => {
    expect(svc.landingContextToEntryCode({ kind: 'station' })).toBe('estacion-humana');
  });

  it('mapea la Tierra → planeta-tierra', () => {
    expect(svc.landingContextToEntryCode({ kind: 'planet', planetType: PlanetType.Tierra })).toBe('planeta-tierra');
  });

  it('mapea planetas rocosos (y sin tipo) → planeta-rocoso', () => {
    expect(svc.landingContextToEntryCode({ kind: 'planet', planetType: PlanetType.Planetoid })).toBe('planeta-rocoso');
    expect(svc.landingContextToEntryCode({ kind: 'planet', planetType: PlanetType.Dwarf })).toBe('planeta-rocoso');
    expect(svc.landingContextToEntryCode({ kind: 'planet' })).toBe('planeta-rocoso');
  });

  it('el Sol no es aterrizable → null (botón oculto)', () => {
    expect(svc.landingContextToEntryCode({ kind: 'planet', planetType: PlanetType.Sun })).toBeNull();
    expect(svc.canDisembark({ kind: 'planet', planetType: PlanetType.Sun })).toBe(false);
  });

  it('canDisembark refleja el mapeo', () => {
    expect(svc.canDisembark({ kind: 'station' })).toBe(true);
    expect(svc.canDisembark({ kind: 'planet', planetType: PlanetType.Planetoid })).toBe(true);
  });

  it('disembark abre window.open con entry + return y loguea', () => {
    const openSpy = spyOn(window, 'open').and.returnValue(null);
    expect(svc.disembark({ kind: 'station' })).toBe(true);
    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = openSpy.calls.mostRecent().args[0] as string;
    expect(url).toContain('oldone.html?entry=estacion-humana');
    expect(url).toContain('return=');
    expect(logger.info).toHaveBeenCalled();
  });

  it('disembark en un sitio sin mapeo no abre nada', () => {
    const openSpy = spyOn(window, 'open');
    expect(svc.disembark({ kind: 'planet', planetType: PlanetType.Sun })).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });
});
