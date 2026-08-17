import { Vector3 } from '../../../types/game.types';
import { GameObjectType } from '../../types/game-object.types';
import { HumanSpaceStation, HUMAN_STATION_ID } from '../../game-objects/stations/human-space-station';
import type { StructuredColliderDef } from '../physics/collision/collision-shape.types';
import { DockPort } from '../../game-objects/stations/dock-port';
import { StationEmissiveBall } from '../../game-objects/stations/station-emissive-ball';
import { StationWindowMesh } from '../../game-objects/stations/station-windows';
import { isInsideDockCorridor } from '../../game-objects/stations/station-dock-frames';
import { StructuredRayOccluder, TargetOccluder } from '../../targeting/v2/targeting-occluders';

/** Puente del sistema con el motor (todo via host: sin acoplar a GameEngine, testeable). */
export interface SpaceStationHost {
  getShipPosition(): Vector3 | null;
  getShipVelocity(): Vector3 | null;    // velocidad de la nave en mundo (para la velocidad RELATIVA al puerto)
  getEarthPosition(): Vector3 | null;   // centro de la cola de asteroides (la Tierra partida)
  isHumanSystem(): boolean;             // la estación humana solo existe en el sistema humano
  isBusy(): boolean;                    // animación/void jump activos → no spawnear todavía
  onDockReady(port: DockPort | null): void; // nave dentro del corredor de un puerto acoplable (o null)
  showDockHint(text: string): void;     // aviso HUD del corredor (estado del acople / relativa en vivo)
  isDockingBusy(): boolean;             // acoplada o en animación de atraque → congelar el giro
  registerCollider(def: StructuredColliderDef): void;   // alta del collider estructurado (Fase 11 R4)
  unregisterCollider(id: string): void;                 // baja al despawnear/cambiar de sistema
  log(msg: string, data?: unknown): void;
}

const SPAWN_DIST = 2500;       // u desde la nave del jugador (dentro de la cola; localizar y dirigirse a ella)
const LATERAL_OFFSET = 500;    // u PERPENDICULAR a la línea nave→Tierra: al girar la vista se ven ambas por separado
const STATION_RADIUS = 800;    // radio exterior del toroide (grandota)
const PORT_SIZE = 8;           // tamaño de la tile de acople (20% del anterior)
const SPIN_SPEED = 0.025;      // rad/s — giro lento sobre el propio eje del toroide (rueda; núcleo = eje). Mitad de velocidad (antes 0.05)
const TILT = (25 * Math.PI) / 180; // inclinación inicial (~25°) en un par de ejes
const MOTOR_COLOR: [number, number, number] = [1.0, 0.40, 0.10]; // motor "apagado" rojo/naranja (bola emissive)
const FREE_PORTS = new Set<number>([0, 5]); // puertos ACOPLABLES (con marcos neón); el resto, azul oscuro
export const MAX_DOCK_RELATIVE_SPEED = 5; // u/s relativa al puerto para que el piloto se encienda (§8)
const DOCK_READY_RELEASE_SPEED = 6;  // u/s: histéresis — el piloto encendido no se apaga hasta superar esto
const DOCK_HINT_PERIOD = 2.5;  // s entre avisos HUD mientras la nave está en el corredor

/**
 * Estación espacial humana como LANDMARK FIJO del sistema humano (regenerado idéntico por semilla; sin
 * persistencia). Lógica FUERA del GameEngine (regla #1): el motor llama `update` por frame y
 * `getRenderable`/`getPorts`/`getMotors`/`getWindows` en el pase de render/targeting.
 * docs/ESTACIONES.md Fase 9.
 */
export class SpaceStationSystem {
  private station: HumanSpaceStation | null = null;
  private ports: DockPort[] = [];
  private dockCandidate: DockPort | null = null;
  private motors: StationEmissiveBall[] = [];         // "bola" de motor (tobera del núcleo)
  private motorLocals: [number, number, number][] = []; // centros LOCALES de los motores
  private windows: { steady: StationWindowMesh; flicker: StationWindowMesh } | null = null; // §7 I0
  private occluders: TargetOccluder[] = []; // silueta REAL del casco para el targeting (§1.2.2, experimental)
  private dockRelativeSpeed = Infinity;   // |v_nave − v_puerto| del candidato actual (u/s)
  private dockReadyLatch = false;         // piloto con histéresis (enciende ≤5, no se apaga hasta >6)
  private hintTimer = 0;                  // cadencia del aviso HUD del corredor

