import { Vector3 } from '../../../types/game.types';
import { SpaceTurtleObject } from '../../game-objects/space-turtle';
import { CargoItemType, RarityTier, CargoManifestEntry } from '../../types/inventory.types';
import { GameObjectType } from '../../types/game-object.types';

/** Puente del sistema con el motor (todo via host para no acoplar a GameEngine y poder testear). */
export interface SpaceTurtleHost {
  getSunPosition(): Vector3 | null;
  getSystemRadius(): number;        // distancia de aparición (sesgada a la posición del jugador)
  isReadyForSpawn(): boolean;
  randomUnitDirection(): Vector3;   // dirección de entrada (sesgada hacia el jugador para un buen flyby)
  spawnDust(pos: Vector3): void;
  announce(text: string): void;     // aviso en el HUD al entrar
  addCargoEntry(entry: CargoManifestEntry): void; // botín al destruirla
  rollD100(): number;               // 1..100 (la tortuga aparece con un 10% por tirada)
  logInfo(message: string, data?: unknown): void;
}

const APPROACH_SPEED = 350;      // u/s hacia el sol (1/4 de la velocidad previa; pasa cerca del jugador)
const LEAVE_SPEED = 700;         // u/s "mucha más velocidad" tras atravesarlo (1/4 de la previa)
const SWIM_SPEED = 0.8;          // rad/s — nado MUY lento
const DUST_INTERVAL = 0.18;      // s entre motas de polvo estelar
const ROLL_INTERVAL = 300;       // s entre tiradas de aparición (5 minutos)
const SPAWN_CHANCE = 10;         // % por tirada (D100 <= 10 = 10%)
const TURTLE_SIZE = 300;

/**
 * Tortuga estelar NEUTRAL que cruza el sistema: entra por un borde, viaja lento hasta el sol, lo atraviesa
 * sin consecuencias (no colisiona con nada) y sale a mucha más velocidad hasta desaparecer en la linde.
 * Va soltando polvo estelar y nada lentamente con aletas/cabeza/cola. Lógica FUERA del GameEngine (regla #1):
 * el motor llama `update` cada frame y `getRenderable` en el pase de render. docs/ARQUITECTURA.md Fase 6.4.
 */
export class SpaceTurtleSystem {
  private turtle: SpaceTurtleObject | null = null;
  private phase: 'approaching' | 'leaving' = 'approaching';
  private entryDir: Vector3 = { x: 0, y: 0, z: 1 };
  private travelDir: Vector3 = { x: 0, y: 0, z: -1 };
  private swimPhase = 0;
  private dustAccum = 0;
  private rollTimer = -1; // s hasta la próxima tirada D100 (<0 = sin inicializar)
  private spawnRadius = 30000; // capturado al aparecer (la linde de ESTE avistamiento)

  /** El modelo a renderizar (o null si ahora mismo no hay tortuga en el sistema). */
  getRenderable(): SpaceTurtleObject | null {
    return this.turtle;
  }

  clear(): void {
    this.turtle = null;
    this.rollTimer = -1;
  }

  /** La destruyeron: otorga el botín, la retira y programa el siguiente avistamiento. */
  notifyDestroyed(host: SpaceTurtleHost): void {
    const entry: CargoManifestEntry = {
      id: 'space-turtle-shell',
      type: CargoItemType.ARTIFACT,
      label: 'Caparazón de Tortuga espacial',
      massTons: 12,
      units: 1,
      source: GameObjectType.MEGA_ASTEROID,
      rarity: RarityTier.UNIQUE,
      notes: 'Caparazón de un quelonio estelar; resuena con el vacío.',
    };
    host.addCargoEntry(entry);
    host.announce('¡Caparazón de Tortuga espacial obtenido!');
    host.logInfo('Space turtle destroyed: shell awarded');
    this.turtle = null;
    this.rollTimer = ROLL_INTERVAL;
  }

  update(host: SpaceTurtleHost, dt: number): void {
    const sun = host.getSunPosition();
    if (!sun) {
      this.turtle = null;
      return;
    }
    if (this.rollTimer < 0) {
      this.rollTimer = ROLL_INTERVAL;
    }
    if (!this.turtle) {
      this.rollTimer -= dt;
      if (this.rollTimer <= 0) {
        this.rollTimer = ROLL_INTERVAL; // siguiente tirada en 5 minutos
        // Tirada de D100: 10% de aparecer (y nunca en el sistema humano; lo decide isReadyForSpawn).
        if (host.isReadyForSpawn() && host.rollD100() <= SPAWN_CHANCE) {
          this.spawn(host, sun);
        }
      }
      return;
    }

    const t = this.turtle;
    const speed = this.phase === 'approaching' ? APPROACH_SPEED : LEAVE_SPEED;
    t.position.x += this.travelDir.x * speed * dt;
    t.position.y += this.travelDir.y * speed * dt;
    t.position.z += this.travelDir.z * speed * dt;

    if (this.phase === 'approaching') {
      // ¿ha cruzado el centro del sol? (pasó del lado de entrada al opuesto)
      const along =
        (t.position.x - sun.x) * this.entryDir.x +
        (t.position.y - sun.y) * this.entryDir.y +
        (t.position.z - sun.z) * this.entryDir.z;
      if (along <= 0) {
        this.phase = 'leaving';
        host.logInfo('Space turtle crossed the sun');
      }
    } else {
      const dist = Math.hypot(t.position.x - sun.x, t.position.y - sun.y, t.position.z - sun.z);
      if (dist >= this.spawnRadius * 1.05) {
        this.despawn(host);
        return;
      }
    }

    t.faceDirection(this.travelDir);
    this.swimPhase += dt * SWIM_SPEED;
    t.applyPose(this.swimPhase);
    t.updateModelMatrix();
    // Refrescar el bounding sphere (selección/outline/distancia lo usan); el sistema la mueve directamente,
    // así que hay que actualizarlo a mano cada frame igual que hacen los debris orbitales.
    if (t.boundingSphere) {
      t.boundingSphere.center = { x: t.position.x, y: t.position.y, z: t.position.z };
    }

    this.dustAccum += dt;
    if (this.dustAccum >= DUST_INTERVAL) {
      this.dustAccum = 0;
      host.spawnDust({ x: t.position.x, y: t.position.y, z: t.position.z });
    }
  }

  private spawn(host: SpaceTurtleHost, sun: Vector3): void {
    const raw = host.randomUnitDirection();
    const len = Math.hypot(raw.x, raw.y, raw.z) || 1;
    const d: Vector3 = { x: raw.x / len, y: raw.y / len, z: raw.z / len };
    const R = host.getSystemRadius();
    this.spawnRadius = R;
    const start: Vector3 = { x: sun.x + d.x * R, y: sun.y + d.y * R, z: sun.z + d.z * R };

    const turtle = new SpaceTurtleObject(`space-turtle-${Date.now()}`, start, TURTLE_SIZE);
    this.entryDir = d;
    this.travelDir = { x: -d.x, y: -d.y, z: -d.z };
    this.phase = 'approaching';
    this.swimPhase = 0;
    this.dustAccum = 0;
    turtle.faceDirection(this.travelDir);
    turtle.applyPose(0);
    turtle.updateModelMatrix();
    this.turtle = turtle;
    host.announce('🐢 Una tortuga estelar surca el sistema');
    host.logInfo('Space turtle entered the system', { dir: d, radius: R });
  }

  private despawn(host: SpaceTurtleHost): void {
    host.logInfo('Space turtle left the system');
    this.turtle = null;
    this.rollTimer = ROLL_INTERVAL;
  }
}
