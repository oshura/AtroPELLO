import { Vector3 } from '../../../types/game.types';
import { clamp, sweptSphereHit } from '../../math/vector-math';

/**
 * ProjectileSystem — pool ÚNICO de proyectiles del juego (Fase 12 — docs/ARMAS.md).
 *
 * Generaliza por facción el pool que sólo tenían los seres menores: integra posiciones, resuelve
 * impactos con barrido continuo (un gauss recorre ~19 u por frame: comprobar sólo la posición
 * final lo haría atravesar objetivos), aplica caída de daño con la distancia y expone vistas
 * inmutables para el render.
 *
 * Es agnóstico de contra QUÉ choca: el host entrega los candidatos de cada facción y aplica el
 * daño. Así el jugador dispara a los seres menores y los seres menores a la nave con el mismo
 * código.
 *
 * Patrón: clase plana sin DI (docs/ARQUITECTURA.md §5.3).
 */

export type ProjectileFaction = 'player' | 'enemy';

/** Guiado del proyectil: hacia un objetivo enganchado o hacia el punto que marca el cursor. */
export type ProjectileGuidanceMode = 'target' | 'mouse';

/** Candidato de colisión, tal y como lo ve el pool. */
export interface ProjectileTargetLike {
  id: string;
  position: Vector3;
  /** Radio de colisión efectivo. */
  radius: number;
}

export interface ProjectileGuidance {
  mode: ProjectileGuidanceMode;
  /** Objetivo enganchado (modo 'target', o 'mouse' tras engancharse). */
  targetId?: string;
  /** Giro máximo en radianes por segundo. */
  turnRateRad: number;
  /** Segundos de guiado restantes; al agotarse el proyectil sigue recto. */
  remainingSec: number;
  /** Radio de enganche automático a un hostil (modo 'mouse'). */
  lockRadius?: number;
}

/** Petición de disparo hacia el pool. */
export interface ProjectileSpawnRequest {
  faction: ProjectileFaction;
  /** Quién dispara: nave del jugador o id del ser menor. */
  sourceId: string;
  /** Etiqueta de render y de log ('GAUSS_ICE', 'acid_spit', 'orb'…). */
  kind: string;
  position: Vector3;
  velocity: Vector3;
  lifeSec: number;
  radius: number;
  /** Daño a bocajarro. */
  damageNear: number;
  /** Daño en el límite de `falloffRange`. Igualar a `damageNear` para daño plano. */
  damageFar: number;
  falloffRange: number;
  /** Radio de detonación: reparte daño con caída a todo lo que haya dentro. */
  blastRadius?: number;
  guidance?: ProjectileGuidance;
  color?: [number, number, number];
  trail?: boolean;
  glowScale?: number;
}

interface Projectile extends ProjectileSpawnRequest {
  id: string;
  remainingLife: number;
  maxLife: number;
}

/** Vista inmutable para el render (una por frame). */
export interface ProjectileView {
  id: string;
  faction: ProjectileFaction;
  kind: string;
  position: Vector3;
  velocity: Vector3;
  remainingLife: number;
  maxLife: number;
  radius: number;
  sourceId: string;
  color: [number, number, number];
  trail: boolean;
  glowScale: number;
}

export interface ProjectileImpact {
  faction: ProjectileFaction;
  sourceId: string;
  targetId: string;
  kind: string;
  damage: number;
  position: Vector3;
}

export interface ProjectileSystemHost {
  /**
   * Candidatos de colisión de esa facción. Se invoca como mucho una vez por frame y sólo si hay
   * proyectiles vivos: puede (y debe) devolver un array reutilizado.
   */
  getTargets(faction: ProjectileFaction): readonly ProjectileTargetLike[];
  /** Aplica el daño y devuelve el realmente aplicado (0 si el objetivo era inmune o ya estaba muerto). */
  applyDamage(impact: ProjectileImpact): number;
  /**
   * Punto hacia el que debe virar un proyectil guiado, o null si perdió la guía.
   * En S1 nadie guía: devolver null es correcto.
   */
  getGuidancePoint(projectile: ProjectileView, guidance: ProjectileGuidance): Vector3 | null;
  logInfo(message: string, data?: unknown): void;
}

const MIN_LIFE_SEC = 0.01;

