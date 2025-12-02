import { LesserBeing, ELDER_GOD_SUMMONS, ElderGod, LesserBeingInstanceSnapshot } from '../../types/cosmic-life.types';
import { GameEngine } from '../../GameEngine';
import { StellarSeedBeing } from '../../game-objects/lesser-beings/stellar-seed-being';
import { TransluminalShoggothBeing } from '../../game-objects/lesser-beings/transluminal-shoggoth-being';
import { RiftVampireBeing } from '../../game-objects/lesser-beings/rift-vampire-being';
import { LesserBeingBase, LesserBeingSpawnOverrides } from '../../game-objects/lesser-beings/lesser-being-base';
import { Vector3 } from '../../../types/game.types';
import { Portal } from '../../game-objects/Portal';
import { LogCategory, LogLevel } from '../../../services/logging.service';

interface SpawnOptions {
  reason: 'void-jump' | 'portal-tick';
  elderGod: ElderGod;
  portal?: Portal;
}

const MAX_WAITING_BEINGS = 3;
const PORTAL_CHECK_INTERVAL_MS = 60_000;
const VOID_JUMP_SPAWN_PROB = 1;
const PORTAL_SPAWN_PROB = 0.12;

export class LesserBeingSpawner {
  private activeBeings: Set<string> = new Set();
  private portalTimer = 0;

  constructor(private readonly engine: GameEngine) {}

  public update(deltaTime: number): void {
    this.portalTimer += deltaTime * 1000;
    while (this.portalTimer >= PORTAL_CHECK_INTERVAL_MS) {
      this.portalTimer -= PORTAL_CHECK_INTERVAL_MS;
      this.evaluatePortalSpawns();
    }
  }

  public onVoidJumpCompleted(): void {
    const elderGod = this.getCurrentElderGod();
    const roll = Math.random();
    this.engine.logger?.log(LogLevel.DEBUG, LogCategory.LESSER_BEINGS, 'Void jump spawn roll', {
      elderGod,
      roll,
      threshold: VOID_JUMP_SPAWN_PROB
    });
    if (roll < VOID_JUMP_SPAWN_PROB) {
      this.trySpawn({ reason: 'void-jump', elderGod });
    } else {
      this.engine.logger?.log(LogLevel.TRACE, LogCategory.LESSER_BEINGS, 'Void jump spawn skipped', {
        elderGod,
        roll
      });
    }
  }

  private trySpawn(options: SpawnOptions): void {
    this.engine.logger?.log(LogLevel.DEBUG, LogCategory.LESSER_BEINGS, 'Attempting lesser being spawn', {
      reason: options.reason,
      active: this.activeBeings.size,
      max: MAX_WAITING_BEINGS
    });
    if (this.activeBeings.size >= MAX_WAITING_BEINGS) {
      this.engine.logger?.log(LogLevel.DEBUG, LogCategory.LESSER_BEINGS, 'Spawn queue full, skipping lesser being', {
        reason: options.reason,
        active: this.activeBeings.size,
        max: MAX_WAITING_BEINGS
      });
      return;
    }
    const speciesPool = ELDER_GOD_SUMMONS[options.elderGod] ?? [];
    this.engine.logger?.log(LogLevel.DEBUG, LogCategory.LESSER_BEINGS, 'Resolved species pool for spawn', {
      reason: options.reason,
      elderGod: options.elderGod,
      poolSize: speciesPool.length
    });
    if (!speciesPool.length) {
      this.engine.logger?.log(LogLevel.WARN, LogCategory.LESSER_BEINGS, 'Elder god has no summonable species', {
        elderGod: options.elderGod,
        reason: options.reason
      });
      return;
    }
    const species = speciesPool[Math.floor(Math.random() * speciesPool.length)];
    const spawnPosition = options.portal
      ? this.computePortalSpawnPosition(options.portal)
      : this.computeSystemEdgePosition();
    this.engine.logger?.log(LogLevel.DEBUG, LogCategory.LESSER_BEINGS, 'Computed spawn position', {
      reason: options.reason,
      species,
      hasPortal: !!options.portal,
      position: spawnPosition
    });
    const being = this.instantiateBeing(species, spawnPosition);
    if (!being) {
      this.engine.logger?.log(LogLevel.ERROR, LogCategory.LESSER_BEINGS, 'Failed to instantiate lesser being', {
        species,
        position: spawnPosition,
        reason: options.reason
      });
      return;
    }
    this.engine.logger?.log(LogLevel.DEBUG, LogCategory.LESSER_BEINGS, 'Instantiated lesser being', {
      reason: options.reason,
      species,
      beingId: being.id
    });
    this.activeBeings.add(being.id);
    try {
      this.engine.registerLesserBeing(being);
    } catch (err) {
      this.engine.logger?.log(LogLevel.ERROR, LogCategory.LESSER_BEINGS, 'Failed to register lesser being', {
        reason: options.reason,
        species,
        elderGod: options.elderGod,
        portalId: options.portal?.id ?? null,
        error: err instanceof Error ? err.message : err
      });
      this.activeBeings.delete(being.id);
      return;
    }
    this.engine.logger?.log(LogLevel.DEBUG, LogCategory.LESSER_BEINGS, 'Registered lesser being successfully', {
      reason: options.reason,
      species,
      beingId: being.id,
      active: this.activeBeings.size
    });
    this.engine.logger?.log(LogLevel.INFO, LogCategory.LESSER_BEINGS, 'Lesser being spawned', {
      reason: options.reason,
      species,
      elderGod: options.elderGod,
      portalId: options.portal?.id ?? null
    });
  }

