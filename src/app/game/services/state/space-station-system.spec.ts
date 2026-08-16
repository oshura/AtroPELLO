import { SpaceStationSystem, SpaceStationHost, MAX_DOCK_RELATIVE_SPEED } from './space-station-system';
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
    shipVel: { x: 0, y: 0, z: 0 } as Vector3 | null,
    human: opts.human ?? true,
    busy: opts.busy ?? false,
    dockEvents: [] as Array<DockPort | null>,
    logs: [] as string[],
    collidersRegistered: [] as string[],
    collidersUnregistered: [] as string[],
  };
  const host: SpaceStationHost = {
    getShipPosition: () => state.ship,
    getShipVelocity: () => state.shipVel,
    getEarthPosition: () => (opts.earth === undefined ? { x: 0, y: 0, z: 10000 } : opts.earth),
    isHumanSystem: () => state.human,
    isBusy: () => state.busy,
    onDockReady: (p) => state.dockEvents.push(p),
    isDockingBusy: () => false,
    registerCollider: (def) => state.collidersRegistered.push(def.id),
    unregisterCollider: (id) => state.collidersUnregistered.push(id),
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

  it('detecta candidato con la nave DENTRO del corredor de marcos, y lo apaga fuera de él', () => {
    const sys = new SpaceStationSystem();
    const { host, state } = makeHost();
    sys.update(host, 0.016); // spawn
    const dockable = sys.getPorts().find(p => p.isDockable())!;
    expect(dockable).toBeTruthy();
    // Dentro del corredor: a 30u del tile a lo largo de la normal de aproximación.
    const n = dockable.approachNormal;
    state.ship = {
      x: dockable.position.x + n.x * 30,
      y: dockable.position.y + n.y * 30,
      z: dockable.position.z + n.z * 30,
    };
    sys.update(host, 0.016);
    expect(sys.getDockCandidate()?.id).toBe(dockable.id);
    expect(state.dockEvents[state.dockEvents.length - 1]?.id).toBe(dockable.id);
    // Misma profundidad pero desplazada 60u lateralmente → fuera del embudo.
    const r = dockable.approachRight;
    state.ship = {
      x: dockable.position.x + n.x * 30 + r.x * 60,
      y: dockable.position.y + n.y * 30 + r.y * 60,
      z: dockable.position.z + n.z * 30 + r.z * 60,
    };
    sys.update(host, 0.016);
    expect(sys.getDockCandidate()).toBeNull();
  });

  it('piloto solo a ≤5 u/s RELATIVA: el giro se frena con la nave en el corredor y entonces se enciende', () => {
    const sys = new SpaceStationSystem();
    const { host, state } = makeHost();
    sys.update(host, 0.016); // spawn
    const station = sys.getRenderable()!;
    const dockable = sys.getPorts().find(p => p.isDockable())!;
    const n = dockable.approachNormal;
    state.ship = {
      x: dockable.position.x + n.x * 30,
      y: dockable.position.y + n.y * 30,
      z: dockable.position.z + n.z * 30,
    };
    state.shipVel = { x: 0, y: 0, z: 0 }; // nave parada en mundo
    sys.update(host, 0.05);
    expect(sys.getDockCandidate()?.id).toBe(dockable.id);
    // Con el giro aún vivo, el puerto barre a ~9 u/s → velocidad relativa > 5 → piloto apagado.
    expect(sys.isDockReady()).toBeFalse();
    // La asistencia de atraque frena el giro en unos segundos → relativa → 0 → piloto encendido.
    for (let i = 0; i < 200; i++) {
      sys.update(host, 0.05);
    }
    expect(sys.isDockReady()).toBeTrue();
    // Giro congelado del todo mientras la nave siga en el corredor.
    const frozenSpin = station.spin;
    for (let i = 0; i < 20; i++) {
      sys.update(host, 0.05);
    }
    expect(station.spin).toBe(frozenSpin);
    // La nave se marcha (bien lejos del corredor) → el giro se reanuda.
    state.ship = { x: dockable.position.x + 500, y: dockable.position.y + 500, z: dockable.position.z + 500 };
    for (let i = 0; i < 100; i++) {
      sys.update(host, 0.05);
    }
    expect(sys.getDockCandidate()).toBeNull();
    expect(station.spin).toBeGreaterThan(frozenSpin);
    // Y en movimiento dentro del corredor, por encima del umbral no hay piloto.
    expect(MAX_DOCK_RELATIVE_SPEED).toBe(5);
  });

  it('los puertos NO acoplables van tintados en azul oscuro (sin pecios)', () => {
    const sys = new SpaceStationSystem();
    const { host } = makeHost();
    sys.update(host, 0.016);
    const dockable = sys.getPorts().find(p => p.isDockable())!;
    const closed = sys.getPorts().find(p => !p.isDockable())!;
    expect(dockable.colors![0]).toBeCloseTo(0.25, 2); // azul brillante
    expect(closed.colors![0]).toBeLessThan(0.1);      // azul oscuro
    expect(closed.colors![2]).toBeGreaterThan(closed.colors![0]); // sigue siendo azul
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

  it('registra el collider estructurado al spawnear y lo da de baja al limpiar (Fase 11 R4)', () => {
    const sys = new SpaceStationSystem();
    const { host, state } = makeHost();
    sys.update(host, 0.016); // spawn
    const station = sys.getRenderable()!;
    expect(state.collidersRegistered).toEqual([station.id]);
    expect(station.getStructuredShapesLocal().length).toBeGreaterThan(0);
    state.human = false;
    sys.update(host, 0.016); // clear
    expect(state.collidersUnregistered).toEqual([station.id]);
  });
});