export class ProjectileSystem {
  private projectiles: Projectile[] = [];
  private nextId = 1;
  /** Buffer reutilizado para no crear objetos en el camino caliente. */
  private readonly scratchPrevPosition: Vector3 = { x: 0, y: 0, z: 0 };

  public get activeCount(): number {
    return this.projectiles.length;
  }

  public countFaction(faction: ProjectileFaction): number {
    let total = 0;
    for (const p of this.projectiles) {
      if (p.faction === faction) total++;
    }
    return total;
  }

  /** Proyectiles guiados vivos (los que el HUD anuncia como "GUIADO xN"). */
  public countGuided(faction: ProjectileFaction): number {
    let total = 0;
    for (const p of this.projectiles) {
      if (p.faction === faction && p.guidance) total++;
    }
    return total;
  }

  public spawn(request: ProjectileSpawnRequest): void {
    const life = Math.max(MIN_LIFE_SEC, request.lifeSec);
    this.projectiles.push({
      ...request,
      position: { ...request.position },
      velocity: { ...request.velocity },
      guidance: request.guidance ? { ...request.guidance } : undefined,
      id: `${request.faction}-${request.kind}-${this.nextId++}`,
      remainingLife: life,
      maxLife: life,
    });
  }

  public update(host: ProjectileSystemHost, deltaTime: number): void {
    if (!this.projectiles.length || deltaTime <= 0) {
      return;
    }
    let playerTargets: readonly ProjectileTargetLike[] | null = null;
    let enemyTargets: readonly ProjectileTargetLike[] | null = null;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      const targets =
        projectile.faction === 'player'
          ? (playerTargets ??= host.getTargets('player'))
          : (enemyTargets ??= host.getTargets('enemy'));

      this.steer(host, projectile, targets, deltaTime);

      this.scratchPrevPosition.x = projectile.position.x;
      this.scratchPrevPosition.y = projectile.position.y;
      this.scratchPrevPosition.z = projectile.position.z;
      projectile.position.x += projectile.velocity.x * deltaTime;
      projectile.position.y += projectile.velocity.y * deltaTime;
      projectile.position.z += projectile.velocity.z * deltaTime;
      projectile.remainingLife -= deltaTime;

      const hit = this.findHit(projectile, targets, this.scratchPrevPosition);
      if (hit) {
        this.resolveImpact(host, projectile, hit, targets);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (projectile.remainingLife <= 0) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  /** Vistas para el render de una facción. Devuelve [] sin allocar si no hay ninguna. */
  public getViews(faction: ProjectileFaction): ProjectileView[] {
    if (!this.projectiles.length) {
      return [];
    }
    const views: ProjectileView[] = [];
    for (const p of this.projectiles) {
      if (p.faction !== faction) continue;
      views.push(this.toView(p));
    }
    return views;
  }

  /** Retira los proyectiles de una fuente concreta (un ser menor que desaparece). */
  public removeBySource(sourceId: string): void {
    this.projectiles = this.projectiles.filter(p => p.sourceId !== sourceId);
  }

  public clearFaction(faction: ProjectileFaction): void {
    this.projectiles = this.projectiles.filter(p => p.faction !== faction);
  }

  public clear(): void {
    this.projectiles.length = 0;
  }

  private steer(
    host: ProjectileSystemHost,
    projectile: Projectile,
    targets: readonly ProjectileTargetLike[],
    deltaTime: number
  ): void {
    const guidance = projectile.guidance;
    if (!guidance) {
      return;
    }
    guidance.remainingSec -= deltaTime;
    if (guidance.remainingSec <= 0) {
      projectile.guidance = undefined; // a la deriva: sigue recto hasta expirar
      return;
    }
    if (guidance.mode === 'mouse' && !guidance.targetId && guidance.lockRadius) {
      const locked = this.findNearestTarget(projectile.position, targets, guidance.lockRadius);
      if (locked) {
        guidance.targetId = locked.id;
        host.logInfo('Proyectil guiado enganchado a un objetivo', {
          projectile: projectile.id,
          target: locked.id,
        });
      }
    }
    const point = host.getGuidancePoint(this.toView(projectile), guidance);
    if (!point) {
      return;
    }
    const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y, projectile.velocity.z);
    if (speed <= 1e-6) {
      return;
    }
    const dx = point.x - projectile.position.x;
    const dy = point.y - projectile.position.y;
    const dz = point.z - projectile.position.z;
    const desiredLen = Math.hypot(dx, dy, dz);
    if (desiredLen <= 1e-6) {
      return;
    }
    const desired = { x: dx / desiredLen, y: dy / desiredLen, z: dz / desiredLen };
    const current = {
      x: projectile.velocity.x / speed,
      y: projectile.velocity.y / speed,
      z: projectile.velocity.z / speed,
    };
    const dot = clamp(current.x * desired.x + current.y * desired.y + current.z * desired.z, -1, 1);
    const angle = Math.acos(dot);
    const maxTurn = Math.max(0, guidance.turnRateRad) * deltaTime;
    let dir = desired;
    if (angle > maxTurn && angle > 1e-6) {
      const t = maxTurn / angle;
      const mixed = {
        x: current.x + (desired.x - current.x) * t,
        y: current.y + (desired.y - current.y) * t,
        z: current.z + (desired.z - current.z) * t,
      };
      const len = Math.hypot(mixed.x, mixed.y, mixed.z) || 1;
      dir = { x: mixed.x / len, y: mixed.y / len, z: mixed.z / len };
    }
    projectile.velocity.x = dir.x * speed;
    projectile.velocity.y = dir.y * speed;
    projectile.velocity.z = dir.z * speed;
  }

  private findHit(
    projectile: Projectile,
    targets: readonly ProjectileTargetLike[],
    previousPosition: Vector3
  ): ProjectileTargetLike | null {
    for (const target of targets) {
      if (target.id === projectile.sourceId) continue;
      if (sweptSphereHit(previousPosition, projectile.position, target.position, target.radius, projectile.radius)) {
        return target;
      }
    }
    return null;
  }

  private resolveImpact(
    host: ProjectileSystemHost,
    projectile: Projectile,
    hit: ProjectileTargetLike,
    targets: readonly ProjectileTargetLike[]
  ): void {
    const blast = projectile.blastRadius ?? 0;
    if (blast <= 0) {
      const damage = this.interpolateDamage(
        this.distance(projectile.position, hit.position),
        projectile.falloffRange,
        projectile.damageNear,
        projectile.damageFar
      );
      this.applyDamage(host, projectile, hit.id, damage);
      return;
    }
    for (const target of targets) {
      if (target.id === projectile.sourceId) continue;
      const distance = this.distance(projectile.position, target.position);
      if (distance > blast + target.radius) continue;
      const damage = this.interpolateDamage(distance, blast, projectile.damageNear, projectile.damageFar);
      this.applyDamage(host, projectile, target.id, damage);
    }
  }

  private applyDamage(
    host: ProjectileSystemHost,
    projectile: Projectile,
    targetId: string,
    damage: number
  ): void {
    if (damage <= 0) {
      return;
    }
    host.applyDamage({
      faction: projectile.faction,
      sourceId: projectile.sourceId,
      targetId,
      kind: projectile.kind,
      damage,
      position: { ...projectile.position },
    });
  }

  private findNearestTarget(
    position: Vector3,
    targets: readonly ProjectileTargetLike[],
    maxDistance: number
  ): ProjectileTargetLike | null {
    let best: ProjectileTargetLike | null = null;
    let bestDistance = maxDistance;
    for (const target of targets) {
      const distance = this.distance(position, target.position);
      if (distance <= bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }
    return best;
  }

  private toView(projectile: Projectile): ProjectileView {
    return {
      id: projectile.id,
      faction: projectile.faction,
      kind: projectile.kind,
      position: { ...projectile.position },
      velocity: { ...projectile.velocity },
      remainingLife: projectile.remainingLife,
      maxLife: projectile.maxLife,
      radius: projectile.radius,
      sourceId: projectile.sourceId,
      color: projectile.color ?? [1, 1, 1],
      trail: projectile.trail ?? false,
      glowScale: projectile.glowScale ?? 1,
    };
  }

  private interpolateDamage(distance: number, maxDistance: number, near: number, far: number): number {
    if (maxDistance <= 0) {
      return Math.max(0, near);
    }
    const t = clamp(distance / maxDistance, 0, 1);
    return Math.max(0, near + (far - near) * t);
  }

  private distance(a: Vector3, b: Vector3): number {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }
}