  public handleBeingRemoved(beingId: string): void {
    this.activeBeings.delete(beingId);
  }

  private instantiateBeing(species: LesserBeing, position: Vector3, overrides: LesserBeingSpawnOverrides = {}): LesserBeingBase | null {
    const spawnOverrides: LesserBeingSpawnOverrides = { ...overrides, position };
    switch (species) {
      case LesserBeing.SEMILLAS_ESTELARES:
        return new StellarSeedBeing(spawnOverrides);
      case LesserBeing.SHOGGOTH:
        return new TransluminalShoggothBeing(spawnOverrides);
      case LesserBeing.VAMPIRO_FUEGO:
        return new RiftVampireBeing(spawnOverrides);
      default:
        return null;
    }
  }

  public reviveFromSnapshot(snapshot: LesserBeingInstanceSnapshot): LesserBeingBase | null {
    const clonedPos = { ...snapshot.position };
    const being = this.instantiateBeing(snapshot.type, clonedPos, { id: snapshot.id });
    if (!being) {
      return null;
    }
    this.activeBeings.add(being.id);
    if (snapshot.velocity) {
      being.velocity = { ...snapshot.velocity };
      being.currentSpeed = Math.hypot(snapshot.velocity.x, snapshot.velocity.y, snapshot.velocity.z);
    }
    if (snapshot.health) {
      const clamped = Math.max(0, Math.min(snapshot.health.max ?? being.healthMax, snapshot.health.current));
      being.healthCurrent = clamped;
    }
    being.hasLanded = snapshot.hasLanded;
    being.landedPlanetId = snapshot.landedPlanetId ?? null;
    return being;
  }

  private computeSystemEdgePosition(): Vector3 {
    const radius = this.engine.getSystemBoundaryRadius?.() ?? 1000;
    const angle = Math.random() * Math.PI * 2;
    const height = (Math.random() - 0.5) * 200;
    return {
      x: Math.cos(angle) * (radius + 500),
      y: height,
      z: Math.sin(angle) * (radius + 500)
    };
  }

  private computePortalSpawnPosition(portal: Portal): Vector3 {
    const baseRadius = portal.boundingSphere?.radius ?? portal.radius ?? 100;
    const offset = baseRadius * (2 + Math.random() * 2);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const sinPhi = Math.sin(phi);
    return {
      x: portal.position.x + offset * Math.cos(theta) * sinPhi,
      y: portal.position.y + offset * Math.cos(phi),
      z: portal.position.z + offset * Math.sin(theta) * sinPhi
    };
  }

  private getCurrentElderGod(): ElderGod {
    return this.engine.getCurrentSystemElderGod?.() ?? ElderGod.CTHULHU;
  }

  private evaluatePortalSpawns(): void {
    const portals = this.engine.gameState?.portals ?? [];
    for (const portal of portals) {
      if (!portal || this.activeBeings.size >= MAX_WAITING_BEINGS) {
        break;
      }
      if (this.portalPreventsSpawns(portal)) {
        continue;
      }
      const roll = Math.random();
      this.engine.logger?.log(LogLevel.TRACE, LogCategory.LESSER_BEINGS, 'Portal spawn roll', {
        portalId: portal.id,
        roll,
        threshold: PORTAL_SPAWN_PROB
      });
      if (roll < PORTAL_SPAWN_PROB) {
        this.trySpawn({ reason: 'portal-tick', elderGod: this.getCurrentElderGod(), portal });
      } else {
        this.engine.logger?.log(LogLevel.TRACE, LogCategory.LESSER_BEINGS, 'Portal spawn skipped this tick', {
          portalId: portal.id,
          roll
        });
      }
    }
  }

  private portalPreventsSpawns(portal: Portal): boolean {
    if (!portal) {
      return true;
    }
    if (portal.preventsLesserIncursions) {
      this.engine.logger?.log(LogLevel.DEBUG, LogCategory.LESSER_BEINGS, 'Portal prevents incursions', {
        portalId: portal.id
      });
      return true;
    }
    if (portal.isConcordSealed && portal.isConcordSealed()) {
      this.engine.logger?.log(LogLevel.DEBUG, LogCategory.LESSER_BEINGS, 'Portal sealed by Concord', {
        portalId: portal.id
      });
      return true;
    }
    return false;
  }
}
