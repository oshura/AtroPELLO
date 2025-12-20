import { Injectable } from '@angular/core';
import { Vector3 } from '../../../types/game.types';
import { LandingStatus } from '../../types/landing.types';

export interface AutoLandEvaluationParams {
  landingStatus: LandingStatus | null | undefined;
  landingPilotGreen: boolean;
  shipVelocity: Vector3 | null | undefined;
}

interface ImpactDamageParams {
  speed: number;
  maxSpeed: number;
  impactAngleDeg: number;
}

@Injectable({ providedIn: 'root' })
export class AtmosphereFlightModelService {
  private readonly MAX_DAMAGE = 1000;
  private readonly MIN_DAMAGE = 50;
  private readonly MAX_ANGLE = 90;
  private readonly MIN_DAMAGE_ANGLE = 5;
  private readonly AUTOLAND_MAX_NORMAL_SPEED = 1;

  /**
   * Calcula el daño aplicado al chocar contra el suelo en función del ángulo y la velocidad.
   */
  calculateGroundImpactDamage(params: ImpactDamageParams): number {
    const { speed, maxSpeed, impactAngleDeg } = params;
    if (maxSpeed <= 0 || speed <= 0) {
      return 0;
    }

    const clampedAngle = Math.max(
      this.MIN_DAMAGE_ANGLE,
      Math.min(this.MAX_ANGLE, Math.abs(impactAngleDeg))
    );
    const angleT = (clampedAngle - this.MIN_DAMAGE_ANGLE) / (this.MAX_ANGLE - this.MIN_DAMAGE_ANGLE);
    const damageFromAngle = this.MIN_DAMAGE + angleT * (this.MAX_DAMAGE - this.MIN_DAMAGE);
    const speedFactor = Math.min(1, Math.max(0, speed / maxSpeed));
    const result = damageFromAngle * speedFactor;
    return Number.isFinite(result) ? Math.max(0, result) : 0;
  }

  /**
   * Determina la aceleración adicional (hacia el suelo) aplicada cuando la nave entra en stall.
   */
  computeStallAcceleration(speed: number): number {
    const absSpeed = Math.abs(speed);
    if (absSpeed < 1) {
      return 2; // +2u/s cuando la nave prácticamente está detenida
    }
    if (absSpeed < 2) {
      return 1; // +1u/s entre 1u y 2u
    }
    if (absSpeed < 3) {
      return 0.5; // +0.5u/s entre 2u y 3u
    }
    return 0;
  }

  /**
   * Determina si la colisión actual debería resolverse como autoland seguro.
   */
  shouldAutoLand(params: AutoLandEvaluationParams): boolean {
    if (!params?.landingPilotGreen) {
      return false;
    }
    const context = params.landingStatus?.context;
    if (!context || !params.shipVelocity) {
      return false;
    }
    const normal = context.surfaceNormal;
    const normalLen = Math.hypot(normal.x, normal.y, normal.z);
    if (!Number.isFinite(normalLen) || normalLen <= 0) {
      return false;
    }
    const nx = normal.x / normalLen;
    const ny = normal.y / normalLen;
    const nz = normal.z / normalLen;
    const vx = params.shipVelocity.x ?? 0;
    const vy = params.shipVelocity.y ?? 0;
    const vz = params.shipVelocity.z ?? 0;
    const projected = Math.abs(vx * nx + vy * ny + vz * nz);
    return projected < this.AUTOLAND_MAX_NORMAL_SPEED;
  }
}
