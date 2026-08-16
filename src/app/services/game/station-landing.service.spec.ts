import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StationLandingService } from './station-landing.service';
import { GameStateStore } from './game-state.store';
import { CharacterProfileService } from './character-profile.service';
import { LoggingService } from '../../services/logging.service';
import { GameInitializer } from './game-initializer.service';
import { SpellType } from '../../game/types/spell.types';
import { Spaceship } from '../../game/game-objects/Spaceship';

class MockGameInitializer {
  getGameEngine() { return null; }
}

describe('StationLandingService', () => {
  let service: StationLandingService;
  let store: GameStateStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        StationLandingService,
        GameStateStore,
        CharacterProfileService,
        LoggingService,
        { provide: GameInitializer, useClass: MockGameInitializer },
      ],
    });
    service = TestBed.inject(StationLandingService);
    store = TestBed.inject(GameStateStore);
  });

  it('descansar recupera vitales pero YA NO toca la memoria (se gana buscando)', () => {
    store.memoryPercent = 10;
    const r = service.rest();
    expect(store.memoryPercent).toBe(10);
    expect(r.lines.some(l => l.tone === 'success')).toBe(true);
    expect(r.lines.some(l => /memoria/i.test(l.text))).toBe(false);
  });

  it('buscar aplica +5% de memoria como parte del desenlace (capado a 100)', () => {
    store.memoryPercent = 10;
    spyOn(Math, 'random').and.returnValue(0.9); // fallo de búsqueda: la memoria se gana igualmente
    const r = service.search();
    expect(store.memoryPercent).toBe(15);
    expect(r.lines.some(l => /\+5% de memoria/.test(l.text))).toBe(true);
    // Con la memoria al máximo no se añade línea (ganancia real 0).
    store.memoryPercent = 100;
    const r2 = service.search();
    expect(store.memoryPercent).toBe(100);
    expect(r2.lines.some(l => /memoria/.test(l.text))).toBe(false);
  });

  it('recuperar vacío llena el depósito de la nave', () => {
    store.spaceship = { voidEnergyCurrent: 5, voidEnergyMax: 100 } as unknown as Spaceship;
    const r = service.refuelVoid();
    expect(store.spaceship!.voidEnergyCurrent).toBe(100);
    expect(r.title).toContain('vacío');
  });

  it('recuperar vacío sin nave no crashea', () => {
    store.spaceship = null;
    const r = service.refuelVoid();
    expect(r.lines[0].tone).toBe('warning');
  });

  it('buscar con éxito descubre Void Jump (LONGJUMP) si falta', () => {
    store.forgetSpell(SpellType.LONGJUMP);
    expect(store.hasSpell(SpellType.LONGJUMP)).toBe(false);
    spyOn(Math, 'random').and.returnValue(0.1); // <= 0.5 ⇒ éxito de búsqueda
    const r = service.search();
    expect(store.hasSpell(SpellType.LONGJUMP)).toBe(true);
    expect(r.lines.some(l => /Void Jump/i.test(l.text))).toBe(true);
  });

  it('buscar fallido (roll > 0.5) resuelve sin crashear', () => {
    spyOn(Math, 'random').and.returnValue(0.9);
    const r = service.search();
    expect(r.title).toContain('Búsqueda');
    expect(r.lines.length).toBeGreaterThan(0);
  });
});
