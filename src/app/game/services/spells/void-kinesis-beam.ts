import { Vector3 } from '../../../types/game.types';
import { Spaceship } from '../../game-objects/Spaceship';
import { Asteroid } from '../../game-objects/Asteroid';

/**
 * Haz de Void Kinesis: encoge progresivamente un asteroide hasta que "se hace pixel" (o expira a los 6s)
 * y entonces lo convierte en energía del vacío. Posee el estado del haz + su lógica (start/update: el
 * encogido); la conversión (energía del vacío/HUD) la hace el motor vía `host.resolveConversion`. El motor
 * conserva el render GL leyendo `renderState`. Lógica idéntica a la del engine. Fase 5.3.
 */
export interface VoidKinesisBeamHost {
  getSpaceship(): Spaceship | null;
  isAsteroidTarget(target: Asteroid | null): boolean;
  resolveConversion(target: Asteroid): void;
  logInfo(message: string, data?: unknown): void;
}

interface BeamState {
  active: boolean;
  startPos: Vector3;
  endPos: Vector3;
  target: Asteroid | null;
  startTime: number;
  maxDuration: number;
  shrinkRate: number;
  currentScalar: number;
  minScalar: number;
  baseScale: Vector3;
  baseSize: number;
  pixelScalar: number;
}

export interface VoidKinesisBeamRenderState {
  startPos: Vector3;
  endPos: Vector3;
  startTime: number;
}

export class VoidKinesisBeam {
  private beam: BeamState | null = null;

  get isActive(): boolean {
    return !!this.beam?.active;
  }

  get renderState(): VoidKinesisBeamRenderState | null {
    if (!this.beam?.active) {
      return null;
    }
    return { startPos: this.beam.startPos, endPos: this.beam.endPos, startTime: this.beam.startTime };
  }

  start(host: VoidKinesisBeamHost, targetPos: Vector3, target: Asteroid): void {
    const ship = host.getSpaceship();
    if (!ship || !targetPos) {
      return;
    }
    const baseScale = {
      x: target.scale?.x ?? target.size,
      y: target.scale?.y ?? target.size,
      z: target.scale?.z ?? target.size,
    };
    const baseSize = target.size ?? 1;
    const pixelRadius = 0.02; // ≈1px in world space at typical camera distances
    const minScalar = Math.max(pixelRadius / Math.max(0.01, baseSize), 0.01);
    this.beam = {
      active: true,
      startPos: { ...ship.position },
      endPos: targetPos,
      target,
      startTime: performance.now(),
      maxDuration: 6000,
      shrinkRate: 0.85,
      currentScalar: 1,
      minScalar,
      baseScale,
      baseSize,
      pixelScalar: minScalar,
    };
    host.logInfo('Void Kinesis beam started', {
      targetId: target.id,
      voidMassUnits: (target as { voidMassUnits?: unknown }).voidMassUnits ?? null,
    });
  }

  update(host: VoidKinesisBeamHost, deltaTime: number): void {
    const ship = host.getSpaceship();
    if (!this.beam?.active || !ship) {
      return;
    }
    const beam = this.beam;
    const target = beam.target;
    if (!target || !host.isAsteroidTarget(target) || (typeof target.isActive === 'function' && !target.isActive())) {
      this.beam = null;
      return;
    }
    beam.startPos = { ...ship.position };
    beam.endPos = { ...target.position };

    const elapsed = performance.now() - beam.startTime;
    if (elapsed >= beam.maxDuration) {
      host.resolveConversion(target);
      this.beam = null;
      return;
    }

    // Shrink asteroid visually until it "pixels out"
    const shrinkAmount = beam.shrinkRate * deltaTime;
    beam.currentScalar = Math.max(beam.minScalar, beam.currentScalar - shrinkAmount);
    const appliedScalar = beam.currentScalar;
    target.scale = {
      x: beam.baseScale.x * appliedScalar,
      y: beam.baseScale.y * appliedScalar,
      z: beam.baseScale.z * appliedScalar,
    };
    target.size = Math.max(beam.baseSize * appliedScalar, beam.baseSize * beam.pixelScalar);
    target.updateModelMatrix();
    if (target.boundingSphere) {
      target.boundingSphere.radius = Math.max(0.01, target.size * 2);
    }

    if (beam.currentScalar <= beam.pixelScalar + 1e-3) {
      host.resolveConversion(target);
      this.beam = null;
    }
  }
}
