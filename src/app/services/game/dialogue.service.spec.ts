import { DialogueService } from './dialogue.service';
import { DialogueScriptService } from './dialogue-script.service';
import { GameStateStore } from './game-state.store';
import { RaceOutfittingBridgeService } from './race-outfitting-bridge.service';
import { MissionService } from '../../game/services/game/mission.service';
import { Planet } from '../../game/game-objects/Planet';
import { PlanetInhabitants } from '../../game/types/cosmic-life.types';
import { PlanetMissionState } from '../../game/types/planet-intel.types';

/**
 * Conversación con una raza. Lo que importa: que preguntar NO cierre la charla, que el encargo
 * nazca sólo al aceptarlo, que salir esté siempre disponible y que la entrega complete la misión.
 */
describe('DialogueService', () => {
  let dialogue: DialogueService;
  let missions: jasmine.SpyObj<MissionService>;
  let bridge: jasmine.SpyObj<RaceOutfittingBridgeService>;
  let activeMissions: PlanetMissionState[];
  let raceStanding: { standing: string; missionsCompleted: number };
  let learnedGlyphs: string[];

  function makePlanet(race = PlanetInhabitants.GRISES): Planet {
    return { id: 'planet-greys', inhabitants: race } as unknown as Planet;
  }

  function offeredMission(overrides: Partial<PlanetMissionState> = {}): PlanetMissionState {
    return {
      id: 'mission-1',
      race: PlanetInhabitants.GRISES,
      type: 'hunt',
      targetLocation: { systemId: 'current-system' },
      itemId: 'trophy',
      status: 'accepted',
      log: [],
      clueTokens: [],
      originPlanetId: 'planet-greys',
      ...overrides,
    } as PlanetMissionState;
  }

  beforeEach(() => {
    activeMissions = [];
    learnedGlyphs = [];
    raceStanding = { standing: 'neutral', missionsCompleted: 0 };
    missions = jasmine.createSpyObj<MissionService>('MissionService', [
      'offerMission',
      'acceptMission',
      'completeMission',
    ]);
    missions.offerMission.and.callFake(() => offeredMission({ status: 'offered' }));
    missions.acceptMission.and.callFake(() => offeredMission());
    missions.completeMission.and.callFake(() => offeredMission({ status: 'completed' }));
    bridge = jasmine.createSpyObj<RaceOutfittingBridgeService>('RaceOutfittingBridgeService', [
      'applyRaceUpgrade',
      'tuneNextGateRite',
      'tuneNextGateRiteWith',
    ]);
    bridge.applyRaceUpgrade.and.returnValue(true);

    // El proyecto corre zoneless: nada de TestBed, se instancia a mano como el resto de servicios.
    const store = {
      memoryPercent: 20,
      getActiveMissionsSnapshot: () => activeMissions,
      getRaceStanding: () => raceStanding,
      hasSpell: () => false,
      learnSpell: (spell: unknown) => { learnedGlyphs.push(String(spell)); },
    } as unknown as GameStateStore;
    const logger = { log: () => undefined } as unknown as ConstructorParameters<typeof DialogueService>[4];
    dialogue = new DialogueService(new DialogueScriptService(), missions, store, bridge, logger);
  });

  it('abre con la escena de la raza y sus preguntas', () => {
    const state = dialogue.start(makePlanet());

    expect(state).toBeTruthy();
    expect(state!.raceLabel).toBe('Los Grises');
    expect(state!.log.length).toBe(1);
    expect(state!.choices.some(c => c.kind === 'accept')).toBe(true);
    expect(state!.choices.some(c => c.kind === 'leave')).toBe(true);
  });

  it('no hay conversación para una raza sin guion', () => {
    expect(dialogue.canTalk(makePlanet(PlanetInhabitants.NONE))).toBe(false);
    expect(dialogue.start(makePlanet(PlanetInhabitants.NONE))).toBeNull();
  });

  it('preguntar añade la respuesta y NO cierra la conversación', () => {
    const state = dialogue.start(makePlanet())!;
    const question = state.choices.find(c => c.kind === 'ask')!;

    const after = dialogue.choose(question.id)!;

    expect(after.log.length).toBeGreaterThan(1);
    expect(after.phase).toBe('offer');
    expect(after.choices.some(c => c.kind === 'leave')).toBe(true);
    // Se puede volver a preguntar lo mismo: la opción sigue ahí.
    expect(after.choices.some(c => c.kind === 'ask')).toBe(true);
  });

  it('el encargo NO existe hasta que se acepta en la conversación', () => {
    dialogue.start(makePlanet());
    expect(missions.offerMission).not.toHaveBeenCalled();

    dialogue.choose('accept');

    expect(missions.offerMission).toHaveBeenCalledTimes(1);
    expect(missions.acceptMission).toHaveBeenCalledTimes(1);
  });

  it('al aceptar, la raza reacondiciona la nave y sintoniza el rito', () => {
    dialogue.start(makePlanet());
    dialogue.choose('accept');

    expect(bridge.applyRaceUpgrade).toHaveBeenCalledWith(PlanetInhabitants.GRISES);
    expect(bridge.tuneNextGateRite).toHaveBeenCalledWith('YOG_SOTHOTH');
  });

  it('la recompensa del encargo incluye memoria y el glifo prometido', () => {
    dialogue.start(makePlanet());
    dialogue.choose('accept');

    const options = missions.offerMission.calls.mostRecent().args[1]!;
    expect(options.reward?.memorySharePct).toBe(5);
    expect(options.reward?.uniqueGlyphId).toBe('SPEED');
    expect(options.huntTarget?.lesserBeing).toBe('VAMPIRO_FUEGO');
    expect(options.originPlanetId).toBe('planet-greys');
  });

  it('con la prueba en la bodega, la entrega completa la misión', () => {
    activeMissions = [offeredMission({ status: 'ready-to-turn-in' })];
    const state = dialogue.start(makePlanet())!;

    expect(state.phase).toBe('turn-in');
    const turnIn = state.choices.find(c => c.kind === 'turn-in');
    expect(turnIn).toBeTruthy();

    const after = dialogue.choose(turnIn!.id)!;
    expect(missions.completeMission).toHaveBeenCalledWith('mission-1');
    expect(after.phase).toBe('closed');
    // El fragmento de memoria es el pago narrativo: debe quedar en el registro.
    expect(after.log.length).toBeGreaterThan(2);
  });

  it('no se puede entregar un encargo que aún está en curso', () => {
    activeMissions = [offeredMission({ status: 'accepted' })];
    const state = dialogue.start(makePlanet())!;

    expect(state.phase).toBe('offer');
    expect(state.choices.some(c => c.kind === 'turn-in')).toBe(false);
    expect(state.choices.some(c => c.kind === 'accept')).toBe(false);
    expect(state.missionSummary).toBeTruthy();
  });

  it('no engancha el encargo de otra raza con el mismo id de planeta', () => {
    // Los sistemas procedurales reutilizan ids (planet-0, planet-1…): sin cotejar la raza, aterrizar
    // en el planeta del mismo índice de otro sistema abría la entrega con el interlocutor erróneo.
    activeMissions = [
      offeredMission({ status: 'ready-to-turn-in', race: PlanetInhabitants.MI_GO, requestedBy: PlanetInhabitants.MI_GO }),
    ];
    const state = dialogue.start(makePlanet(PlanetInhabitants.GRISES))!;

    expect(state.phase).toBe('offer');
    expect(state.choices.some(c => c.kind === 'turn-in')).toBe(false);
    expect(state.choices.some(c => c.kind === 'accept')).toBe(true);
  });

  it('una entrega rechazada no narra el éxito ni cierra la conversación', () => {
    activeMissions = [offeredMission({ status: 'ready-to-turn-in' })];
    // El trofeo ya no está en la bodega: completeMission devuelve la misión sin completar.
    missions.completeMission.and.callFake(() => offeredMission({ status: 'ready-to-turn-in' }));
    const state = dialogue.start(makePlanet())!;

    const after = dialogue.choose(state.choices.find(c => c.kind === 'turn-in')!.id)!;

    expect(after.phase).toBe('turn-in');
    expect(after.missionSummary).toBeTruthy();
  });

  it('un encargo ya cumplido no se vuelve a ofrecer', () => {
    // Al completarse, la misión sale de las activas; sin este control la charla la re-ofrecería
    // en bucle y la raza pagaría la recompensa una y otra vez.
    raceStanding = { standing: 'ally', missionsCompleted: 1 };
    const state = dialogue.start(makePlanet())!;

    expect(state.choices.some(c => c.kind === 'accept')).toBe(false);
    expect(state.choices.some(c => c.kind === 'ask')).toBe(true);
    expect(state.choices.some(c => c.kind === 'leave')).toBe(true);
  });

  it('terminar la conversación cierra la sesión', () => {
    dialogue.start(makePlanet());
    dialogue.choose('leave');

    expect(dialogue.getState()).toBeNull();
  });

  /** Fase 15: el guion de los Mi-Go — exterminio, glifo al aceptar y sintonía completa. */
  describe('los Mi-Go', () => {
    it('aceptar su encargo enseña Void Kinesis y sintoniza hacia el sistema arácnido', () => {
      dialogue.start(makePlanet(PlanetInhabitants.MI_GO));
      dialogue.choose('accept');

      expect(learnedGlyphs).toEqual(['VOID_KINESIS']);
      expect(bridge.applyRaceUpgrade).toHaveBeenCalledWith(PlanetInhabitants.MI_GO);
      expect(bridge.tuneNextGateRiteWith).toHaveBeenCalledWith(
        jasmine.objectContaining({
          guaranteedInhabitants: 'ARACNIDOS',
          guaranteedInhabitedCount: 3,
          stationTheme: 'aracnida',
        }),
        'Sistema arácnido'
      );
      // La sintonía data-driven sustituye a la de primigenio: no deben convivir.
      expect(bridge.tuneNextGateRite).not.toHaveBeenCalled();
    });

    it('su encargo es un exterminio con cuota de 3 mundos y 2 telares', () => {
      dialogue.start(makePlanet(PlanetInhabitants.MI_GO));
      dialogue.choose('accept');

      const options = missions.offerMission.calls.mostRecent().args[1]!;
      expect(options.type).toBe('exterminate');
      expect(options.exterminateTarget).toEqual({ race: 'ARACNIDOS', planets: 3, stations: 2 });
      expect(options.reward?.uniqueGlyphId).toBe('VOID_COCOON');
    });

    it('con su misión cumplida ofrecen la senda de Yig', () => {
      raceStanding = { standing: 'ally', missionsCompleted: 1 };
      const state = dialogue.start(makePlanet(PlanetInhabitants.MI_GO))!;

      const tune = state.choices.find(c => c.kind === 'tune');
      expect(tune).toBeTruthy();

      dialogue.choose(tune!.id);
      expect(bridge.tuneNextGateRiteWith).toHaveBeenCalledWith(
        jasmine.objectContaining({ guaranteedInhabitants: 'YIG' }),
        jasmine.any(String)
      );
    });

    it('sin la misión cumplida, la senda de Yig no aparece', () => {
      const state = dialogue.start(makePlanet(PlanetInhabitants.MI_GO))!;
      expect(state.choices.some(c => c.kind === 'tune')).toBe(false);
    });
  });

  /** Fase 15: hostilidad y guiones sin encargo. */
  describe('hostilidad y teasers', () => {
    it('una raza hostil no negocia: la conversación nace cerrada', () => {
      raceStanding = { standing: 'hostile', missionsCompleted: 0 };
      const state = dialogue.start(makePlanet(PlanetInhabitants.MI_GO))!;

      expect(state.phase).toBe('closed');
      expect(state.choices.map(c => c.kind)).toEqual(['leave']);
      expect(missions.offerMission).not.toHaveBeenCalled();
    });

    it('un guion sin misión (Yig) no ofrece encargo alguno', () => {
      const state = dialogue.start(makePlanet(PlanetInhabitants.YIG))!;

      expect(state.choices.some(c => c.kind === 'accept')).toBe(false);
      expect(state.choices.some(c => c.kind === 'ask')).toBe(true);

      // Forzar el accept tampoco crea nada: el guion es un teaser.
      dialogue.choose('accept');
      expect(missions.offerMission).not.toHaveBeenCalled();
    });

    it('los arácnidos ofrecen su contramisión contra los Mi-Go', () => {
      dialogue.start(makePlanet(PlanetInhabitants.ARACNIDOS));
      dialogue.choose('accept');

      const options = missions.offerMission.calls.mostRecent().args[1]!;
      expect(options.type).toBe('exterminate');
      expect(options.exterminateTarget?.race).toBe('MI_GO');
    });
  });
});
