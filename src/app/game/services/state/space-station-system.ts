import { Vector3 } from '../../../types/game.types';
import { GameObjectType } from '../../types/game-object.types';
import { HumanSpaceStation, HUMAN_STATION_ID } from '../../game-objects/stations/human-space-station';
import type { StructuredColliderDef } from '../physics/collision/collision-shape.types';
import { DockPort } from '../../game-objects/stations/dock-port';
import { StationEmissiveBall } from '../../game-objects/stations/station-emissive-ball';
import { DockedShipWreck } from '../../game-objects/stations/docked-ship-wreck';
import { StationWindowMesh } from '../../game-objects/stations/station-windows';
import { WreckMesh } from '../../game-objects/stations/ship-wreck-geometry';

/** Puente del sistema con el motor (todo via host: sin acoplar a GameEngine, testeable). */
export interface SpaceStationHost {
  getShipPosition(): Vector3 | null;
  getEarthPosition(): Vector3 | null;   // centro de la cola de asteroides (la Tierra partida)
  isHumanSystem(): boolean;             // la estación humana solo existe en el sistema humano
  isBusy(): boolean;                    // animación/void jump activos → no spawnear todavía
  onDockReady(port: DockPort | null): void; // puerto acoplable dentro de rango (o null)
  getShipWreckMesh(): WreckMesh | null; // malla de alambre de la nave (para réplicas atracadas)
  isDockingBusy(): boolean;             // acoplada o en animación de atraque → congelar el giro
  registerCollider(def: StructuredColliderDef): void;   // alta del collider estructurado (Fase 11 R4)
  unregisterCollider(id: string): void;                 // baja al despawnear/cambiar de sistema
  log(msg: string, data?: unknown): void;
}

const SPAWN_DIST = 2500;       // u desde la nave del jugador (dentro de la cola; localizar y dirigirse a ella)
const STATION_RADIUS = 800;    // radio exterior del toroide (grandota)
const PORT_SIZE = 8;           // tamaño de la tile de acople (20% del anterior)
const SPIN_SPEED = 0.025;      // rad/s — giro lento sobre el propio eje del toroide (rueda; núcleo = eje). Mitad de velocidad (antes 0.05)
const TILT = (25 * Math.PI) / 180; // inclinación inicial (~25°) en un par de ejes
const MOTOR_COLOR: [number, number, number] = [1.0, 0.40, 0.10]; // motor "apagado" rojo/naranja (bola emissive)
const WRECK_SCALE = 22;        // semieje (mundo) del pecio atracado (nave del jugador, sólido rusty)
const WRECK_OFFSET = 18;       // separación (mundo) del pecio hacia afuera del puerto (a lo largo de la normal)
const FREE_PORTS = new Set<number>([0, 5]); // puertos LIBRES (sin pecio, acoplables); el resto llevan réplica
export const DOCK_RANGE = 50;  // u: a esta distancia de un puerto se enciende el piloto de acople

/**
 * Estación espacial humana como LANDMARK FIJO del sistema humano (regenerado idéntico por semilla; sin
 * persistencia). Lógica FUERA del GameEngine (regla #1): el motor llama `update` por frame y
 * `getRenderable`/`getPorts`/`getMotors`/`getWrecks` en el pase de render/targeting.
 * docs/ESTACIONES.md Fase 9.
 */
export class SpaceStationSystem {
  private station: HumanSpaceStation | null = null;
  private ports: DockPort[] = [];
  private dockCandidate: DockPort | null = null;
  private motors: StationEmissiveBall[] = [];         // "bola" de motor (tobera del núcleo)
  private motorLocals: [number, number, number][] = []; // centros LOCALES de los motores
  private wrecks: Array<{ obj: DockedShipWreck; port: number }> = []; // réplicas atracadas por puerto
  private windows: { steady: StationWindowMesh; flicker: StationWindowMesh } | null = null; // §7 I0

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

  /** Réplicas atracadas (pecios sólidos rusty) que el engine renderiza con iluminación. */
  getWrecks(): DockedShipWreck[] {
    return this.wrecks.map(w => w.obj);
  }

  /** Puerto acoplable más cercano dentro de rango (null si ninguno). Lo usa el flujo de acople. */
  getDockCandidate(): DockPort | null {
    return this.dockCandidate;
  }

