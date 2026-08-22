import { AracnidWarSystem, AracnidWarHost } from './aracnid-war-system';
import { AracnidFighterBeing } from '../../game-objects/lesser-beings/aracnid-fighter-being';
import { Vector3 } from '../../../types/game.types';

/**
 * Guerra arácnida (Fase 15): estaciones telaraña deterministas, hostilidad al primer golpe y
 * oleadas de cazas mientras quede un telar vivo.
 */
describe('AracnidWarSystem', () => {
  interface HarnessState {
    aracnid: boolean;
    tag: string | null;
    hostile: boolean;
    busy: boolean;
    flags: Set<string>;
    notices: string[];
    hostilityDeclared: number;
    stationKills: number;
    xpAwards: number;
    spawned: AracnidFighterBeing[];
    needles: number;
    registered: string[];
    unregistered: string[];
    ship: Vector3;
  }

  function makeHost(overrides: Partial<HarnessState> = {}): { host: AracnidWarHost; state: HarnessState } {
    const state: HarnessState = {
      aracnid: true,
      tag: 'sys-web',
      hostile: false,
      busy: false,
      flags: new Set<string>(),
      notices: [],
      hostilityDeclared: 0,
      stationKills: 0,
      xpAwards: 0,
      spawned: [],
      needles: 0,
      registered: [],
      unregistered: [],
      ship: { x: 0, y: 0, z: 0 },
      ...overrides,
    };
    const host: AracnidWarHost = {
      isAracnidSystem: () => state.aracnid,
      getSystemTag: () => state.tag,
      getAracnidPlanetPositions: () => [
        { x: 5000, y: 0, z: 0 },
        { x: -3000, y: 0, z: 4000 },
        { x: 0, y: 0, z: -6000 },
      ],
      getShipPosition: () => ({ ...state.ship }),
      getShipVelocity: () => ({ x: 0, y: 0, z: 0 }),
      isBusy: () => state.busy,
      hasStoryFlag: flag => state.flags.has(flag),
      markStoryFlag: flag => {
        if (state.flags.has(flag)) return false;
        state.flags.add(flag);
        return true;
      },
      isHostile: () => state.hostile,
      declareHostility: () => {
        state.hostile = true;
        state.hostilityDeclared++;
      },
      registerStation: station => { state.registered.push(station.id); },
      unregisterStationCollider: id => { state.unregistered.push(id); },
      spawnFighter: (homeStationId, position) => {
        const fighter = new AracnidFighterBeing(homeStationId, { position: { ...position } });
        state.spawned.push(fighter);
        return fighter;
      },
      fireNeedle: () => { state.needles++; },
      registerStationKillForMissions: () => { state.stationKills++; },
      awardStationXp: () => { state.xpAwards++; },
      emitNotice: text => state.notices.push(text),
      log: () => undefined,
    };
    return { host, state };
  }

  it('fuera de un sistema arácnido no teje nada', () => {
    const { host } = makeHost({ aracnid: false });
    const war = new AracnidWarSystem();
    war.update(host, 0.016);
    expect(war.getStations().length).toBe(0);
  });

  it('en el sistema arácnido teje 2 estaciones deterministas y las registra', () => {
    const { host, state } = makeHost();
    const war = new AracnidWarSystem();
    war.update(host, 0.016);

    expect(war.getStations().length).toBe(2);
    expect(war.getSacs().length).toBe(2);
    expect(state.registered.length).toBe(2);

    const other = new AracnidWarSystem();
    other.update(makeHost().host, 0.016);
    expect(other.getStations().map(s => ({ ...s.position }))).toEqual(
      war.getStations().map(s => ({ ...s.position }))
    );
  });

  it('una estación con storyFlag de derribo no vuelve a tejerse', () => {
    const { host, state } = makeHost();
    state.flags.add('aracnid-web-down:sys-web:0');
    const war = new AracnidWarSystem();
    war.update(host, 0.016);
    expect(war.getStations().length).toBe(1);
  });

  it('el primer golpe del jugador declara la hostilidad una sola vez', () => {
    const { host, state } = makeHost();
    const war = new AracnidWarSystem();
    war.update(host, 0.016);

    war.notifyPlayerAggression(host);
    war.notifyPlayerAggression(host);

    expect(state.hostilityDeclared).toBe(1);
    expect(state.hostile).toBe(true);
  });

  it('hostiles y con telar vivo, la oleada saca cazas (hasta 4)', () => {
    const { host, state } = makeHost({ hostile: true });
    const war = new AracnidWarSystem();
    war.update(host, 0.016); // teje

    // Avanza más que el primer retardo de oleada + tres intervalos.
    for (let t = 0; t < 70; t += 0.5) {
      war.update(host, 0.5);
    }
    expect(state.spawned.length).toBeGreaterThan(0);
    expect(state.spawned.length).toBeLessThanOrEqual(4);
  });

  it('en neutral no sale ni un caza aunque pase el tiempo', () => {
    const { host, state } = makeHost({ hostile: false });
    const war = new AracnidWarSystem();
    for (let t = 0; t < 120; t += 1) {
      war.update(host, 1);
    }
    expect(state.spawned.length).toBe(0);
  });

  it('destruir una estación marca storyFlag, misión y XP; la última repliega a los cazas', () => {
    const { host, state } = makeHost({ hostile: true });
    const war = new AracnidWarSystem();
    war.update(host, 0.016);
    for (let t = 0; t < 30; t += 0.5) {
      war.update(host, 0.5);
    }
    const fighters = state.spawned.length;
    const [first, second] = war.getStations().map(s => s.id);

    war.notifyStationDestroyed(host, first);
    expect(state.flags.has('aracnid-web-down:sys-web:' + first.split('-').pop())).toBe(true);
    expect(state.stationKills).toBe(1);
    expect(state.xpAwards).toBe(1);
    expect(war.getStations().length).toBe(1);

    war.notifyStationDestroyed(host, second);
    expect(war.hasLiveStations()).toBe(false);
    if (fighters > 0) {
      // Sin telares, los cazas vivos se desactivan (el aviso de repliegue lo confirma).
      expect(state.notices.some(n => n.includes('REPLIEGAN'))).toBe(true);
      expect(state.spawned.every(f => !f.active)).toBe(true);
    }
  });

  it('los cazas persiguen y disparan cuando encaran a la nave en rango', () => {
    const { host, state } = makeHost({ hostile: true });
    const war = new AracnidWarSystem();
    war.update(host, 0.016); // teje las estaciones
    // La nave se planta en el PUNTO MEDIO entre ambos telares: salga de donde salga la oleada
    // (la estación se elige al azar), el caza siempre tiene la distancia salvable en el test.
    const [a, b] = war.getStations().map(s => s.position);
    state.ship = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    // El sistema pilota (steer + velocidad); la INTEGRACIÓN de posición la hace el motor. El arnés
    // integra a mano, como updateLesserBeings, hasta que el caza encara y entra en rango.
    for (let t = 0; t < 60; t += 0.1) {
      war.update(host, 0.1);
      for (const fighter of state.spawned) {
        if (!fighter.active) continue;
        fighter.position.x += fighter.velocity.x * 0.1;
        fighter.position.y += fighter.velocity.y * 0.1;
        fighter.position.z += fighter.velocity.z * 0.1;
      }
    }
    expect(state.spawned.length).toBeGreaterThan(0);
    expect(state.needles).toBeGreaterThan(0);
  });

  it('al salir del sistema se limpia todo y los colliders se dan de baja', () => {
    const { host, state } = makeHost();
    const war = new AracnidWarSystem();
    war.update(host, 0.016);
    expect(war.getStations().length).toBe(2);

    state.aracnid = false;
    war.update(host, 0.016);

    expect(war.getStations().length).toBe(0);
    expect(state.unregistered.length).toBe(2);
  });
});
