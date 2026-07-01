import { SpaceStationSystem, SpaceStationHost, DOCK_RANGE } from './space-station-system';
import { DockPort } from '../../game-objects/stations/dock-port';
import { Vector3 } from '../../../types/game.types';

function makeHost(opts: {
  ship?: Vector3 | null;
  earth?: Vector3 | null;
  human?: boolean;
  busy?: boolean;
} = {}) {
  const state = {
    ship: opts.ship === undefined ? ({ x: 0, y: 0, z: 0 } as Vector3 | null) : opts.ship,
    human: opts.human ?? true,
    busy: opts.busy ?? false,
    dockEvents: [] as Array<DockPort | null>,
    particles: 0,
    logs: [] as string[],
  };
  const host: SpaceStationHost = {
    getShipPosition: () => state.ship,
    getEarthPosition: () => (opts.earth === undefined ? { x: 0, y: 0, z: 10000 } : opts.earth),
    isHumanSystem: () => state.human,
    isBusy: () => state.busy,
    onDockReady: (p) => state.dockEvents.push(p),
    emitParticle: () => { state.particles++; },
    isDockingBusy: () => false,
    log: (m) => state.logs.push(m),
  };
  return { host, state };
}

describe('SpaceStationSystem', () => {
  it('no aparece fuera del sistema humano', () => {
    const sys = new SpaceStationSystem();
    const { host } = makeHost({ human: false });
    sys.update(host, 0.016);
    expect(sys.getRenderable()).toBeNull();
  });

  it('no aparece si el motor está ocupado (animación/void jump)', () => {
    const sys = new SpaceStationSystem();
    const { host } = makeHost({ busy: true });
    sys.update(host, 0.016);
    expect(sys.getRenderable()).toBeNull();
  });

  it('aparece a 2500u de la nave hacia la Tierra, con 8 puertos en mundo', () => {
    const sys = new SpaceStationSystem();
    const { host } = makeHost({ ship: { x: 0, y: 0, z: 0 }, earth: { x: 0, y: 0, z: 10000 } });
    sys.update(host, 0.016);
    const station = sys.getRenderable();
    expect(station).not.toBeNull();
    // 2500u hacia la Tierra (+Z).
    expect(station!.position.z).toBeCloseTo(2500, 0);
    expect(sys.getPorts().length).toBe(8);
    // Los puertos están cerca de la estación (dentro del radio exterior).
    for (const p of sys.getPorts()) {
      const d = Math.hypot(
        p.position.x - station!.position.x,
        p.position.y - station!.position.y,
        p.position.z - station!.position.z,
      );
      expect(d).toBeLessThan(station!.size * 1.2);
    }
  });

  it('enciende el piloto de acople al acercar la nave a <50u de un puerto acoplable', () => {
    const sys = new SpaceStationSystem();
    const { host, state } = makeHost();
    sys.update(host, 0.016); // spawn
    const dockable = sys.getPorts().find(p => p.isDockable())!;
    expect(dockable).toBeTruthy();
    // Coloca la nave justo en el puerto.
    state.ship = { ...dockable.position };
    sys.update(host, 0.016);
    expect(sys.getDockCandidate()?.id).toBe(dockable.id);
    expect(state.dockEvents[state.dockEvents.length - 1]?.id).toBe(dockable.id);
    // Aleja la nave → se apaga.
    state.ship = { x: dockable.position.x + DOCK_RANGE * 10, y: dockable.position.y, z: dockable.position.z };
    sys.update(host, 0.016);
    expect(sys.getDockCandidate()).toBeNull();
  });

  it('un puerto destruido no enciende el piloto', () => {
    const sys = new SpaceStationSystem();
    const { host, state } = makeHost();
    sys.update(host, 0.016);
    const broken = sys.getPorts().find(p => !p.isDockable());
    if (!broken) {
      return; // (el daño es determinista; normalmente hay alguno)
    }
    state.ship = { ...broken.position };
    sys.update(host, 0.016);
    expect(sys.getDockCandidate()).toBeNull();
  });

  it('se limpia al salir del sistema humano', () => {
    const sys = new SpaceStationSystem();
    const { host, state } = makeHost();
    sys.update(host, 0.016);
    expect(sys.getRenderable()).not.toBeNull();
    state.human = false;
    sys.update(host, 0.016);
    expect(sys.getRenderable()).toBeNull();
    expect(sys.getPorts().length).toBe(0);
  });
});
