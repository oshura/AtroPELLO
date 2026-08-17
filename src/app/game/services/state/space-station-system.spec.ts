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
    hints: [] as string[],
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
    showDockHint: (t) => state.hints.push(t),
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

  it('aparece a 2500u hacia la Tierra con desvío lateral de 500u (no tapa la Tierra), con 8 puertos', () => {
    const sys = new SpaceStationSystem();
    const { host } = makeHost({ ship: { x: 0, y: 0, z: 0 }, earth: { x: 0, y: 0, z: 10000 } });
    sys.update(host, 0.016);
    const station = sys.getRenderable();
    expect(station).not.toBeNull();
    // 2500u hacia la Tierra (+Z) y 500u FUERA de la línea nave→Tierra (perpendicular).
    expect(station!.position.z).toBeCloseTo(2500, 0);
    expect(Math.hypot(station!.position.x, station!.position.y)).toBeCloseTo(500, 0);
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

  it('piloto por velocidad RELATIVA real: la estación NO frena su giro; hay que IGUALAR la del puerto', () => {
    const sys = new SpaceStationSystem();
    const { host, state } = makeHost();
    sys.update(host, 0.016); // spawn
    const station = sys.getRenderable()!;
    const dockable = sys.getPorts().find(p => p.isDockable())!;
    const inCorridor = (): Vector3 => {
      const n = dockable.approachNormal;
      return {
        x: dockable.position.x + n.x * 30,
        y: dockable.position.y + n.y * 30,
        z: dockable.position.z + n.z * 30,
      };
    };
    state.ship = inCorridor();
    state.shipVel = { x: 0, y: 0, z: 0 }; // nave PARADA en mundo
    sys.update(host, 0.05);
    expect(sys.getDockCandidate()?.id).toBe(dockable.id);
    // El puerto barre a ~9 u/s con el giro vivo → relativa > 5 → piloto apagado…
    expect(sys.isDockReady()).toBeFalse();
    // …y sigue apagado por mucho que la nave espere delante: la estación NUNCA frena por proximidad.
    for (let i = 0; i < 100; i++) {
      state.ship = inCorridor();
      sys.update(host, 0.05);
    }
    expect(sys.isDockReady()).toBeFalse();
    const spinMid = station.spin;
    state.ship = inCorridor();
    sys.update(host, 0.05);
    expect(station.spin).toBeGreaterThan(spinMid); // el giro avanza incluso con la nave en el corredor
    // El aviso HUD informa de la relativa en vivo, no del "listo".
    expect(state.hints.some(h => h.includes('relativa al puerto'))).toBeTrue();
    expect(state.hints.some(h => h.includes('Acople listo'))).toBeFalse();
    // IGUALANDO la velocidad del puerto (v = ω×r, medida numéricamente) la relativa cae → piloto ON,
    // aunque la nave vaya a ~9 u/s en mundo (lo que importa es la relativa en el espacio 3D).
    const before: Vector3 = { ...dockable.position };
    sys.update(host, 0.05);
    state.shipVel = {
      x: (dockable.position.x - before.x) / 0.05,
      y: (dockable.position.y - before.y) / 0.05,
      z: (dockable.position.z - before.z) / 0.05,
    };
    expect(Math.hypot(state.shipVel.x, state.shipVel.y, state.shipVel.z)).toBeGreaterThan(5); // va "rápido" en mundo
    state.ship = inCorridor();
    sys.update(host, 0.05);
    expect(sys.isDockReady()).toBeTrue();
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

  it('rellena la intel del panel de detalle: resumen de puertos y nombre del padre', () => {
    const sys = new SpaceStationSystem();
    const { host } = makeHost();
    sys.update(host, 0.016);
    const station = sys.getRenderable()!;
    const operational = sys.getPorts().filter(p => p.isDockable()).length;
    expect(station.portsSummary).toBe(`${operational}/${sys.getPorts().length} operativos`);
    for (const p of sys.getPorts()) {
      expect(p.parentStationName).toBe(station.getDisplayName());
    }
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

  it('expone un oclusor de silueta para el targeting y lo limpia al salir del sistema (§1.2.2)', () => {
    const sys = new SpaceStationSystem();
    const { host, state } = makeHost();
    sys.update(host, 0.016); // spawn
    const station = sys.getRenderable()!;
    expect(sys.getTargetOccluders().length).toBe(1);
    expect(sys.getTargetOccluders()[0].targetId).toBe(station.id);
    // Desde la nave (origen) mirando al centro de la estación, el rayo impacta el casco ANTES del centro.
    const d = Math.hypot(station.position.x, station.position.y, station.position.z);
    const dir = { x: station.position.x / d, y: station.position.y / d, z: station.position.z / d };
    const t = sys.getTargetOccluders()[0].rayHit({ x: 0, y: 0, z: 0 }, dir);
    expect(t).not.toBeNull();
    expect(t!).toBeLessThan(d);
    expect(t!).toBeGreaterThan(d - 250); // como tarde, en el núcleo (caja de 128u de semilado)
    state.human = false;
    sys.update(host, 0.016); // clear
    expect(sys.getTargetOccluders().length).toBe(0);
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
