import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LandingActionService } from './landing-action.service';
import { GameStateStore } from './game-state.store';
import { CharacterProfileService } from './character-profile.service';
import { LoggingService } from '../../services/logging.service';
import { MissionService } from '../../game/services/game/mission.service';
import { GameInitializer } from './game-initializer.service';
import { LandingActionKind, LandingDiplomacyAction } from '../../game/types/landing-action.types';
import { Planet } from '../../game/game-objects/Planet';
import { PlanetInhabitants } from '../../game/types/cosmic-life.types';
import { Vector3 } from '../../types/game.types';

class MockGameInitializer {
  getGameEngine() {
    return null;
  }
}

function createPlanet(id: string): Planet {
  return new Planet(id, 'verde', 100, { x: 0, y: 0, z: 0 } as Vector3);
}

describe('LandingActionService diplomacy flow', () => {
  let service: LandingActionService;
  let store: GameStateStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        LandingActionService,
        GameStateStore,
        CharacterProfileService,
        LoggingService,
        MissionService,
        { provide: GameInitializer, useClass: MockGameInitializer }
      ]
    });
    service = TestBed.inject(LandingActionService);
    store = TestBed.inject(GameStateStore);
    store.planets.length = 0;
  });

  function registerPlanet(): Planet {
    const planet = createPlanet(`planet-${Date.now()}`);
    planet.inhabitants = PlanetInhabitants.PROFUNDOS;
    planet.resourceStock = { metal: 3, organic: 3 };
    store.planets.push(planet);
    store.setActiveLandingPlanet(planet);
    return planet;
  }

  it('adds a clue token when executing a bribe', () => {
    const planet = registerPlanet();
    const result = service.performAction({
      planetId: planet.id,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.OFFER_BRIBE }
    });

    expect(result.success).toBeTrue();
    expect(result.effects.clueTokensAwarded?.[0].tier).toBe('minor');
    expect(planet.resourceStock.metal).toBe(2);
    expect(planet.resourceStock.organic).toBe(2);
    expect(planet.pendingMission).withContext('mission created during bribe').not.toBeNull();
  });

  it('registers the sub-mission and grants a clue on success', () => {
    const planet = registerPlanet();
    service.performAction({
      planetId: planet.id,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.OFFER_BRIBE }
    });
    spyOn(Math, 'random').and.returnValue(0.3);

    const result = service.performAction({
      planetId: planet.id,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.RUN_SUBTASK }
    });

    expect(result.success).toBeTrue();
    expect(result.effects.subTaskUpdate?.status).toBe('completed');
    expect(result.effects.clueTokensAwarded?.length).toBeGreaterThan(0);
  });

  it('blocks mission completion when clues are missing', () => {
    const planet = registerPlanet();
    service.performAction({
      planetId: planet.id,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.OFFER_BRIBE }
    });

    const result = service.performAction({
      planetId: planet.id,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.COMPLETE_MISSION }
    });

    expect(result.blocked).toBeTrue();
    expect(result.effects.blockedReason).toBe('mission-not-ready');
  });
});
