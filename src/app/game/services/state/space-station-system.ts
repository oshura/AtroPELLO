import { Vector3 } from '../../../types/game.types';
import { HumanSpaceStation, HUMAN_STATION_ID } from '../../game-objects/stations/human-space-station';
import { DockPort } from '../../game-objects/stations/dock-port';
import { StationMotorGlow } from '../../game-objects/stations/station-motor';

/** Color RGB [0..1] para partículas. */
export interface RgbColor { r: number; g: number; b: number; }

/** Puente del sistema con el motor (todo via host: sin acoplar a GameEngine, testeable). */
export interface SpaceStationHost {
  getShipPosition(): Vector3 | null;
  getEarthPosition(): Vector3 | null;   // centro de la cola de asteroides (la Tierra partida)
  isHumanSystem(): boolean;             // la estación humana solo existe en el sistema humano
  isBusy(): boolean;                    // animación/void jump activos → no spawnear todavía
  onDockReady(port: DockPort | null): void; // puerto acoplable dentro de rango (o null)
  emitParticle(pos: Vector3, color: RgbColor, scale: number): void; // fuego/motor
  isDockingBusy(): boolean;             // acoplada o en animación de atraque → congelar el giro
  log(msg: string, data?: unknown): void;
}

const SPAWN_DIST = 2500;       // u desde la nave del jugador (dentro de la cola; localizar y dirigirse a ella)
const STATION_RADIUS = 800;    // radio exterior del toroide (grandota)
const PORT_SIZE = 8;           // tamaño de la tile de acople (20% del anterior)
const EMIT_INTERVAL = 0.06;    // s entre emisiones de partículas de fuego/motor (llama más continua)
const FIRE_COLOR: RgbColor = { r: 1.0, g: 0.40, b: 0.08 };   // fuego naranja
const FIRE_YELLOW: RgbColor = { r: 1.0, g: 0.78, b: 0.22 };  // núcleo de la llama (amarillo)
const MOTOR_COLOR: RgbColor = { r: 0.8, g: 0.18, b: 0.06 };  // motor "apagado" rojo/naranja
const SPIN_SPEED = 0.05;       // rad/s — giro lento sobre su eje (como un planeta)
const TILT = (25 * Math.PI) / 180; // inclinación inicial (~25°) en un par de ejes
export const DOCK_RANGE = 50;  // u: a esta distancia de un puerto se enciende el piloto de acople

/**
 * Estación espacial humana como LANDMARK FIJO del sistema humano (regenerado idéntico por semilla; sin
 * persistencia). Lógica FUERA del GameEngine (regla #1): el motor llama `update` por frame y
 * `getRenderable`/`getPorts` en el pase de render/targeting. docs/ESTACIONES.md Fase 9.
 */
export class SpaceStationSystem {
  private station: HumanSpaceStation | null = null;
  private ports: DockPort[] = [];
  private dockCandidate: DockPort | null = null;
  private fireWorld: Vector3[] = [];      // focos de fuego en mundo (toroide)
  private motorWorld: Vector3 | null = null; // núcleo de motores en mundo
  private motors: StationMotorGlow[] = []; // "bolas" de motor (geometría emissive)
  private emitTimer = 0;

  getRenderable(): HumanSpaceStation | null {
    return this.station;
  }

  getPorts(): DockPort[] {
    return this.ports;
  }

  /** "Bolas" de motor (geometría emissive) que el engine renderiza en el pase emissive. */
  getMotors(): StationMotorGlow[] {
    return this.motors;
  }

  /** Puerto acoplable más cercano dentro de rango (null si ninguno). Lo usa el flujo de acople. */
  getDockCandidate(): DockPort | null {
    return this.dockCandidate;
  }

  clear(): void {
    this.station = null;
    this.ports = [];
    this.dockCandidate = null;
    this.fireWorld = [];
    this.motorWorld = null;
    this.motors = [];
    this.emitTimer = 0;
  }