  getRenderable(): HumanSpaceStation | null {
    return this.station;
  }

  getPorts(): DockPort[] {
    return this.ports;
  }

  /** "Bolas" de motor (geometría emissive) que el engine renderiza en el pase emissive. */
  getMotors(): StationEmissiveBall[] {
    return this.motors;
  }

  /** Puerto acoplable con la nave DENTRO de su corredor de marcos (null si ninguno). Flujo de acople. */
  getDockCandidate(): DockPort | null {
    return this.dockCandidate;
  }

  /** ¿Piloto de acople encendido? Nave en el corredor Y a ≤5 u/s RELATIVA al puerto, con histéresis (§8). */
  isDockReady(): boolean {
    return this.dockReadyLatch;
  }

  /** Capas de ventanas (fijas + parpadeantes) en espacio unidad; se dibujan con el modelMatrix de la estación. */
  getWindows(): { steady: StationWindowMesh; flicker: StationWindowMesh } | null {
    return this.windows;
  }

  /**
   * Oclusores de SILUETA REAL para el targeting (§1.2.2, experimental): el rayo del puntero impacta
   * contra el SDF del casco (mismo collider de Fase 11) — la estación se selecciona sobre su dibujo
   * y lo que queda detrás del casco no se ofrece (por los huecos sí). Vacío sin estación.
   */
  getTargetOccluders(): readonly TargetOccluder[] {
    return this.occluders;
  }

  clear(host?: SpaceStationHost): void {
    if (this.station) {
      host?.unregisterCollider(this.station.id);
    }
    this.station = null;
    this.ports = [];
    this.dockCandidate = null;
    this.motors = [];
    this.motorLocals = [];
    this.windows = null;
    this.occluders = [];
    this.dockRelativeSpeed = Infinity;
    this.dockReadyLatch = false;
    this.hintTimer = 0;
  }

