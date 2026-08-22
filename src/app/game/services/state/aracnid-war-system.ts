import { Vector3 } from '../../../types/game.types';
import { AracnidWebStation } from '../../game-objects/stations/aracnid-web-station';
import { AracnidFighterBeing } from '../../game-objects/lesser-beings/aracnid-fighter-being';
import { StationEmissiveBall } from '../../game-objects/stations/station-emissive-ball';
import { mulberry32, hashSeed } from '../../utils/seeded-random';

/**
 * Guerra arácnida (Fase 15 — docs/RAZAS.md, plan documentation/Plan_MiGo_Aracnidos.md).
 *
 * Un solo sistema para todo el teatro: las ESTACIONES telaraña del sistema tejedor, la HOSTILIDAD
 * (neutrales hasta el primer golpe del jugador) y las OLEADAS de cazas que salen de las estaciones
 * vivas. Clase plana con host (regla #1): el motor delega y no crece.
 *
 * Persistencia: las estaciones destruidas se recuerdan por storyFlag
 * (`aracnid-web-down:<systemTag>:<n>`); la hostilidad vive en el standing de la raza. Los cazas
 * son transitorios: al recargar, si sigue habiendo guerra, vuelven a salir del telar.
 */

export interface AracnidWarHost {
  /** ¿El sistema actual es un sistema de guerra arácnido? (meta.stationTheme === 'aracnida'). */
  isAracnidSystem(): boolean;
  /** Identidad estable del sistema (posiciones y storyFlags deterministas). */
  getSystemTag(): string | null;
  getAracnidPlanetPositions(): Vector3[];
  getShipPosition(): Vector3 | null;
  getShipVelocity(): Vector3 | null;
  /** Animación/salto en curso: no spawnear todavía. */
  isBusy(): boolean;
  hasStoryFlag(flag: string): boolean;
  markStoryFlag(flag: string): boolean;
  isHostile(): boolean;
  /** Declara la hostilidad (standing + marquee + planetas arácnidos en enemigo). */
  declareHostility(): void;
  /** Alta en el motor: callback de destrucción + collider estructurado. */
  registerStation(station: AracnidWebStation): void;
  /** Baja del collider al despawnear/cambiar de sistema. */
  unregisterStationCollider(stationId: string): void;
  /** Crea y registra un caza en el pipeline de seres. Null si el motor no puede. */
  spawnFighter(homeStationId: string, position: Vector3) : AracnidFighterBeing | null;
  /** Dispara un aguijonazo del caza (proyectil enemigo del pool común). */
  fireNeedle(fighter: AracnidFighterBeing, direction: Vector3): void;
  /** Progreso de misión de exterminio por estación destruida. */
  registerStationKillForMissions(): void;
  awardStationXp(): void;
  emitNotice(text: string): void;
  log(msg: string, data?: unknown): void;
}

const STATION_COUNT = 2;
const STATION_RADIUS = 220;
const STATION_SPIN = 0.05;            // rad/s (las telas giran despacio)
const STATION_XP = 150;
const FIGHTER_MAX_ALIVE = 4;
const FIGHTER_WAVE_INTERVAL_SEC = 20;
const FIGHTER_FIRST_WAVE_DELAY_SEC = 2.5;
const FIGHTER_FIRE_RANGE = 600;
const FIGHTER_FACING_DOT = 0.55;      // sólo dispara con el morro razonablemente encarado
const FIGHTER_VEER_DISTANCE = 110;    // a menos de esto, pasa de largo en vez de embestir
const NEEDLE_SPEED = 260;

interface FighterContext {
  being: AracnidFighterBeing;
  cooldownSec: number;
  /** Fase propia del zigzag (que el enjambre no vuele en formación de desfile). */
  swayPhase: number;
}

const SAC_GLOW_COLOR: [number, number, number] = [0.62, 0.3, 0.95];

export class AracnidWarSystem {
  private stations: AracnidWebStation[] = [];
  private sacs: StationEmissiveBall[] = [];
  private fighters: FighterContext[] = [];
  private waveTimer = FIGHTER_FIRST_WAVE_DELAY_SEC;
  private activeSystemTag: string | null = null;
  private retreatAnnounced = false;

  /** Estaciones vivas (render, targeting y blancos de armas). */
  getStations(): readonly AracnidWebStation[] {
    return this.stations;
  }

  /** Sacos luminosos (uno por estación viva): el "corazón" violeta del telar, pase emissive. */
  getSacs(): readonly StationEmissiveBall[] {
    return this.sacs;
  }

  /** ¿Queda presencia arácnida orbital en este sistema? */
  hasLiveStations(): boolean {
    return this.stations.some(s => s.active && s.healthCurrent > 0);
  }

