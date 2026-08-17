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

  it('buscar aplica SIEMPRE +5% de memoria (capado a 100), sin azar', () => {
    store.memoryPercent = 10;
    const r = service.search();
    expect(store.memoryPercent).toBe(15);
    expect(r.lines.some(l => /\+5% de memoria/.test(l.text))).toBe(true);
    // Con la memoria al máximo no se añade línea (ganancia real 0).
    store.memoryPercent = 100;
    const r2 = service.search();
    expect(store.memoryPercent).toBe(100);
    expect(r2.lines.some(l => /memoria/.test(l.text))).toBe(false);
  });

  it('la búsqueda es ÚNICA: tras usarla deja de estar disponible (el botón desaparece del panel)', () => {
    expect(service.isSearchAvailable()).toBe(true);
    service.search();
    expect(service.isSearchAvailable()).toBe(false);
    expect(store.stationSearchDone).toBe(true);
  });

  it('buscar ya NO resta vida ni cordura (sin sucesos aleatorios; solo el bono)', () => {
    const profile = TestBed.inject(CharacterProfileService);
    const vitals = spyOn(profile, 'adjustVitals');
    const r = service.search();
    expect(vitals).not.toHaveBeenCalled();
    expect(r.lines.some(l => l.tone === 'danger' || l.tone === 'warning')).toBe(false);
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

  it('el grimorio inicial REAL trae solo el Gate Rite (fin del god mode)', () => {
    expect(store.getKnownSpells()).toEqual([SpellType.GATE_RITE]);
  });

  it('la primera búsqueda descubre Void Jump (LONGJUMP); las siguientes no lo repiten', () => {
    expect(store.hasSpell(SpellType.LONGJUMP)).toBe(false); // ya no viene de serie
    const r = service.search();
    expect(store.hasSpell(SpellType.LONGJUMP)).toBe(true);
    expect(r.lines.some(l => /Void Jump/i.test(l.text))).toBe(true);
    const r2 = service.search();
    expect(r2.lines.some(l => /Void Jump/i.test(l.text))).toBe(false);
  });

  it('sin nada que ganar (glifo conocido y memoria a tope), buscar resuelve con línea neutra', () => {
    store.learnSpell(SpellType.LONGJUMP);
    store.memoryPercent = 100;
    const r = service.search();
    expect(r.title).toContain('Búsqueda');
    expect(r.lines.some(l => /No queda nada/i.test(l.text))).toBe(true);
  });
});
