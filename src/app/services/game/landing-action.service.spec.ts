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
import { Spaceship } from '../../game/game-objects/Spaceship';
import { CargoItemType, RarityTier } from '../../game/types/inventory.types';

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
    store.setCargoManifest([]);
    store.spaceship = null;
    store.characterProfile.health = 100;
  });

  function registerPlanet(): Planet {
    const planet = createPlanet(`planet-${Date.now()}`);
    planet.inhabitants = PlanetInhabitants.PROFUNDOS;
    planet.resourceStock = { metal: 3, organic: 3 };
    store.planets.push(planet);
    store.setActiveLandingPlanet(planet);
    return planet;
  }

  function seedCargo(kind: 'metallic' | 'carbonaceous', units = 1): void {
    store.setCargoManifest([
      {
        id: `cargo-${kind}`,
        type: CargoItemType.RAW_MATERIAL,
        label: kind === 'metallic' ? 'Lingotes' : 'Resinas',
        massTons: 10,
        units,
        rarity: RarityTier.COMMON,
        composition: kind
      }
    ]);
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

  it('repairs the ship by spending metallic cargo', () => {
    const planet = registerPlanet();
    store.spaceship = new Spaceship();
    store.spaceship.healthCurrent = store.spaceship.healthMax / 2;
    seedCargo('metallic', 2);

    const result = service.performAction({
      planetId: planet.id,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.REPAIR_SHIP }
    });

    expect(result.success).toBeTrue();
    expect(result.effects.shipHealthDelta).toBeGreaterThan(0);
    expect(result.effects.cargoSpent?.[0].kind).toBe('metallic');
    expect(store.getRawMaterialUnits('metallic')).toBe(1);
  });

  it('heals the pilot when trading carbon cargo', () => {
    const planet = registerPlanet();
    store.characterProfile.health = 70;
    seedCargo('carbonaceous', 1);

    const result = service.performAction({
      planetId: planet.id,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.HEAL_CREW }
    });

    expect(result.success).toBeTrue();
    expect(result.effects.healthDelta).toBe(10);
    expect(store.characterProfile.health).toBe(80);
    expect(store.getRawMaterialUnits('carbonaceous')).toBe(0);
  });

  it('blocks neutral repair if there is no metallic cargo', () => {
    const planet = registerPlanet();
    store.spaceship = new Spaceship();
    store.spaceship.healthCurrent = store.spaceship.healthMax - 50;

    const result = service.performAction({
      planetId: planet.id,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.REPAIR_SHIP }
    });

    expect(result.blocked).toBeTrue();
    expect(result.effects.blockedReason).toBe('missing-metal-resource');
  });

  /**
   * El caso que apagaba el botón de entrega (2026-08-22): la caza se completa en OTRO sistema, así
   * que la foto de misión pegada al planeta persistido vuelve ANTIGUA (accepted, sin trofeo)
   * mientras el almacén vivo ya está en ready-to-turn-in. La diplomacia debe resolver la misión
   * VIVA por id, no fiarse de la foto.
   */
  it('entrega la misión aunque la foto del planeta esté anticuada (progreso hecho en otro sistema)', () => {
    const planet = registerPlanet();
    const missions = TestBed.inject(MissionService);
    const offered = missions.offerMission(planet, {
      race: PlanetInhabitants.PROFUNDOS,
      type: 'hunt',
      originPlanetId: planet.id,
      huntTarget: { lesserBeing: 'VAMPIRO_FUEGO', elderGod: 'YOG_SOTHOTH' },
      trophyLabel: 'Rescoldo de Vampiro de Fuego',
    });
    missions.acceptMission(offered.id);
    // Foto ANTIGUA en el planeta: el estado con el que se persistió el sistema al despegar.
    const staleSnapshot = { ...missions.getMissionSnapshot(offered.id)! };

    // La caza ocurre lejos: el almacén progresa, la foto del planeta no.
    missions.registerHuntKill('VAMPIRO_FUEGO', 'YOG_SOTHOTH');
    planet.setPendingMission(staleSnapshot);
    expect(planet.pendingMission?.status).toBe('accepted');
    expect(missions.getMissionSnapshot(offered.id)?.status).toBe('ready-to-turn-in');

    const result = service.performAction({
      planetId: planet.id,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.COMPLETE_MISSION }
    });

    expect(result.blocked).withContext(String(result.effects.blockedReason)).toBeFalsy();
    expect(result.success).toBeTrue();
    expect(result.effects.missionStatus).toBe('completed');
  });

  it('una foto de misión fantasma (ya entregada) se limpia en lugar de resucitar', () => {
    const planet = registerPlanet();
    const missions = TestBed.inject(MissionService);
    const offered = missions.offerMission(planet, {
      race: PlanetInhabitants.PROFUNDOS,
      type: 'material',
      originPlanetId: planet.id,
    });
    const ghost = { ...offered };
    // La misión desaparece del almacén (se completó/caducó en otra parte)…
    missions.failMission(offered.id, 'test');
    // …pero el planeta persistido aún carga su foto.
    planet.setPendingMission(ghost);

    service.performAction({
      planetId: planet.id,
      action: LandingActionKind.DIPLOMACY,
      diplomacy: { action: LandingDiplomacyAction.REVIEW_MISSION }
    });

    // La foto fantasma no sobrevive: o se limpió o quedó sustituida por un encargo VIVO del almacén.
    const pendingId = planet.pendingMission?.id;
    if (pendingId) {
      expect(missions.getMissionSnapshot(pendingId)).withContext('pendingMission debe existir en el almacén').not.toBeNull();
      expect(pendingId).not.toBe(ghost.id);
    }
  });
});
