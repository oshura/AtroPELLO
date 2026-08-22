import { Vector3 } from '../../../types/game.types';
import { raySphereHit } from '../../math/vector-math';
import { WeaponBeamSpec, WeaponDefinition } from '../../types/weapon.types';
import { ProjectileTargetLike } from './projectile-system';

/**
 * WeaponBeam — haz continuo del jugador (Fase 12 — docs/ARMAS.md).
 *
 * Mientras el gatillo esté sostenido, proyecta un rayo desde la boca del arma y aplica daño por
 * segundo al primer objetivo que corta. Es el patrón de los haces de hechizo (§5.3 de
 * ARQUITECTURA): clase plana con `renderState` que el motor solo dibuja.
 */

export interface WeaponBeamRenderState {
  startPos: Vector3;
  endPos: Vector3;
  color: [number, number, number];
  widthU: number;
  /** 0..1, sube al enganchar un objetivo: el render lo usa para intensificar el haz. */
  intensity: number;
}

export interface WeaponBeamHost {
  /** Objetivos candidatos del jugador (los mismos que usan los proyectiles). */
  getTargets(): readonly ProjectileTargetLike[];
  applyBeamDamage(targetId: string, damage: number): number;
  /** Descuenta energía del vacío; false si no queda. */
  consumeVoidEnergy(amount: number): boolean;
  emitWarning(message: string): void;
  logInfo(message: string, data?: unknown): void;
}

export class WeaponBeam {
  private definition: WeaponDefinition | null = null;
  private spec: WeaponBeamSpec | null = null;
  private elapsedMs = 0;
  private readonly state: WeaponBeamRenderState = {
    startPos: { x: 0, y: 0, z: 0 },
    endPos: { x: 0, y: 0, z: 0 },
    color: [1, 1, 1],
    widthU: 0.4,
    intensity: 0,
  };

  public get isActive(): boolean {
    return this.definition !== null;
  }

  public get renderState(): WeaponBeamRenderState | null {
    return this.definition ? this.state : null;
  }

  public get activeWeaponId(): string | null {
    return this.definition?.id ?? null;
  }

  public start(definition: WeaponDefinition): boolean {
    if (!definition.beam) {
      return false;
    }
    this.definition = definition;
    this.spec = definition.beam;
    this.elapsedMs = 0;
    this.state.color = definition.beam.color;
    this.state.widthU = definition.beam.widthU;
    this.state.intensity = 0;
    return true;
  }

  public stop(): void {
    this.definition = null;
    this.spec = null;
    this.elapsedMs = 0;
    this.state.intensity = 0;
  }

  /**
   * Actualiza el haz un frame. Devuelve false si debe apagarse (duración agotada o sin energía).
   * `origin` y `direction` son la boca del arma y hacia dónde mira, en coordenadas de mundo.
   */
  public update(
    host: WeaponBeamHost,
    origin: Vector3,
    direction: Vector3,
    deltaTime: number
  ): boolean {
    const definition = this.definition;
    const spec = this.spec;
    if (!definition || !spec || deltaTime <= 0) {
      return false;
    }
    this.elapsedMs += deltaTime * 1000;
    if (spec.maxDurationMs && this.elapsedMs >= spec.maxDurationMs) {
      this.stop();
      return false;
    }
    const upkeep = (definition.voidEnergyCostPerShot ?? 0) * deltaTime;
    if (upkeep > 0 && !host.consumeVoidEnergy(upkeep)) {
      host.emitWarning('SIN ENERGÍA DEL VACÍO');
      this.stop();
      return false;
    }

    const range = definition.rangeU;
    const hit = this.findFirstHit(host.getTargets(), origin, direction, range);
    const reach = hit ? hit.distance : range;

    this.state.startPos.x = origin.x;
    this.state.startPos.y = origin.y;
    this.state.startPos.z = origin.z;
    this.state.endPos.x = origin.x + direction.x * reach;
    this.state.endPos.y = origin.y + direction.y * reach;
    this.state.endPos.z = origin.z + direction.z * reach;
    this.state.intensity = hit ? 1 : 0.45;

    if (hit) {
      host.applyBeamDamage(hit.target.id, spec.dps * deltaTime);
    }
    return true;
  }

  private findFirstHit(
    targets: readonly ProjectileTargetLike[],
    origin: Vector3,
    direction: Vector3,
    range: number
  ): { target: ProjectileTargetLike; distance: number } | null {
    let best: { target: ProjectileTargetLike; distance: number } | null = null;
    for (const target of targets) {
      const distance = raySphereHit(origin, direction, target.position, target.radius);
      if (distance === null || distance > range) {
        continue;
      }
      if (!best || distance < best.distance) {
        best = { target, distance };
      }
    }
    return best;
  }
}