  clear(host?: AracnidWarHost): void {
    for (const station of this.stations) {
      host?.unregisterStationCollider(station.id);
    }
    this.stations = [];
    this.sacs = [];
    // Los cazas registrados en el motor caen con el cambio de sistema (colección de seres);
    // aquí basta soltar los contextos.
    this.fighters = [];
    this.waveTimer = FIGHTER_FIRST_WAVE_DELAY_SEC;
    this.activeSystemTag = null;
    this.retreatAnnounced = false;
  }

  update(host: AracnidWarHost, dt: number): void {
    if (!host.isAracnidSystem()) {
      if (this.stations.length || this.fighters.length) {
        this.clear(host);
      }
      return;
    }
    const tag = host.getSystemTag();
    if (!tag) {
      return;
    }
    if (this.activeSystemTag !== tag) {
      this.clear(host);
      this.activeSystemTag = tag;
    }
    if (!this.stations.length && !host.isBusy()) {
      this.spawnStations(host, tag);
    }

    // Giro perezoso de las telas.
    for (const station of this.stations) {
      station.spin += STATION_SPIN * dt;
      station.updateModelMatrix();
    }

    this.pruneDeadFighters();
    if (host.isHostile()) {
      this.updateWaves(host, dt);
      this.pilotFighters(host, dt);
    }
  }

  /**
   * Primer golpe del jugador a algo arácnido (estación o caza): se acabó la neutralidad.
   * Lo llama el motor desde el punto único de daño a objetos.
   */
  notifyPlayerAggression(host: AracnidWarHost): void {
    if (host.isHostile()) {
      return;
    }
    host.declareHostility();
    this.waveTimer = FIGHTER_FIRST_WAVE_DELAY_SEC; // los cazas tardan un suspiro en salir
  }

  /** ¿Este objeto es una de nuestras estaciones? (para el router de destrucción del motor). */
  ownsStation(objectId: string): boolean {
    return this.stations.some(s => s.id === objectId);
  }

  /** ¿Este ser es un caza arácnido de este teatro? */
  ownsFighter(objectId: string): boolean {
    return this.fighters.some(f => f.being.id === objectId);
  }

  /** Estación destruida: storyFlag, misión, XP y —sin telares vivos— repliegue de cazas. */
  notifyStationDestroyed(host: AracnidWarHost, stationId: string): void {
    const index = this.stations.findIndex(s => s.id === stationId);
    if (index < 0) {
      return;
    }
    const station = this.stations[index];
    this.stations.splice(index, 1);
    const sacIndex = this.sacs.findIndex(s => s.id === `${station.id}-sac`);
    if (sacIndex >= 0) {
      this.sacs.splice(sacIndex, 1);
    }
    host.unregisterStationCollider(station.id);
    host.markStoryFlag(this.stationDownFlag(this.activeSystemTag ?? '', this.stationIndexOf(station.id)));
    host.awardStationXp();
    host.registerStationKillForMissions();
    host.emitNotice('TELAR ORBITAL DESTRUIDO');
    host.log('Aracnid web station destroyed', { stationId });

    if (!this.hasLiveStations() && this.fighters.length && !this.retreatAnnounced) {
      this.retreatAnnounced = true;
      for (const context of this.fighters) {
        // Sin colmena no hay guerra: los cazas se desactivan (el motor los retira sin botín).
        context.being.active = false;
        context.being.visible = false;
      }
      this.fighters = [];
      host.emitNotice('SIN TELARES, LOS CAZAS SE REPLIEGAN');
    }
  }

  // ── Estaciones ─────────────────────────────────────────────────────────────────────────────────

  private spawnStations(host: AracnidWarHost, tag: string): void {
    const rnd = mulberry32(hashSeed(`aracnid-war-${tag}`));
    const anchors = host.getAracnidPlanetPositions();
    for (let i = 0; i < STATION_COUNT; i++) {
      if (host.hasStoryFlag(this.stationDownFlag(tag, i))) {
        continue; // ya la reventó: no vuelve a tejerse
      }
      const anchor = anchors.length ? anchors[i % anchors.length] : { x: 0, y: 0, z: 0 };
      const angle = rnd() * Math.PI * 2;
      const distance = 1600 + rnd() * 900;
      const position: Vector3 = {
        x: anchor.x + Math.cos(angle) * distance,
        y: anchor.y + (rnd() - 0.5) * 500,
        z: anchor.z + Math.sin(angle) * distance,
      };
      const station = new AracnidWebStation(`aracnid-web-${tag}-${i}`, position, STATION_RADIUS);
      // Inclinación fija seudoaleatoria (cada tela cuelga a su manera).
      station.rotation.x = (rnd() - 0.5) * 1.2;
      station.rotation.z = (rnd() - 0.5) * 1.2;
      station.updateModelMatrix();
      // Esfera de impacto del SACO central (proyectiles): pequeña a propósito — el corazón, no la tela.
      station.boundingSphere = { center: { ...position }, radius: STATION_RADIUS * 0.16 };
      this.stations.push(station);
      // Corazón violeta del telar (pase emissive), centrado en el saco.
      const sac = new StationEmissiveBall(`${station.id}-sac`, { ...position }, STATION_RADIUS * 0.12, SAC_GLOW_COLOR, 0.8);
      sac.updateModelMatrix();
      this.sacs.push(sac);
      host.registerStation(station);
    }
    host.log('Aracnid web stations spawned', { tag, count: this.stations.length });
  }

