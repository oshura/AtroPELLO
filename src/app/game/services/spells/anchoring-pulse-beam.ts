import { Vector3 } from '../../../types/game.types';
import { Spaceship } from '../../game-objects/Spaceship';
import { Asteroid } from '../../game-objects/Asteroid';

/**
 * Haz de Anchoring Pulse: ancla un asteroide y lo arrastra hacia la nave hasta capturarlo (convertir a
 * carga). Posee el estado del haz y su lógica (start/update/finish); el motor conserva el render GL
 * leyendo `renderState`. Antes vivía en GameEngine; la lógica es idéntica. docs/ARQUITECTURA.md Fase 5.3.
 */
export interface AnchoringPulseBeamHost {
  getSpaceship(): Spaceship | null;
  getTargetPosition(target: Asteroid): Vector3 | null;
  makeAsteroidIndependent(target: Asteroid): void;
  isAsteroidTarget(target: unknown): target is Asteroid;
  convertAsteroidToCargo(target: Asteroid): boolean;
  logInfo(message: string, data?: unknown): void;
}

interface BeamState {
  active: boolean;
  target: Asteroid | null;
  startPos: Vector3;
  endPos: Vector3;
  startTime: number;
  maxDuration: number;
  pullSpeed: number;
  captureRadius: number;
}

export interface AnchoringBeamRenderState {
  startPos: Vector3;
  endPos: Vector3;
  startTime: number;
}

export class AnchoringPulseBeam {
  private beam: BeamState | null = null;

  get isActive(): boolean {
    return !!this.beam?.active;
  }

  /** Estado mínimo que el render GL del motor necesita (o null si no hay haz activo). */
  get renderState(): AnchoringBeamRenderState | null {
    if (!this.beam?.active) {
      return null;
    }
    return { startPos: this.beam.startPos, endPos: this.beam.endPos, startTime: this.beam.startTime };
  }

  start(host: AnchoringPulseBeamHost, target: Asteroid): void {
    const ship = host.getSpaceship();
    if (!ship || !target) {
      return;
    }
    const targetPos = host.getTargetPosition(target);
    if (!targetPos) {
      return;
    }
    try { host.makeAsteroidIndependent(target); } catch {}
    this.beam = {
      active: true,
      target,
      startPos: { ...ship.position },
      endPos: targetPos,
      startTime: performance.now(),
      maxDuration: Number.POSITIVE_INFINITY,
      pullSpeed: 2.0,
      captureRadius: 4.5,
    };
    host.logInfo('Anchoring Pulse beam engaged', {
      targetId: target.id,
      composition: (target as { composition?: unknown }).composition ?? 'unknown',
    });
  }

  update(host: AnchoringPulseBeamHost, deltaTime: number): void {
    const ship = host.getSpaceship();
    if (!this.beam?.active || !ship) {
      return;
    }
    const beam = this.beam;
    const target = beam.target;
    if (!target || !host.isAsteroidTarget(target)) {
      this.finish(host, 'canceled');
      return;
    }
    if (typeof target.isActive === 'function' && !target.isActive()) {
      this.finish(host, 'canceled');
      return;
    }
    beam.startPos = { ...ship.position };
    beam.endPos = { x: target.position.x, y: target.position.y, z: target.position.z };
    const elapsed = performance.now() - beam.startTime;
    if (elapsed > beam.maxDuration) {
      this.finish(host, 'expired');
      return;
    }
    const dx = ship.position.x - target.position.x;
    const dy = ship.position.y - target.position.y;
    const dz = ship.position.z - target.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= beam.captureRadius) {
      const stored = host.convertAsteroidToCargo(target);
      this.finish(host, stored ? 'converted' : 'canceled');
      return;
    }
    const step = Math.max(0, beam.pullSpeed * deltaTime);
    if (step > 0 && dist > 1e-3) {
      const ratio = Math.min(1, step / dist);
      target.position.x += dx * ratio;
      target.position.y += dy * ratio;
      target.position.z += dz * ratio;
      target.velocity.x = 0;
      target.velocity.y = 0;
      target.velocity.z = 0;
      target.angularVelocity.x = 0;
      target.angularVelocity.y = 0;
      target.angularVelocity.z = 0;
      target.updateModelMatrix();
      if (target.boundingSphere) {
        target.boundingSphere.center = { ...target.position };
      }
    }
  }

  finish(host: AnchoringPulseBeamHost, reason: 'converted' | 'expired' | 'canceled'): void {
    if (this.beam) {
      this.beam.active = false;
    }
    host.logInfo('Anchoring Pulse beam finished', { reason });
    this.beam = null;
  }
}