  update(host: SpaceStationHost, dt: number): void {
    if (!host.isHumanSystem()) {
      if (this.station) {
        this.clear(host);
      }
      return;
    }
    if (!this.station) {
      if (host.isBusy()) {
        return;
      }
      const ship = host.getShipPosition();
      if (!ship) {
        return;
      }
      this.spawn(host, ship, host.getEarthPosition());
      return;
    }

    const ship = host.getShipPosition();

    // Giro como una RUEDA sobre el propio eje del toroide (spin = Y local, más interno que la inclinación).
    // La estación NUNCA frena por la nave: atracar exige IGUALAR la velocidad del puerto en movimiento
    // (relativa ≤5 u/s con el puerto barriendo a ~9 u/s). Solo se congela acoplada/en animación.
    if (!host.isDockingBusy()) {
      this.station.spin += SPIN_SPEED * dt;
      this.station.updateModelMatrix();
      this.rebuildWorldTransforms();
    }

    // Detección de acople (§8): la nave debe estar DENTRO del corredor de marcos de un puerto acoplable.
    if (!ship) {
      return;
    }
    let best: DockPort | null = null;
    let bestDepth = Infinity;
    for (const p of this.ports) {
      if (!p.isDockable() || !isInsideDockCorridor(p, ship)) {
        continue;
      }
      const n = p.approachNormal;
      const depth = (ship.x - p.position.x) * n.x + (ship.y - p.position.y) * n.y + (ship.z - p.position.z) * n.z;
      if (depth < bestDepth) {
        bestDepth = depth;
        best = p;
      }
    }
    if (best !== this.dockCandidate) {
      this.dockCandidate = best;
      host.onDockReady(best);
    }
    const shipVel = host.getShipVelocity();
    this.dockRelativeSpeed = best && shipVel
      ? this.computeDockRelativeSpeed(best, shipVel, host.isDockingBusy())
      : Infinity;

    // Piloto con histéresis: enciende a ≤5 u/s relativa; encendido, aguanta hasta >6 (sin parpadeo).
    if (!best) {
      this.dockReadyLatch = false;
    } else if (this.dockRelativeSpeed <= MAX_DOCK_RELATIVE_SPEED) {
      this.dockReadyLatch = true;
    } else if (this.dockRelativeSpeed > DOCK_READY_RELEASE_SPEED) {
      this.dockReadyLatch = false;
    }

    // Aviso HUD periódico en el corredor: estado del acople o la relativa EN VIVO (para poder afinar).
    if (best && !host.isDockingBusy()) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) {
        this.hintTimer = DOCK_HINT_PERIOD;
        host.showDockHint(this.dockReadyLatch
          ? 'Acople listo — pulsa ENTER para atracar'
          : Number.isFinite(this.dockRelativeSpeed)
            ? `Corredor de acople — relativa al puerto: ${this.dockRelativeSpeed.toFixed(1)} u/s (máx ${MAX_DOCK_RELATIVE_SPEED})`
            : 'Corredor de acople — iguala la velocidad del puerto para atracar');
      }
    } else {
      this.hintTimer = 0;
    }
  }

  /**
   * Velocidad de la nave RELATIVA al puerto (u/s), en espacio 3D de mundo — NO se cambia el sistema
   * de referencia de la nave. El puerto se mueve con el giro de la estación: v_puerto = ω × r, con
   * ω = eje de giro (Y local en mundo); solo vale 0 congelada durante el atraque.
   */
  private computeDockRelativeSpeed(port: DockPort, shipVel: Vector3, dockingBusy: boolean): number {
    const st = this.station!;
    const w = dockingBusy ? 0 : SPIN_SPEED;
    const m = st.modelMatrix;
    const al = Math.hypot(m[4], m[5], m[6]) || 1; // columna Y (lleva la escala del radio) → normalizar
    const ax = (m[4] / al) * w, ay = (m[5] / al) * w, az = (m[6] / al) * w;
    const rx = port.position.x - st.position.x;
    const ry = port.position.y - st.position.y;
    const rz = port.position.z - st.position.z;
    const vx = ay * rz - az * ry;
    const vy = az * rx - ax * rz;
    const vz = ax * ry - ay * rx;
    return Math.hypot(shipVel.x - vx, shipVel.y - vy, shipVel.z - vz);
  }

  private spawn(host: SpaceStationHost, ship: Vector3, earth: Vector3 | null): void {
    // Dirección hacia la Tierra (la nave despertó alejada; de camino a casa se topa con la estación).
    let dir: Vector3 = { x: 0, y: 0, z: 1 };
    if (earth) {
      const dx = earth.x - ship.x, dy = earth.y - ship.y, dz = earth.z - ship.z;
      const len = Math.hypot(dx, dy, dz);
      if (len > 1) {
        dir = { x: dx / len, y: dy / len, z: dz / len };
      }
    }
    // Desvío lateral DETERMINISTA (perpendicular a la línea nave→Tierra con el up del mundo; si la
    // línea es casi vertical, con el eje X): estación y Tierra dejan de estar alineadas desde la nave.
    let perp: Vector3 = { x: -dir.z, y: 0, z: dir.x };
    let pl = Math.hypot(perp.x, perp.y, perp.z);
    if (pl < 0.05) {
      perp = { x: 0, y: dir.z, z: -dir.y };
      pl = Math.hypot(perp.x, perp.y, perp.z) || 1;
    }
    const pos: Vector3 = {
      x: ship.x + dir.x * SPAWN_DIST + (perp.x / pl) * LATERAL_OFFSET,
      y: ship.y + dir.y * SPAWN_DIST + (perp.y / pl) * LATERAL_OFFSET,
      z: ship.z + dir.z * SPAWN_DIST + (perp.z / pl) * LATERAL_OFFSET,
    };
    const station = new HumanSpaceStation(pos, STATION_RADIUS, HUMAN_STATION_ID);
    // Inclinación inicial (~25°) en un par de ejes; el giro (spin) se aplica en update sobre el eje del toroide.
    station.rotation.x = TILT;
    station.rotation.z = TILT;
    station.spin = 0;
    station.updateModelMatrix();
    this.station = station;

    // Puertos: 2 acoplables (marcos neón); el resto, cerrados y en azul oscuro (no se puede atracar).
    this.ports = [];
    const placements = station.getPortPlacements();
    for (let i = 0; i < placements.length; i++) {
      const pl = placements[i];
      const port = new DockPort(`${station.id}-port-${pl.id}`, { ...pos }, station.id, PORT_SIZE, pl.intact);
      port.voidMassUnits = station.voidMassUnits; // el detalle muestra características del padre
      if (!FREE_PORTS.has(i)) {
        port.occupied = true; // cerrado → no acoplable (el piloto no se enciende ahí)
      }
      if (!port.isDockable()) {
        port.setInactiveTint(); // azul oscuro (también el destruido por el Incidente)
      }
      port.parentStationName = station.getDisplayName();
      this.ports.push(port);
    }
    // Resumen para el panel de detalle del cuerpo ("aim al núcleo" seleccionable, ESTACIONES §1.2.1).
    station.portsSummary = `${this.ports.filter(p => p.isDockable()).length}/${this.ports.length} operativos`;

    // Motor(es): bola(s) emissive en la tobera del núcleo.
    this.motors = [];
    this.motorLocals = [];
    let mi = 0;
    for (const g of station.getMotorGlowsLocal()) {
      this.motors.push(new StationEmissiveBall(`${station.id}-motor-${mi++}`, { ...pos }, g.radius, MOTOR_COLOR, g.flattenY ?? 1));
      this.motorLocals.push([g.center[0], g.center[1], g.center[2]]);
    }

    // Ventanas exteriores (§7 I0): capas en espacio unidad, dibujadas con el modelMatrix de la estación.
    const wm = station.getWindowMeshesLocal();
    this.windows = wm
      ? {
          steady: new StationWindowMesh(`${station.id}-windows`, { ...pos }, wm.steady),
          flicker: new StationWindowMesh(`${station.id}-windows-flicker`, { ...pos }, wm.flicker),
        }
      : null;

    this.rebuildWorldTransforms();

    // Collider estructurado (Fase 11 R4): formas locales de la propia estación, transform vivo.
    const shapes = station.getStructuredShapesLocal();
    if (shapes.length > 0) {
      host.registerCollider({
        id: station.id,
        source: station,
        shapesLocal: shapes,
        objectType: GameObjectType.SPACE_STATION,
      });
      // Silueta real para el targeting (§1.2.2): mismas formas, transform vivo (modelMatrix por referencia).
      this.occluders = [new StructuredRayOccluder(station.id, station, shapes)];
    }
    host.log('Space station spawned (human landmark)', { pos, ports: this.ports.length, colliderShapes: shapes.length });
  }

  /**
   * Re-deriva posición/orientación en MUNDO de puertos, motores y pecios desde el modelMatrix (inclinado +
   * girando). Puertos y pecios se orientan con una BASE ORTONORMAL exacta extraída del modelMatrix (no con
   * ángulos de Euler), para que queden perfectamente pegados a su cara aunque la estación gire.
   */
  private rebuildWorldTransforms(): void {
    const station = this.station;
    if (!station) {
      return;
    }
    const m = station.modelMatrix;
    const toWorld = (l: [number, number, number]): Vector3 => ({
      x: m[0] * l[0] + m[4] * l[1] + m[8] * l[2] + m[12],
      y: m[1] * l[0] + m[5] * l[1] + m[9] * l[2] + m[13],
      z: m[2] * l[0] + m[6] * l[1] + m[10] * l[2] + m[14],
    });
    const norm = (v: Vector3): Vector3 => {
      const l = Math.hypot(v.x, v.y, v.z) || 1;
      return { x: v.x / l, y: v.y / l, z: v.z / l };
    };
    const toDir = (l: [number, number, number]): Vector3 => norm({
      x: m[0] * l[0] + m[4] * l[1] + m[8] * l[2],
      y: m[1] * l[0] + m[5] * l[1] + m[9] * l[2],
      z: m[2] * l[0] + m[6] * l[1] + m[10] * l[2],
    });
    const cross = (a: Vector3, b: Vector3): Vector3 => ({
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    });
    // Ejes de la estación en mundo (base ortonormal) — referencia para orientar tiles/pecios/motor sin gimbal.
    const exRef = toDir([1, 0, 0]);
    const upRef = toDir([0, 1, 0]);
    const ezRef = toDir([0, 0, 1]);

    // Puertos: base exacta (normal = eje de acople; right/up en el plano de la cara).
    const placements = station.getPortPlacements();
    for (let i = 0; i < this.ports.length; i++) {
      const pl = placements[i];
      const port = this.ports[i];
      const w = toWorld(pl.localCenter);
      const n = toDir(pl.localNormal);
      const right = norm(cross(upRef, n));
      const up = cross(n, right);
      port.setWorldBasis(w, right, up, n);
      if (port.boundingSphere) {
        port.boundingSphere.center = { x: w.x, y: w.y, z: w.z };
      }
    }

    // Motor (bola emissive): orientado con la base de la estación para que el aplastado (M&M) siga su eje Y.
    for (let i = 0; i < this.motors.length; i++) {
      const w = toWorld(this.motorLocals[i]);
      this.motors[i].setWorldBasis(w, exRef, upRef, ezRef);
    }
  }
}
