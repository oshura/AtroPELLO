import { GameObject } from '../../../GameObject';
import { Asteroid, GameObjectType, Spaceship } from '../../../game-objects';
import { LesserBeingBase } from '../../../game-objects/lesser-beings/lesser-being-base';
import { LesserBeing } from '../../../types/cosmic-life.types';
import { Vector3 } from '../../../../types/game.types';
import { GameStateStore } from '../../../../services/game/game-state.store';
import { LoggingService, LogCategory, LogLevel } from '../../../../services/logging.service';
import { CollisionManagerService } from '../collision-manager.service';
import { AsteroidClusterInstance } from '../../game/asteroid-cluster.service';
import { collisionDamageForConstructor, collisionDamageForType } from './collision-damage';
import { StructuredColliderDef } from './collision-shape.types';
import { StructuredColliderSet, StructuredHit } from './structured-collision';

/**
 * Driver unificado de colisiones nave↔mundo (Fase 11 R2, docs/COLISIONES.md §3.2).
 * Extraído de GameEngine (`checkCollisions` + `handleCollisionResponse` + slide) con
 * comportamiento IDÉNTICO: agrega fuentes (clusters, efímeros, independientes, planetas,
 * sol, portales, debris, lesser beings), testea contra la nave, delega la física en
 * `CollisionManagerService` y aplica daño/slide/viñeta/sfx vía host. Patrón sistema
 * externo + host adapter cacheado (clase plana, sin Angular DI).
 */
export interface ShipCollisionHost {
  getShip(): Spaceship | null;
  /** collisionsDisabled ‖ supresión de aterrizaje ‖ gracia atmosférica. */
  isSuppressed(): boolean;
  getClusters(): AsteroidClusterInstance[];
  /** Radio de extensión del cluster (miembro más lejano del centro), para el broad gate por cluster. */
  getClusterExtentRadius(c: AsteroidClusterInstance): number;
  getEphemeralAsteroids(): Asteroid[];
  forEachPlanetDebris(cb: (obj: GameObject) => void): void;
  getLesserBeings(): LesserBeingBase[];
  applyShipDamage(
    amount: number,
    sourceId: string,
    reason: string,
    options: { suppressHud: boolean; sourceObject: GameObject },
  ): number;
  applyDamageToObject(obj: GameObject, damage: number): void;
  makeAsteroidIndependent(obj: GameObject): void;
  emitShipDamageMarquee(text: string): void;
  addImpactVignette(bump: number): void;
  isAudioUnlocked(): boolean;
  hasSfx(name: string): boolean;
  playSfx(name: string, volume: number): void;
  getWeatherImpactVolumeScale(): number;
  /** true mientras la nave está acoplada o en cinemática de atraque (su pose queda DENTRO del clamp). */
  isStructuredSuppressed(): boolean;
}

interface CollisionSlideState {
  start: Vector3;
  end: Vector3;
  t: number;
  duration: number;
}

/** Marcas dinámicas sobre asteroides que preservan su velocidad tras el impacto. */
type AsteroidMarks = GameObject & { _isIndependent?: boolean; _pendingEjection?: unknown };

const PAIR_COOLDOWN_MS = 500;
const DAMAGE_COOLDOWN_MS = 500;
const MUTUAL_DAMAGE_TO_OBJECT = 50;
/** Holgura del broad gate por cluster (u): cubre radio de miembro + deriva entre frames. */
const CLUSTER_GATE_MARGIN = 150;
/** Push-out extra al resolver penetración estructurada (u). */
const STRUCTURED_PUSH_PADDING = 1.5;
/** Daño estructurado escalado por velocidad de impacto normal (u/s → daño). Rozar pica; estamparse casi mata. */
const STRUCTURED_IMPACT_SPEED_MIN = 1;
const STRUCTURED_IMPACT_SPEED_MAX = 12;
const STRUCTURED_IMPACT_DMG_MIN = 10;
const STRUCTURED_IMPACT_DMG_MAX = 150;

export class ShipCollisionSystem {
  /** Cooldown por par nave-objeto para permitir que la física se aplique sin re-daño. */
  private readonly pairCooldown = new Map<string, number>();
  /** Desplazamiento lateral suave tras colisión con objetos grandes/masivos. */
  private slide: CollisionSlideState | null = null;
  /** Throttle del logging de debug (1/s). */
  private lastLogSec = 0;
  /** Colliders estructurados registrados (estación y objetos futuros). */
  private readonly structured = new StructuredColliderSet();

