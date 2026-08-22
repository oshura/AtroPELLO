import { Vector3 } from '../../../types/game.types';
import { Spaceship } from '../../game-objects/Spaceship';
import { getWeaponHardpointLocalPosition } from '../../rendering/ship/ship-geometry';
import {
  ShipOutfitState,
  WeaponDefinition,
  WeaponId,
  WeaponsHudSnapshot,
} from '../../types/weapon.types';
import {
  ProjectileFaction,
  ProjectileGuidance,
  ProjectileImpact,
  ProjectileSystem,
  ProjectileSystemHost,
  ProjectileTargetLike,
  ProjectileView,
} from './projectile-system';
import { WeaponBeam, WeaponBeamHost, WeaponBeamRenderState } from './weapon-beam';
import {
  AsteroidClusterLike,
  collectNearbyClusterTargets,
  collectProjectileTargets,
  DamageableLike,
} from './weapon-targets';
import { MuzzleTransform, WeaponSystem, WeaponSystemHost } from './weapon-system';

/**
 * WeaponEngineBridge — une el armamento con el mundo (Fase 12 — docs/ARMAS.md).
 *
 * Aquí vive TODO el cableado que de otro modo engordaría `GameEngine`: qué puede recibir un
 * impacto, cómo se traduce un impacto en daño, de dónde sale la boca del cañón y qué pasa al
 * cambiar el equipamiento. El motor solo construye este puente con un contexto mínimo y delega.
 */

/** Lo que el puente necesita saber del motor. */
export interface WeaponBridgeContext {
  getShip(): Spaceship | null;
  /** Dirección del morro: es lo que marca la retícula de vector de vuelo. */
  getShipForward(): Vector3;
  /** Seres menores activos: los objetivos naturales del jugador. */
  getLesserBeings(): readonly DamageableLike[];
  /**
   * Otros blancos sueltos cerca de la nave (tortuga, asteroides sin cluster).
   * Deliberadamente NO incluye los miles de asteroides de cluster.
   */
  getLooseTargets(): ReadonlyArray<ReadonlyArray<DamageableLike | null | undefined> | null | undefined>;
  /** Cúmulos de asteroides: se filtran por alcance antes de considerarlos blancos. */
  getAsteroidClusters(): ReadonlyArray<AsteroidClusterLike | null | undefined>;
  getSelectedTarget(): { id: string; position: Vector3 } | null;
  /** Rayo del cursor hacia el mundo (minas dirigidas con el ratón). */
  getMouseRay(): { origin: Vector3; direction: Vector3 } | null;
  applyObjectDamage(target: DamageableLike, damage: number): void;
  applyShipDamage(damage: number, sourceId: string, kind: string): number;
  logBeingImpact(sourceId: string, kind: string, applied: number): void;
  consumeVoidEnergy(amount: number): boolean;
  emitWarning(message: string): void;
  playSfx(clip: string): void;
  /** El equipamiento cambió: persistirlo y reconstruir la malla de la nave. */
  onOutfitChanged(outfit: ShipOutfitState): void;
  /** ¿Los controles de combate están bloqueados (cinemática, ritual…)? */
  areInputsLocked(): boolean;
  logInfo(message: string, data?: unknown): void;
  logDebug(message: string, data?: unknown): void;
}

/** Alcance dentro del cual un asteroide de cúmulo cuenta como blanco (el arma más larga llega a 3000 u). */
const CLUSTER_TARGET_RANGE_U = 3500;

