import { GameEngine } from '../../GameEngine';
import { Vector3 } from '../../../types/game.types';
import { StellarSeedBeing } from '../../game-objects/lesser-beings/stellar-seed-being';
import { TransluminalShoggothBeing } from '../../game-objects/lesser-beings/transluminal-shoggoth-being';
import { RiftVampireBeing } from '../../game-objects/lesser-beings/rift-vampire-being';
import { ProjectileSystem } from '../weapons/projectile-system';

/**
 * Ataques de los seres menores.
 *
 * Desde la Fase 12 este servicio ya NO tiene pool propio: sólo decide QUÉ se dispara y con qué
 * parámetros, y lo entrega al `ProjectileSystem` con facción `enemy`. La integración, el barrido
 * de colisión y la caída de daño son los mismos que usan las armas del jugador.
 */

interface AuraPulseMetadata {
  auraRadius: number;
  damageNear: number;
  damageFar: number;
}

interface AcidSpitMetadata {
  projectileSpeed: number;
  damageNear: number;
  damageFar: number;
  falloffRange: number;
}

interface OrbBurstMetadata {
  orbCount: number;
  orbSpeed: number;
  orbLifetime: number;
  orbDamage: number;
}

const DEFAULT_PROJECTILE_RADIUS = 4;

export class LesserBeingCombatService {
  constructor(
    private readonly engine: GameEngine,
    private readonly projectiles: ProjectileSystem
  ) {}

  public fireAcidSpit(being: StellarSeedBeing, direction: Vector3): void {
    if (!being?.attackProfile?.metadata) {
      return;
    }
    const meta = being.attackProfile.metadata as Partial<AcidSpitMetadata>;
    const speed = meta.projectileSpeed ?? 120;
    const falloffRange = meta.falloffRange ?? being.attackProfile.maxRange ?? 200;
    this.projectiles.spawn({
      faction: 'enemy',
      sourceId: being.id,
      kind: 'acid_spit',
      position: { ...being.position },
      velocity: { x: direction.x * speed, y: direction.y * speed, z: direction.z * speed },
      lifeSec: falloffRange / Math.max(1, speed),
      radius: DEFAULT_PROJECTILE_RADIUS,
      damageNear: meta.damageNear ?? 100,
      damageFar: meta.damageFar ?? 1,
      falloffRange,
    });
  }

  public spawnOrbBurst(being: TransluminalShoggothBeing): void {
    if (!being?.attackProfile?.metadata) {
      return;
    }
    const meta = being.attackProfile.metadata as Partial<OrbBurstMetadata>;
    const orbCount = Math.max(1, Math.floor(meta.orbCount ?? 36));
    const orbSpeed = meta.orbSpeed ?? 10;
    const orbLifetime = Math.max(1, meta.orbLifetime ?? 100);
    const lifeSec = orbLifetime / Math.max(1, orbSpeed);
    const damage = meta.orbDamage ?? 50;

    for (let i = 0; i < orbCount; i++) {
      const dir = this.sampleFibonacciDirection(i, orbCount);
      this.projectiles.spawn({
        faction: 'enemy',
        sourceId: being.id,
        kind: 'orb',
        position: { ...being.position },
        velocity: { x: dir.x * orbSpeed, y: dir.y * orbSpeed, z: dir.z * orbSpeed },
        lifeSec,
        radius: DEFAULT_PROJECTILE_RADIUS * 1.25,
        damageNear: damage,
        damageFar: damage,
        falloffRange: orbLifetime,
      });
    }
  }

  public triggerAuraPulse(being: RiftVampireBeing): void {
    if (!being?.attackProfile?.metadata) {
      return;
    }
    const meta = being.attackProfile.metadata as Partial<AuraPulseMetadata>;
    const ship = this.engine.getPlayerShip();
    if (!ship) {
      return;
    }
    const radius = meta.auraRadius ?? being.attackProfile.maxRange ?? 1000;
    const distance = this.distance(being.position, ship.position);
    if (distance > radius) {
      return;
    }
    const damageNear = meta.damageNear ?? 10;
    const damageFar = meta.damageFar ?? 1;
    const damage = this.interpolateDamage(distance, radius, damageNear, damageFar);
    const applied = this.engine.applyShipDamage(damage, being.id, 'aura');
    if (applied > 0) {
      this.engine.logLesserBeingImpact(being.id, 'aura', applied);
    }
  }

  public handleBeingRemoved(beingId: string): void {
    this.projectiles.removeBySource(beingId);
  }

  private interpolateDamage(distance: number, maxDistance: number, near: number, far: number): number {
    if (maxDistance <= 0) {
      return Math.max(0, near);
    }
    const t = Math.min(1, Math.max(0, distance / maxDistance));
    const damage = near + (far - near) * t;
    return Math.max(0, damage);
  }

  private distance(a: Vector3, b: Vector3): number {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  private sampleFibonacciDirection(index: number, total: number): Vector3 {
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const theta = 2 * Math.PI * (index / goldenRatio);
    const z = 1 - (2 * (index + 0.5)) / total;
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    return {
      x: radius * Math.cos(theta),
      y: z,
      z: radius * Math.sin(theta)
    };
  }
}
