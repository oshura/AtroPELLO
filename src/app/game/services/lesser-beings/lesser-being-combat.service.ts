import { GameEngine } from '../../GameEngine';
import { Vector3 } from '../../../types/game.types';
import { StellarSeedBeing } from '../../game-objects/lesser-beings/stellar-seed-being';
import { TransluminalShoggothBeing } from '../../game-objects/lesser-beings/transluminal-shoggoth-being';
import { RiftVampireBeing } from '../../game-objects/lesser-beings/rift-vampire-being';
import { Spaceship } from '../../game-objects/Spaceship';

interface ProjectileInstance {
  id: string;
  kind: 'acid_spit' | 'orb';
  position: Vector3;
  velocity: Vector3;
  remainingLife: number;
  maxLife: number;
  damageNear: number;
  damageFar: number;
  falloffRange: number;
  sourceId: string;
  radius: number;
}

export interface LesserBeingProjectileView {
  id: string;
  kind: ProjectileInstance['kind'];
  position: Vector3;
  velocity: Vector3;
  remainingLife: number;
  maxLife: number;
  radius: number;
  sourceId: string;
}

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
  private projectiles: ProjectileInstance[] = [];

  constructor(private readonly engine: GameEngine) {}

  public update(deltaTime: number): void {
    if (!this.projectiles.length) {
      return;
    }
    const ship = this.engine.getPlayerShip();
    if (!ship) {
      this.despawnAllProjectiles();
      return;
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.position.x += projectile.velocity.x * deltaTime;
      projectile.position.y += projectile.velocity.y * deltaTime;
      projectile.position.z += projectile.velocity.z * deltaTime;
      projectile.remainingLife -= deltaTime;

      if (this.intersectsShip(projectile, ship)) {
        const damage = this.computeDamage(projectile, ship.position);
        const applied = this.engine.applyShipDamage(damage, projectile.sourceId, projectile.kind);
        this.projectiles.splice(i, 1);
        if (applied > 0) {
          this.engine.logLesserBeingImpact(projectile.sourceId, projectile.kind, applied);
        }
        continue;
      }

      if (projectile.remainingLife <= 0) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  public fireAcidSpit(being: StellarSeedBeing, direction: Vector3): void {
    if (!being?.attackProfile?.metadata) {
      return;
    }
    const meta = being.attackProfile.metadata as Partial<AcidSpitMetadata>;
    const speed = meta.projectileSpeed ?? 120;
    const falloffRange = meta.falloffRange ?? being.attackProfile.maxRange ?? 200;
    const maxLife = falloffRange / Math.max(1, speed);
    const projectile: ProjectileInstance = {
      id: `${being.id}-acid-${Date.now()}`,
      kind: 'acid_spit',
      position: { ...being.position },
      velocity: {
        x: direction.x * speed,
        y: direction.y * speed,
        z: direction.z * speed
      },
      remainingLife: maxLife,
      maxLife,
      damageNear: meta.damageNear ?? 100,
      damageFar: meta.damageFar ?? 1,
      falloffRange,
      sourceId: being.id,
      radius: DEFAULT_PROJECTILE_RADIUS
    };
    this.projectiles.push(projectile);
  }

  public spawnOrbBurst(being: TransluminalShoggothBeing): void {
    if (!being?.attackProfile?.metadata) {
      return;
    }
    const meta = being.attackProfile.metadata as Partial<OrbBurstMetadata>;
    const orbCount = Math.max(1, Math.floor(meta.orbCount ?? 36));
    const orbSpeed = meta.orbSpeed ?? 10;
    const orbLifetime = Math.max(1, meta.orbLifetime ?? 100);
    const maxLife = orbLifetime / Math.max(1, orbSpeed);
    const damage = meta.orbDamage ?? 50;

    for (let i = 0; i < orbCount; i++) {
      const dir = this.sampleFibonacciDirection(i, orbCount);
      const projectile: ProjectileInstance = {
        id: `${being.id}-orb-${Date.now()}-${i}`,
        kind: 'orb',
        position: { ...being.position },
        velocity: { x: dir.x * orbSpeed, y: dir.y * orbSpeed, z: dir.z * orbSpeed },
        remainingLife: maxLife,
        maxLife,
        damageNear: damage,
        damageFar: damage,
        falloffRange: orbLifetime,
        sourceId: being.id,
        radius: DEFAULT_PROJECTILE_RADIUS * 1.25
      };
      this.projectiles.push(projectile);
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
    this.projectiles = this.projectiles.filter(p => p.sourceId !== beingId);
  }

  public getActiveProjectiles(): LesserBeingProjectileView[] {
    if (!this.projectiles.length) {
      return [];
    }
    return this.projectiles.map(projectile => ({
      id: projectile.id,
      kind: projectile.kind,
      position: { ...projectile.position },
      velocity: { ...projectile.velocity },
      remainingLife: projectile.remainingLife,
      maxLife: projectile.maxLife,
      radius: projectile.radius,
      sourceId: projectile.sourceId
    }));
  }

  private despawnAllProjectiles(): void {
    this.projectiles.length = 0;
  }

  private intersectsShip(projectile: ProjectileInstance, ship: Spaceship): boolean {
    const shipRadius = ship.boundingSphere?.radius ?? 20;
    const dx = projectile.position.x - ship.position.x;
    const dy = projectile.position.y - ship.position.y;
    const dz = projectile.position.z - ship.position.z;
    const radii = shipRadius + projectile.radius;
    return (dx * dx + dy * dy + dz * dz) <= radii * radii;
  }

  private computeDamage(projectile: ProjectileInstance, shipPos: Vector3): number {
    const distance = this.distance(projectile.position, shipPos);
    return this.interpolateDamage(distance, projectile.falloffRange, projectile.damageNear, projectile.damageFar);
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
