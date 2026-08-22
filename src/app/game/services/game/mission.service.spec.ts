import { MissionService } from './mission.service';
import { GameStateStore } from '../../../services/game/game-state.store';
import { LoggingService } from '../../../services/logging.service';
import { Planet } from '../../game-objects/Planet';
import { PlanetInhabitants } from '../../types/cosmic-life.types';
import { PlanetMissionState } from '../../types/planet-intel.types';
import { CargoManifestEntry } from '../../types/inventory.types';
import { SpellType } from '../../types/spell.types';

/**
 * Reglas de las misiones de caza (Fase 13).
 *
 * El caso que cubren estos tests es el que casi llega a producción: sin pistas requeridas, la
 * transición automática marcaba la misión como "lista para entregar" en el mismo instante de
 * aceptarla, de modo que se podía cobrar la recompensa entera —incluido el glifo— sin cazar nada,
 * y el trofeo nunca llegaba a generarse.
 */
describe('MissionService · misiones de caza', () => {
  let service: MissionService;
  let store: GameStateStore;
  let missions: Map<string, PlanetMissionState>;
  let cargo: CargoManifestEntry[];
  let learnedSpells: SpellType[];

  function makePlanet(): Planet {
    return {
      id: 'planet-greys',
      inhabitants: PlanetInhabitants.GRISES,
      customName: 'Refugio',
      setPendingMission: () => undefined,
      setAnimosity: () => undefined,
    } as unknown as Planet;
  }

  function offerHunt(): PlanetMissionState {
    return service.offerMission(makePlanet(), {
      race: PlanetInhabitants.GRISES,
      type: 'hunt',
      originPlanetId: 'planet-greys',
      huntTarget: { lesserBeing: 'VAMPIRO_FUEGO', elderGod: 'YOG_SOTHOTH' },
      trophyLabel: 'Rescoldo de Vampiro de Fuego',
      reward: { memorySharePct: 5, uniqueGlyphId: 'SPEED' },
    });
  }

  beforeEach(() => {
    missions = new Map<string, PlanetMissionState>();
    cargo = [];
    learnedSpells = [];
    store = {
      cargoManifest: cargo,
      characterProfile: { memory: 0, experience: 0, experienceMax: 1000 },
      memoryPercent: 0,
      upsertPlanetMission: (m: PlanetMissionState) => {
        missions.set(m.id, m);
        return m;
      },
      getPlanetMissionSnapshot: (id: string) => missions.get(id) ?? null,
      getActiveMissionsSnapshot: () => Array.from(missions.values()),
      removePlanetMission: (id: string) => missions.delete(id),
      upsertCargoEntry: (entry: CargoManifestEntry) => cargo.push(entry),
      removeCargoEntry: (id: string) => {
        const i = cargo.findIndex(e => e.id === id);
        if (i >= 0) cargo.splice(i, 1);
      },
      findPlanetById: () => null,
      syncPlanetIntelFromPlanet: () => undefined,
      updateCharacterVitals: () => undefined,
      setRaceStanding: () => undefined,
      hasSpell: (s: SpellType) => learnedSpells.includes(s),
      learnSpell: (s: SpellType) => learnedSpells.push(s),
      planets: [],
    } as unknown as GameStateStore;
    const logger = { log: () => undefined } as unknown as LoggingService;
    service = new MissionService(store, logger);
  });

  it('una cacería recién aceptada NO está lista para entregar', () => {
    const mission = offerHunt();
    const accepted = service.acceptMission(mission.id)!;

    expect(accepted.status).toBe('accepted');
    expect(accepted.requiredCargoEntryId).toBeUndefined();
  });

  it('no se puede completar una cacería sin el trofeo', () => {
    const mission = offerHunt();
    service.acceptMission(mission.id);

    const result = service.completeMission(mission.id);

    expect(result?.status).not.toBe('completed');
    expect(learnedSpells).toEqual([]);
  });

  it('abatir la criatura correcta genera el trofeo y deja la misión lista', () => {
    const mission = offerHunt();
    service.acceptMission(mission.id);

    const updated = service.registerHuntKill('VAMPIRO_FUEGO', 'YOG_SOTHOTH');

    expect(updated?.status).toBe('ready-to-turn-in');
    expect(updated?.requiredCargoEntryId).toBeTruthy();
    expect(cargo.length).toBe(1);
    expect(cargo[0].label).toBe('Rescoldo de Vampiro de Fuego');
  });

  it('no cuenta la criatura correcta bajo el dominio equivocado', () => {
    const mission = offerHunt();
    service.acceptMission(mission.id);

    expect(service.registerHuntKill('VAMPIRO_FUEGO', 'CTHULHU')).toBeNull();
    expect(cargo.length).toBe(0);
  });

  it('no cuenta otra criatura del dominio correcto', () => {
    const mission = offerHunt();
    service.acceptMission(mission.id);

    expect(service.registerHuntKill('SHOGGOTH', 'YOG_SOTHOTH')).toBeNull();
    expect(cargo.length).toBe(0);
  });

  it('matar antes de aceptar el encargo no deja prueba', () => {
    offerHunt(); // ofrecida pero NO aceptada

    expect(service.registerHuntKill('VAMPIRO_FUEGO', 'YOG_SOTHOTH')).toBeNull();
    expect(cargo.length).toBe(0);
  });

  it('con el trofeo, completar entrega la recompensa y enseña el glifo prometido', () => {
    const mission = offerHunt();
    service.acceptMission(mission.id);
    service.registerHuntKill('VAMPIRO_FUEGO', 'YOG_SOTHOTH');

    const completed = service.completeMission(mission.id);

    expect(completed?.status).toBe('completed');
    expect(learnedSpells).toEqual([SpellType.SPEED]);
    expect(store.memoryPercent).toBe(5);
  });

  it('un segundo trofeo no se genera si la cacería ya tiene el suyo', () => {
    const mission = offerHunt();
    service.acceptMission(mission.id);
    service.registerHuntKill('VAMPIRO_FUEGO', 'YOG_SOTHOTH');

    expect(service.registerHuntKill('VAMPIRO_FUEGO', 'YOG_SOTHOTH')).toBeNull();
    expect(cargo.length).toBe(1);
  });

  /**
   * Exterminio (Fase 15): la misión de los Mi-Go contra los tejedores. La cuota (3 mundos + 2
   * telares) sólo avanza por eventos reales de destrucción; el mismo peligro que hunt — sin el
   * guard, aceptar la habría dejado lista al instante.
   */
  describe('misiones de exterminio', () => {
    function offerExtermination(): PlanetMissionState {
      return service.offerMission(makePlanet(), {
        race: PlanetInhabitants.MI_GO,
        type: 'exterminate',
        originPlanetId: 'planet-greys',
        exterminateTarget: { race: 'ARACNIDOS', planets: 3, stations: 2 },
        reward: { memorySharePct: 5, uniqueGlyphId: 'VOID_COCOON' },
      });
    }

    it('un exterminio recién aceptado NO está listo para entregar', () => {
      const mission = offerExtermination();
      const accepted = service.acceptMission(mission.id)!;
      expect(accepted.status).toBe('accepted');
    });

    it('cada planeta y estación destruidos avanzan su contador', () => {
      const mission = offerExtermination();
      service.acceptMission(mission.id);

      service.registerExterminationEvent('ARACNIDOS', 'planet');
      const after = service.registerExterminationEvent('ARACNIDOS', 'station');

      expect(after?.exterminationTarget?.planetsDestroyed).toBe(1);
      expect(after?.exterminationTarget?.stationsDestroyed).toBe(1);
      expect(after?.status).toBe('in-progress');
    });

    it('destruir cosas de OTRA raza no cuenta', () => {
      const mission = offerExtermination();
      service.acceptMission(mission.id);

      expect(service.registerExterminationEvent('MI_GO', 'planet')).toBeNull();
      expect(service.getMissionSnapshot(mission.id)?.exterminationTarget?.planetsDestroyed).toBe(0);
    });

    it('con la cuota completa (3 mundos + 2 telares) queda lista para entregar', () => {
      const mission = offerExtermination();
      service.acceptMission(mission.id);

      for (let i = 0; i < 3; i++) service.registerExterminationEvent('ARACNIDOS', 'planet');
      service.registerExterminationEvent('ARACNIDOS', 'station');
      const done = service.registerExterminationEvent('ARACNIDOS', 'station');

      expect(done?.status).toBe('ready-to-turn-in');
    });

    it('el excedente sobre la cuota no cuenta para nadie', () => {
      const mission = offerExtermination();
      service.acceptMission(mission.id);
      for (let i = 0; i < 3; i++) service.registerExterminationEvent('ARACNIDOS', 'planet');

      expect(service.registerExterminationEvent('ARACNIDOS', 'planet')).toBeNull();
      expect(service.getMissionSnapshot(mission.id)?.exterminationTarget?.planetsDestroyed).toBe(3);
    });

    it('no se puede completar sin cumplir la cuota', () => {
      const mission = offerExtermination();
      service.acceptMission(mission.id);
      service.registerExterminationEvent('ARACNIDOS', 'planet');

      const result = service.completeMission(mission.id);
      expect(result?.status).not.toBe('completed');
      expect(learnedSpells).toEqual([]);
    });

    it('cumplida la cuota, completar entrega memoria y glifo', () => {
      const mission = offerExtermination();
      service.acceptMission(mission.id);
      for (let i = 0; i < 3; i++) service.registerExterminationEvent('ARACNIDOS', 'planet');
      for (let i = 0; i < 2; i++) service.registerExterminationEvent('ARACNIDOS', 'station');

      const completed = service.completeMission(mission.id);

      expect(completed?.status).toBe('completed');
      expect(learnedSpells).toEqual([SpellType.VOID_COCOON]);
      expect(store.memoryPercent).toBe(5);
    });

    it('los eventos antes de aceptar no avanzan nada', () => {
      offerExtermination(); // ofrecida pero NO aceptada
      expect(service.registerExterminationEvent('ARACNIDOS', 'planet')).toBeNull();
    });
  });
});