export class WeaponEngineBridge {
  private readonly projectiles = new ProjectileSystem();
  private readonly weapons = new WeaponSystem();
  private readonly playerTargets: ProjectileTargetLike[] = [];
  private readonly playerTargetsById = new Map<string, DamageableLike>();
  private readonly shipTarget: ProjectileTargetLike[] = [];
  private readonly clusterTargets: DamageableLike[] = [];
  private readonly beam = new WeaponBeam();
  private beamSlotIndex = 0;
  private readonly scratchMuzzle: MuzzleTransform = {
    position: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 0, z: 1 },
  };
  private readonly beamHost: WeaponBeamHost = {
    getTargets: () => this.collectTargets('player'),
    applyBeamDamage: (targetId, damage) => {
      const target = this.playerTargetsById.get(targetId);
      if (!target) return 0;
      this.ctx.applyObjectDamage(target, damage);
      return damage;
    },
    consumeVoidEnergy: (amount) => this.ctx.consumeVoidEnergy(amount),
    emitWarning: (message) => this.ctx.emitWarning(message),
    logInfo: (message, data) => this.ctx.logInfo(message, data),
  };

  private readonly projectileHost: ProjectileSystemHost = {
    getTargets: (faction) => this.collectTargets(faction),
    applyDamage: (impact) => this.resolveImpact(impact),
    getGuidancePoint: (projectile, guidance) => this.resolveGuidancePoint(projectile, guidance),
    logInfo: (message, data) => this.ctx.logDebug(message, data),
  };

  private readonly weaponHost: WeaponSystemHost = {
    getMuzzle: (slotIndex, out) => this.resolveMuzzle(slotIndex, out),
    getSelectedTargetId: () => this.ctx.getSelectedTarget()?.id ?? null,
    getSelectedTargetPosition: () => this.ctx.getSelectedTarget()?.position ?? null,
    consumeVoidEnergy: (amount) => this.ctx.consumeVoidEnergy(amount),
    spawnProjectile: (request) => this.projectiles.spawn(request),
    startBeam: (definition, slotIndex) => this.startBeam(definition, slotIndex),
    stopBeam: () => this.beam.stop(),
    getGuidedProjectileCount: () => this.projectiles.countGuided('player'),
    emitWarning: (message) => this.ctx.emitWarning(message),
    playSfx: (clip) => this.ctx.playSfx(clip),
    logInfo: (message, data) => this.ctx.logInfo(message, data),
  };

  constructor(private readonly ctx: WeaponBridgeContext) {}

  /** Pool compartido: los seres menores disparan por aquí (facción `enemy`). */
  public get projectileSystem(): ProjectileSystem {
    return this.projectiles;
  }

  public get installedCount(): number {
    return this.weapons.installedCount;
  }

  public update(deltaTime: number): void {
    this.weapons.update(this.weaponHost);
    this.updateBeam(deltaTime);
    this.projectiles.update(this.projectileHost, deltaTime);
  }

  /** Estado de dibujo del haz continuo, o null si no hay ninguno activo. */
  public getBeamRenderState(): WeaponBeamRenderState | null {
    return this.beam.renderState;
  }

  private startBeam(definition: WeaponDefinition, slotIndex: number): boolean {
    this.beamSlotIndex = slotIndex;
    return this.beam.isActive && this.beam.activeWeaponId === definition.id
      ? true
      : this.beam.start(definition);
  }

  private updateBeam(deltaTime: number): void {
    if (!this.beam.isActive) {
      return;
    }
    // Soltar el gatillo o cambiar de arma apaga el haz.
    if (!this.weapons.shouldBeamStayActive()) {
      this.beam.stop();
      return;
    }
    if (!this.resolveMuzzle(this.beamSlotIndex, this.scratchMuzzle)) {
      this.beam.stop();
      return;
    }
    this.beam.update(this.beamHost, this.scratchMuzzle.position, this.scratchMuzzle.direction, deltaTime);
  }

  /**
   * Punto hacia el que vira un proyectil guiado.
   * - `target`: la posición actual del blanco enganchado (si murió, sigue recto).
   * - `mouse`: el punto del rayo del cursor a la misma distancia a la que ya vuela el dron, de modo
   *   que el jugador lo "pasea" moviendo el ratón.
   */
  private resolveGuidancePoint(projectile: ProjectileView, guidance: ProjectileGuidance): Vector3 | null {
    if (guidance.targetId) {
      // El mapa de candidatos se acaba de rellenar en este mismo frame; si el blanco no está,
      // es que ha muerto y el proyectil sigue recto.
      const target = this.playerTargetsById.get(guidance.targetId);
      if (target) {
        return target.position;
      }
      if (guidance.mode === 'target') {
        return null;
      }
    }
    if (guidance.mode !== 'mouse') {
      return null;
    }
    const ray = this.ctx.getMouseRay();
    const ship = this.ctx.getShip();
    if (!ray || !ship) {
      return null;
    }
    const distance = Math.hypot(
      projectile.position.x - ship.position.x,
      projectile.position.y - ship.position.y,
      projectile.position.z - ship.position.z
    );
    const reach = Math.max(40, distance);
    return {
      x: ray.origin.x + ray.direction.x * reach,
      y: ray.origin.y + ray.direction.y * reach,
      z: ray.origin.z + ray.direction.z * reach,
    };
  }

  /** Vistas de render de todos los proyectiles vivos, o null si no hay ninguno. */
  public getRenderViews(): ProjectileView[] | null {
    if (!this.projectiles.activeCount) {
      return null;
    }
    const views = this.projectiles.getViews('player').concat(this.projectiles.getViews('enemy'));
    return views.length ? views : null;
  }

  public buildHudSnapshot(now?: number): WeaponsHudSnapshot {
    return this.weapons.buildHudSnapshot(this.weaponHost, now);
  }

  /** Rota el arma seleccionada. Devuelve la nueva selección para el aviso del HUD. */
  public cycle(previous: boolean): WeaponDefinition | null {
    if (this.ctx.areInputsLocked()) {
      return null;
    }
    return this.weapons.cycle(previous);
  }

  public setTriggerHeld(held: boolean): void {
    this.weapons.setTriggerHeld(held && !this.ctx.areInputsLocked());
  }

  /** Monta un arma; abre un hardpoint si la nave aún no tenía ninguno. */
  public install(weaponId: WeaponId, slotIndex?: number): boolean {
    if (this.weapons.slotsMax <= 0) {
      this.weapons.setWeaponSlots(1);
    }
    const installed = this.weapons.installWeapon(weaponId, slotIndex);
    if (installed) {
      this.syncOutfit();
    }
    return installed;
  }

  public getOutfit(): ShipOutfitState {
    return this.weapons.getState();
  }

  public applyOutfit(outfit: ShipOutfitState | null | undefined): void {
    this.weapons.applyState(outfit);
    this.projectiles.clearFaction('player');
    this.syncOutfit();
  }

  public clearProjectiles(): void {
    this.projectiles.clear();
  }

  private syncOutfit(): void {
    this.ctx.onOutfitChanged(this.weapons.getState());
  }

  private collectTargets(faction: ProjectileFaction): readonly ProjectileTargetLike[] {
    if (faction === 'enemy') {
      this.shipTarget.length = 0;
      const ship = this.ctx.getShip();
      if (ship) {
        this.shipTarget.push({
          id: ship.id,
          position: ship.position,
          radius: ship.boundingSphere?.radius ?? 20,
        });
      }
      return this.shipTarget;
    }
    const ship = this.ctx.getShip();
    if (ship) {
      collectNearbyClusterTargets(
        this.ctx.getAsteroidClusters(),
        ship.position,
        CLUSTER_TARGET_RANGE_U,
        this.clusterTargets
      );
    } else {
      this.clusterTargets.length = 0;
    }
    collectProjectileTargets(
      [this.ctx.getLesserBeings(), ...this.ctx.getLooseTargets(), this.clusterTargets],
      this.playerTargets,
      this.playerTargetsById
    );
    return this.playerTargets;
  }

  private resolveImpact(impact: ProjectileImpact): number {
    if (impact.faction === 'enemy') {
      const applied = this.ctx.applyShipDamage(impact.damage, impact.sourceId, impact.kind);
      if (applied > 0) {
        this.ctx.logBeingImpact(impact.sourceId, impact.kind, applied);
      }
      return applied;
    }
    const target = this.playerTargetsById.get(impact.targetId);
    if (!target) {
      return 0;
    }
    this.ctx.applyObjectDamage(target, impact.damage);
    return impact.damage;
  }

  private resolveMuzzle(slotIndex: number, out: MuzzleTransform): boolean {
    const ship = this.ctx.getShip();
    if (!ship) {
      return false;
    }
    const local = getWeaponHardpointLocalPosition(slotIndex);
    if (local) {
      ship.transformLocalPoint({ x: local[0], y: local[1], z: local[2] }, out.position);
    } else {
      out.position.x = ship.position.x;
      out.position.y = ship.position.y;
      out.position.z = ship.position.z;
    }
    const forward = this.ctx.getShipForward();
    out.direction.x = forward.x;
    out.direction.y = forward.y;
    out.direction.z = forward.z;
    return true;
  }
}