  private stationDownFlag(tag: string, index: number): string {
    return `aracnid-web-down:${tag}:${index}`;
  }

  private stationIndexOf(stationId: string): number {
    const raw = stationId.split('-').pop();
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // ── Cazas ──────────────────────────────────────────────────────────────────────────────────────

  private pruneDeadFighters(): void {
    if (!this.fighters.length) {
      return;
    }
    this.fighters = this.fighters.filter(f => f.being.active && f.being.healthCurrent > 0);
  }

  private updateWaves(host: AracnidWarHost, dt: number): void {
    if (!this.hasLiveStations() || this.fighters.length >= FIGHTER_MAX_ALIVE || host.isBusy()) {
      return;
    }
    this.waveTimer -= dt;
    if (this.waveTimer > 0) {
      return;
    }
    this.waveTimer = FIGHTER_WAVE_INTERVAL_SEC;
    const station = this.stations[Math.floor(Math.random() * this.stations.length)];
    const hatch: Vector3 = {
      x: station.position.x + (Math.random() - 0.5) * 80,
      y: station.position.y + 40 + Math.random() * 40,
      z: station.position.z + (Math.random() - 0.5) * 80,
    };
    const fighter = host.spawnFighter(station.id, hatch);
    if (fighter) {
      this.fighters.push({
        being: fighter,
        cooldownSec: 1 + Math.random(),
        swayPhase: Math.random() * Math.PI * 2,
      });
      host.emitNotice('CAZA ARÁCNIDO EN VUELO');
    }
  }

  private pilotFighters(host: AracnidWarHost, dt: number): void {
    if (!this.fighters.length) {
      return;
    }
    const ship = host.getShipPosition();
    if (!ship) {
      return;
    }
    const shipVel = host.getShipVelocity() ?? { x: 0, y: 0, z: 0 };
    const nowSway = performance.now() / 1000;

    for (const context of this.fighters) {
      const being = context.being;
      const toShip: Vector3 = { x: ship.x - being.position.x, y: ship.y - being.position.y, z: ship.z - being.position.z };
      const distance = Math.hypot(toShip.x, toShip.y, toShip.z) || 1;
      const dir: Vector3 = { x: toShip.x / distance, y: toShip.y / distance, z: toShip.z / distance };

      // Zigzag de araña: componente lateral senoidal, más ancho cuanto más cerca.
      const sway = Math.sin(nowSway * 2.1 + context.swayPhase) * Math.min(1, 300 / distance) * 0.45;
      const lateral: Vector3 = { x: -dir.z * sway, y: 0.15 * sway, z: dir.x * sway };

      let target: Vector3;
      if (distance < FIGHTER_VEER_DISTANCE) {
        // Pasada: no embisten; esquivan por el lateral y vuelven a abrir distancia.
        target = { x: dir.x * 0.2 + lateral.x * 3, y: dir.y * 0.2 + lateral.y * 3, z: dir.z * 0.2 + lateral.z * 3 };
      } else {
        target = { x: dir.x + lateral.x, y: dir.y + lateral.y, z: dir.z + lateral.z };
      }
      being.steerTowards(target, dt);
      being.adjustSpeed(distance > 450 ? being.stats.maxSpeed : being.stats.maxSpeed * 0.7, dt);
      // La integración de posición la hace el motor (updateLesserBeings); aquí sólo se pilota.

      // Aguijonazo con predicción: apunta a donde ESTARÁ la nave, no a donde está.
      context.cooldownSec -= dt;
      if (context.cooldownSec <= 0 && distance <= FIGHTER_FIRE_RANGE) {
        const facing =
          being.forwardDirection.x * dir.x + being.forwardDirection.y * dir.y + being.forwardDirection.z * dir.z;
        if (facing >= FIGHTER_FACING_DOT) {
          const lead = distance / NEEDLE_SPEED;
          const aim: Vector3 = {
            x: ship.x + shipVel.x * lead - being.position.x,
            y: ship.y + shipVel.y * lead - being.position.y,
            z: ship.z + shipVel.z * lead - being.position.z,
          };
          const len = Math.hypot(aim.x, aim.y, aim.z) || 1;
          host.fireNeedle(being, { x: aim.x / len, y: aim.y / len, z: aim.z / len });
          context.cooldownSec = being.attackProfile.cooldownMs / 1000;
        }
      }
    }
  }
}

export { STATION_XP as ARACNID_STATION_XP };