  constructor(
    private readonly gameState: GameStateStore,
    private readonly collisionManager: CollisionManagerService,
    private readonly logger: LoggingService,
  ) {}

  /** Detecta colisiones de la nave contra todas las fuentes del mundo (fin de update()). */
  checkCollisions(host: ShipCollisionHost): void {
    const ship = host.getShip();
    if (!ship || host.isSuppressed()) {
      return;
    }
    const now = performance.now();
    // Debug: log ship bounding sphere status once per second
    if (Math.floor(now / 1000) !== this.lastLogSec) {
      this.lastLogSec = Math.floor(now / 1000);
      const shipBS = ship.boundingSphere;
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Collision check', {
        shipBS: shipBS ? { r: shipBS.radius.toFixed(1), pos: `(${shipBS.center.x.toFixed(0)}, ${shipBS.center.y.toFixed(0)}, ${shipBS.center.z.toFixed(0)})` } : 'null'
      });
    }
    // Aggregate potential collision sources (clusters members, super, mega, planets, sun, ephemerals)
    const sources: GameObject[] = [];
    const shipR = ship.boundingSphere?.radius ?? 0;
    try {
      host.getClusters().forEach(c => {
        // Broad gate por CLUSTER (Fase 11 R3): 1 comparación barata en vez de N tests de miembros.
        const gate = host.getClusterExtentRadius(c) + shipR + CLUSTER_GATE_MARGIN;
        const gx = c.center.x - ship.position.x;
        const gy = c.center.y - ship.position.y;
        const gz = c.center.z - ship.position.z;
        if (gx * gx + gy * gy + gz * gz > gate * gate) return;
        // Include ALL cluster objects regardless of LOD mode to ensure SuperAsteroids are checked
        c.objects.forEach(o => { if (o.isActive && o.isActive()) sources.push(o); });
        // Also include proxy if present (avoid duplicates via lodMode check)
        if (c.lodMode === 'proxy' && c.proxy && !c.representativeId && c.proxy.isActive && c.proxy.isActive()) sources.push(c.proxy);
      });
    } catch {}
    try { host.getEphemeralAsteroids().forEach(a => { if (a.isActive && a.isActive()) sources.push(a); }); } catch {}
    try { this.gameState.independentAsteroids.forEach(a => { if (a.isActive && a.isActive()) sources.push(a); }); } catch {}
    try { this.gameState.planets.forEach(p => { if (p.isActive && p.isActive()) sources.push(p); }); } catch {}
    try { const sun = this.gameState.sun; if (sun && sun.isActive && sun.isActive()) sources.push(sun); } catch {}
    try { this.gameState.portals.forEach(p => { if (p.isActive && p.isActive()) sources.push(p); }); } catch {}
    // Mega asteroides en planetDebris
    try { host.forEachPlanetDebris(obj => { if (obj.isActive && obj.isActive()) sources.push(obj); }); } catch {}
    try {
      for (const lb of host.getLesserBeings()) {
        if (!lb || !lb.active || !lb.visible || !lb.isActive()) {
          continue;
        }
        if (lb.beingType === LesserBeing.VAMPIRO_FUEGO) {
          continue;
        }
        sources.push(lb);
      }
    } catch {}
    for (const obj of sources) {
      try {
        // Check collision pair cooldown (500ms) para permitir que física se aplique
        const pairKey = `ship-${obj.id}`;
        const pairCooldownUntil = this.pairCooldown.get(pairKey) || 0;
        if (now < pairCooldownUntil) continue; // Skip this pair, still in cooldown

        const collided = ship.checkCollision(obj);
        if (collided) {
          // Set cooldown for this collision pair (500ms)
          this.pairCooldown.set(pairKey, now + PAIR_COOLDOWN_MS);

          const rawName = obj?.constructor?.name || 'Unknown';
          const name = rawName.startsWith('_') ? rawName.substring(1) : rawName;
          const objectType = obj?.getType?.() ?? GameObjectType.UNKNOWN;
          let dmg = collisionDamageForType(objectType);
          if (objectType === GameObjectType.LESSER_BEING && obj instanceof LesserBeingBase) {
            if (obj.beingType === LesserBeing.SHOGGOTH || obj.beingType === LesserBeing.SEMILLAS_ESTELARES) {
              dmg = 150;
            } else if (obj.beingType === LesserBeing.VAMPIRO_FUEGO) {
              dmg = 0;
            } else if (dmg === null) {
              dmg = 75; // default impact for other corporeal lesser beings
            }
          } else if (dmg === null) {
            dmg = collisionDamageForConstructor(name);
          }

          this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Collision detected!', {
            name, rawName, objectType, id: obj.id, damage: dmg ?? 0
          });

          const resolvedDamage = dmg ?? 0;
          if (resolvedDamage > 0) {
            // Physics response before applying potential fatal damage
            try {
              this.handleCollisionResponse(host, ship, obj, name, resolvedDamage);
            } catch (e) {
              this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'handleCollisionResponse failed', e);
            }
            this.applyDamageCooldowned(host, ship, now, obj, resolvedDamage, name);

            // Apply mutual damage: ship deals damage to the object
            host.applyDamageToObject(obj, MUTUAL_DAMAGE_TO_OBJECT);
          }
        }
      } catch {}
    }

    // Colliders estructurados (estación y futuros). Suprimidos mientras la nave está acoplada:
    // la pose de atraque (30u tras la tile) queda DENTRO del volumen del brazo de acople.
    if (!host.isStructuredSuppressed()) {
      this.structured.check(
        ship,
        hit => this.respondStructured(host, ship, now, hit),
        (id, inside) => this.logger.log(LogLevel.DEBUG, LogCategory.COLLISION_PHYSICS,
          inside ? 'Structured gate ENTER' : 'Structured gate EXIT', { id }),
      );
    }
  }

  /** Registra un collider estructurado (formas locales + transform vivo). Ver docs/COLISIONES.md §3.4. */
  registerStructured(def: StructuredColliderDef): void {
    this.structured.register(def);
    this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, 'Structured collider registered', {
      id: def.id, shapes: def.shapesLocal.length
    });
  }

  unregisterStructured(id: string): void {
    this.structured.unregister(id);
  }

  /** Daño a la nave con cooldown por objeto (compartido por los caminos esférico y estructurado). */
  private applyDamageCooldowned(host: ShipCollisionHost, ship: Spaceship, now: number, obj: GameObject, amount: number, label: string): void {
    if (!obj || !obj.id) return;
    const nextAllowed = this.gameState.collisionCooldowns.get(obj.id) || 0;
    if (now < nextAllowed) return; // still in cooldown
    this.gameState.collisionCooldowns.set(obj.id, now + DAMAGE_COOLDOWN_MS);
    // Portal is ethereal: ignore negative/zero damage
    if (amount <= 0) return;
    const dealt = host.applyShipDamage(amount, obj.id, label, {
      suppressHud: true,
      sourceObject: obj
    });
    if (dealt <= 0) {
      return;
    }
    // Simple HUD feedback: add marquee message
    const remaining = `${Math.round(ship.healthCurrent)}/${Math.round(ship.healthMax)}`;
    host.emitShipDamageMarquee(`Impacto: -${Math.round(dealt)}u (${remaining})`);
  }

  /**
   * Respuesta al contacto estructurado: push-out por la normal de SUPERFICIE (idempotente, cada frame de
   * contacto) + deslizamiento (anula la componente de velocidad contra la superficie, conserva la
   * tangencial) + daño escalado por velocidad de impacto (con cooldowns). docs/COLISIONES.md §3.5.
   */
  private respondStructured(host: ShipCollisionHost, ship: Spaceship, now: number, hit: StructuredHit): void {
    const push = hit.depthWorld + STRUCTURED_PUSH_PADDING;
    ship.position.x += hit.nx * push;
    ship.position.y += hit.ny * push;
    ship.position.z += hit.nz * push;
    ship.updateModelMatrix();
    try { if (ship.boundingSphere) ship.boundingSphere.center = { ...ship.position }; } catch {}

    const v = ship.velocity;
    const vDotN = v.x * hit.nx + v.y * hit.ny + v.z * hit.nz;
    if (vDotN < 0) {
      v.x -= hit.nx * vDotN;
      v.y -= hit.ny * vDotN;
      v.z -= hit.nz * vDotN;
    }

    if (hit.approachSpeed >= STRUCTURED_IMPACT_SPEED_MIN) {
      const pairKey = `ship-${hit.def.id}`;
      if (now >= (this.pairCooldown.get(pairKey) || 0)) {
        this.pairCooldown.set(pairKey, now + PAIR_COOLDOWN_MS);
        const t = Math.min(1, (hit.approachSpeed - STRUCTURED_IMPACT_SPEED_MIN) /
          (STRUCTURED_IMPACT_SPEED_MAX - STRUCTURED_IMPACT_SPEED_MIN));
        const dmg = Math.round(STRUCTURED_IMPACT_DMG_MIN + (STRUCTURED_IMPACT_DMG_MAX - STRUCTURED_IMPACT_DMG_MIN) * t);
        this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, 'Structured collision', {
          id: hit.def.id, shape: hit.contact.shapeIndex, speed: hit.approachSpeed.toFixed(2), dmg
        });
        this.applyDamageCooldowned(host, ship, now, hit.def.source, dmg, hit.def.source.constructor?.name || 'Structure');
        this.impactFeedback(host, dmg);
      }
    }
    hit.def.onContact?.(hit.contact);
  }

  /** Handle physical response, camera effect and audio for a collision */
  private handleCollisionResponse(host: ShipCollisionHost, ship: Spaceship, obj: GameObject, name: string, dmg: number): void {
    // Determinar si el objetivo es miembro de cluster
    const isClusterMember = !this.gameState.isIndependentAsteroid(obj.id) &&
                            !host.getEphemeralAsteroids().some(a => a.id === obj.id);

    // Delegar TODA la lógica al CollisionManager
    const result = this.collisionManager.handleCollision(ship, obj, isClusterMember);

    // Aplicar resultados según tipo de colisión
    if (result.collisionType === 'small-movable') {
      // Física completa 3D: actualizar nave y asteroide
      this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '📊 Physics response calculated', {
        asteroidId: obj.id,
        newVelocity: result.targetNewVelocity ?
          `(${result.targetNewVelocity.x.toFixed(2)}, ${result.targetNewVelocity.y.toFixed(2)}, ${result.targetNewVelocity.z.toFixed(2)})` : 'null',
        shouldEject: result.shouldEject,
        impulseMagnitude: result.impulseMagnitude.toFixed(2)
      });

      // IMPORTANTE: Marcar como independiente ANTES de aplicar velocidad para evitar sobreescritura
      // Incluso con impulso pequeño, el asteroide debe mantener su velocidad de colisión
      if (result.impulseMagnitude > 0.1) {
        (obj as AsteroidMarks)._isIndependent = true;
        this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '📌 Asteroid marked as independent (preserves velocity)', {
          asteroidId: obj.id,
          impulse: result.impulseMagnitude.toFixed(2)
        });
      }

      // Aplicar resultado a la nave
      ship.position = result.newPosition;
      ship.velocity = result.newVelocity;
      ship.updateModelMatrix();
      try {
        if (ship.boundingSphere) {
          ship.boundingSphere.center = { ...ship.position };
        }
      } catch {}

      // Eyectar de cluster si hay cualquier colisión real (impulso > 0.1)
      // Esto asegura que el asteroide se añade a independentAsteroids y no se recalcula como cluster member
      if (result.impulseMagnitude > 0.1 && isClusterMember) {
        this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '🚀 Ejecting asteroid from cluster', {
          asteroidId: obj.id,
          reason: 'Collision detected',
          impulse: result.impulseMagnitude.toFixed(2),
          highImpulse: result.shouldEject
        });
        host.makeAsteroidIndependent(obj);
      }

      // Aplicar resultado al asteroide (sale disparado según ángulo de impacto)
      // IMPORTANTE: Hacer esto DESPUÉS de eyectar para que no sea sobreescrito por applyCenterDrivenFullUpdate
      if (result.targetNewVelocity && obj.velocity) {
        obj.velocity.x = result.targetNewVelocity.x;
        obj.velocity.y = result.targetNewVelocity.y;
        obj.velocity.z = result.targetNewVelocity.z;
        this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '✅ Velocity applied to asteroid', {
          asteroidId: obj.id,
          velocityAfter: `(${obj.velocity.x.toFixed(2)}, ${obj.velocity.y.toFixed(2)}, ${obj.velocity.z.toFixed(2)})`,
          isIndependent: this.gameState.isIndependentAsteroid(obj.id),
          hasPendingEjection: !!(obj as AsteroidMarks)._pendingEjection
        });
      }

    } else if (result.collisionType === 'large-immovable' || result.collisionType === 'massive-slide') {
      // Slide suave para objetos grandes/masivos
      const R = Math.max(10, (obj.boundingSphere?.radius ?? 200));
      const slide = Math.max(30, Math.min(250, R * 0.1));

      // Calcular dirección de slide (tangente + normal)
      const dx = ship.position.x - obj.position.x;
      const dy = ship.position.y - obj.position.y;
      const dz = ship.position.z - obj.position.z;
      const dist = Math.hypot(dx, dy, dz) || 1;
      const normal = { x: dx / dist, y: dy / dist, z: dz / dist };

      // Tangente perpendicular a velocidad y normal
      const v = ship.velocity;
      const vDotN = v.x * normal.x + v.y * normal.y + v.z * normal.z;
      const tangent = {
        x: v.x - vDotN * normal.x,
        y: v.y - vDotN * normal.y,
        z: v.z - vDotN * normal.z
      };
      const tlen = Math.hypot(tangent.x, tangent.y, tangent.z) || 1;
      tangent.x /= tlen; tangent.y /= tlen; tangent.z /= tlen;

      const start = { ...ship.position };
      const end = {
        x: start.x + tangent.x * slide + normal.x * 5,
        y: start.y + tangent.y * slide + normal.y * 5,
        z: start.z + tangent.z * slide + normal.z * 5
      };

      this.slide = { start, end, t: 0, duration: 0.3 };
      ship.velocity = result.newVelocity;

    } else if (result.collisionType === 'ethereal') {
      // Sin física (portales)
    }

    this.impactFeedback(host, dmg);
  }

  /** Viñeta de cámara + cue de audio (light/heavy) de un impacto, escalados por el daño. */
  private impactFeedback(host: ShipCollisionHost, dmg: number): void {
    // Camera impact vignette bump
    const bump = Math.min(0.9, 0.08 + (dmg / 250));
    host.addImpactVignette(bump);

    // Audio cue (light/heavy)
    try {
      if (host.isAudioUnlocked()) {
        const heavy = dmg >= 80;
        const desired = heavy ? 'sfx_collision_heavy' : 'sfx_collision_light';
        const clip = host.hasSfx(desired) ? desired : (heavy ? 'sfx_whoosh' : 'ui_select');
        const baseVolume = Math.max(0.2, Math.min(0.9, 0.25 + dmg / 180));
        const vol = Math.min(1, baseVolume * host.getWeatherImpactVolumeScale());
        host.playSfx(clip, vol);
      } else {
        this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Collision sound skipped - audio not unlocked');
      }
    } catch {}
  }

  /** Aplica el slide en curso (reposición lateral suave, smoothstep 0.3 s). Llamar cada frame ANTES de la cámara. */
  applySlide(host: ShipCollisionHost, deltaTime: number): void {
    if (!this.slide) return;
    const ship = host.getShip();
    if (!ship) { this.slide = null; return; }
    this.slide.t += deltaTime;
    const k = Math.max(0, Math.min(1, this.slide.t / Math.max(1e-6, this.slide.duration)));
    // Smoothstep easing
    const s = k * k * (3 - 2 * k);
    ship.position.x = this.slide.start.x + (this.slide.end.x - this.slide.start.x) * s;
    ship.position.y = this.slide.start.y + (this.slide.end.y - this.slide.start.y) * s;
    ship.position.z = this.slide.start.z + (this.slide.end.z - this.slide.start.z) * s;
    ship.updateModelMatrix();
    try { if (ship.boundingSphere) ship.boundingSphere.center = { ...ship.position }; } catch {}
    if (k >= 1) this.slide = null;
  }

  /** Limpia cooldowns y slide (cambio de sistema / respawn). */
  reset(): void {
    this.pairCooldown.clear();
    this.slide = null;
  }
}