  /** Capas de ventanas (fijas + parpadeantes) en espacio unidad; se dibujan con el modelMatrix de la estación. */
  getWindows(): { steady: StationWindowMesh; flicker: StationWindowMesh } | null {
    return this.windows;
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
    this.wrecks = [];
    this.windows = null;
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

    // Giro como una RUEDA sobre el propio eje del toroide (spin = Y local, más interno que la inclinación).
    // Congelado mientras está acoplada/en animación (para que la nave acoplada no se "despegue" del puerto).
    if (!host.isDockingBusy()) {
      this.station.spin += SPIN_SPEED * dt;
      this.station.updateModelMatrix();
      this.rebuildWorldTransforms();
    }

    // Detección de acople: puerto acoplable más cercano dentro de DOCK_RANGE.
    const ship = host.getShipPosition();
    if (!ship) {
      return;
    }
    let best: DockPort | null = null;
    let bestDist = DOCK_RANGE;
    for (const p of this.ports) {
      if (!p.isDockable()) {
        continue;
      }
      const d = Math.hypot(p.position.x - ship.x, p.position.y - ship.y, p.position.z - ship.z);
      if (d <= bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (best !== this.dockCandidate) {
      this.dockCandidate = best;
      host.onDockReady(best);
    }
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
    const pos: Vector3 = {
      x: ship.x + dir.x * SPAWN_DIST,
      y: ship.y + dir.y * SPAWN_DIST,
      z: ship.z + dir.z * SPAWN_DIST,
    };
    const station = new HumanSpaceStation(pos, STATION_RADIUS, HUMAN_STATION_ID);
    // Inclinación inicial (~25°) en un par de ejes; el giro (spin) se aplica en update sobre el eje del toroide.
    station.rotation.x = TILT;
    station.rotation.z = TILT;
    station.spin = 0;
    station.updateModelMatrix();
    this.station = station;

    // Puertos: 2 libres (acoplables) y el resto ocupados por una réplica atracada.
    this.ports = [];
    const placements = station.getPortPlacements();
    for (let i = 0; i < placements.length; i++) {
      const pl = placements[i];
      const port = new DockPort(`${station.id}-port-${pl.id}`, { ...pos }, station.id, PORT_SIZE, pl.intact);
      port.voidMassUnits = station.voidMassUnits; // el detalle muestra características del padre
      if (!FREE_PORTS.has(i)) {
        port.occupied = true; // ocupado por un pecio → no acoplable (el piloto no se enciende ahí)
      }
      this.ports.push(port);
    }

    // Motor(es): bola(s) emissive en la tobera del núcleo.
    this.motors = [];
    this.motorLocals = [];
    let mi = 0;
    for (const g of station.getMotorGlowsLocal()) {
      this.motors.push(new StationEmissiveBall(`${station.id}-motor-${mi++}`, { ...pos }, g.radius, MOTOR_COLOR, g.flattenY ?? 1));
      this.motorLocals.push([g.center[0], g.center[1], g.center[2]]);
    }

    // Réplicas atracadas: pecios (nave del jugador) en todos los puertos menos los libres.
    this.wrecks = [];
    const wreckMesh = host.getShipWreckMesh();
    if (wreckMesh) {
      for (let i = 0; i < this.ports.length; i++) {
        if (FREE_PORTS.has(i)) {
          continue;
        }
        const obj = new DockedShipWreck(`${station.id}-wreck-${i}`, { ...pos }, wreckMesh, WRECK_SCALE, `${station.id}-wreck-${i}`);
        this.wrecks.push({ obj, port: i });
      }
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
    }
    host.log('Space station spawned (human landmark)', { pos, ports: this.ports.length, wrecks: this.wrecks.length, colliderShapes: shapes.length });
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

    // Pecios: pegados a su puerto (misma base), morro (+Z) hacia afuera a lo largo de la normal.
    for (const wk of this.wrecks) {
      const port = this.ports[wk.port];
      const n = port.approachNormal;
      const right = norm(cross(upRef, n));
      const up = cross(n, right);
      const pos: Vector3 = {
        x: port.position.x + n.x * WRECK_OFFSET,
        y: port.position.y + n.y * WRECK_OFFSET,
        z: port.position.z + n.z * WRECK_OFFSET,
      };
      wk.obj.setWorldBasis(pos, right, up, n);
    }
  }
}