  update(host: SpaceStationHost, dt: number): void {
    if (!host.isHumanSystem()) {
      if (this.station) {
        this.clear();
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

    // Giro lento sobre su eje (como un planeta), congelado mientras está acoplada/en animación de atraque
    // (para que la nave acoplada no se "despegue" del puerto). Re-deriva puertos/motores/focos.
    if (!host.isDockingBusy()) {
      this.station.rotation.y += SPIN_SPEED * dt;
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

    // Partículas de fuego (toroide) + motor "apagado" (núcleo), a intervalos. Fuego grande y denso.
    this.emitTimer += dt;
    if (this.emitTimer >= EMIT_INTERVAL) {
      this.emitTimer = 0;
      for (const p of this.fireWorld) {
        host.emitParticle(p, FIRE_COLOR, 3.0);
        host.emitParticle(p, FIRE_YELLOW, 1.8);
      }
      if (this.motorWorld) {
        host.emitParticle(this.motorWorld, MOTOR_COLOR, 1.2);
      }
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
    // Inclinación inicial (~25°) en un par de ejes; luego gira lentamente sobre su eje Y (ver update).
    station.rotation.x = TILT;
    station.rotation.z = TILT;
    station.updateModelMatrix();
    this.station = station;

    // Crear los objetos de puertos y motores UNA vez; sus transformaciones en mundo las fija rebuildWorldTransforms.
    this.ports = [];
    for (const pl of station.getPortPlacements()) {
      const port = new DockPort(`${station.id}-port-${pl.id}`, { ...pos }, station.id, PORT_SIZE, pl.intact);
      port.voidMassUnits = station.voidMassUnits; // el detalle muestra características del padre
      this.ports.push(port);
    }
    this.motors = [];
    let mi = 0;
    for (const g of station.getMotorGlowsLocal()) {
      this.motors.push(new StationMotorGlow(`${station.id}-motor-${mi++}`, { ...pos }, g.radius));
    }
    this.emitTimer = 0;
    this.rebuildWorldTransforms();

    host.log('Space station spawned (human landmark)', { pos, ports: this.ports.length });
  }

  /** Re-deriva la posición/orientación en MUNDO de puertos, motores y focos desde el modelMatrix (rotado) de la estación. */
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
    const toDir = (l: [number, number, number]): Vector3 => ({
      x: m[0] * l[0] + m[4] * l[1] + m[8] * l[2],
      y: m[1] * l[0] + m[5] * l[1] + m[9] * l[2],
      z: m[2] * l[0] + m[6] * l[1] + m[10] * l[2],
    });

    const placements = station.getPortPlacements();
    for (let i = 0; i < this.ports.length; i++) {
      const pl = placements[i];
      const port = this.ports[i];
      const w = toWorld(pl.localCenter);
      port.position.x = w.x; port.position.y = w.y; port.position.z = w.z;
      const nw = toDir(pl.localNormal);
      const nl = Math.hypot(nw.x, nw.y, nw.z) || 1;
      port.approachNormal = { x: nw.x / nl, y: nw.y / nl, z: nw.z / nl };
      port.faceNormal(nw);
      port.updateModelMatrix();
      // Refrescar el centro del bounding sphere (selección lo usa); el sistema mueve el puerto a mano.
      if (port.boundingSphere) {
        port.boundingSphere.center = { x: w.x, y: w.y, z: w.z };
      }
    }

    const glows = station.getMotorGlowsLocal();
    for (let i = 0; i < this.motors.length; i++) {
      const w = toWorld(glows[i].center);
      const mtr = this.motors[i];
      mtr.position.x = w.x; mtr.position.y = w.y; mtr.position.z = w.z;
      mtr.updateModelMatrix();
    }

    const emissive = station.getEmissivePointsLocal();
    this.fireWorld = emissive.fire.map(toWorld);
    this.motorWorld = emissive.motor ? toWorld(emissive.motor) : null;
  }
}
