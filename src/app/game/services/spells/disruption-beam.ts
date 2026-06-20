import { Vector3 } from '../../../types/game.types';
import { Spaceship } from '../../game-objects/Spaceship';
import { ITargetable } from '../../types/targeting.types';

/**
 * Haz del Rito de Disrupción Material: traza una línea de la nave al objetivo durante 1,5s y, al
 * expirar, destruye el asteroide (daño letal). Posee el estado del haz + su lógica (start/update); el
 * motor conserva el render GL leyendo `renderState`. Lógica idéntica a la del engine. Fase 5.3.
 */
export interface DisruptionBeamHost {
  getSpaceship(): Spaceship | null;
  isAsteroidTarget(target: ITargetable | null): boolean;
  applyDamageToObject(target: ITargetable, damage: number): void;
  logInfo(message: string, data?: unknown): void;
}

interface BeamState {
  active: boolean;
  startPos: Vector3;
  endPos: Vector3;
  target: ITargetable | null;
  startTime: number;
  duration: number;
}

export interface DisruptionBeamRenderState {
  startPos: Vector3;
  endPos: Vector3;
  startTime: number;
  duration: number;
}

export class DisruptionBeam {
  private beam: BeamState | null = null;

  get isActive(): boolean {
    return !!this.beam?.active;
  }

  get renderState(): DisruptionBeamRenderState | null {
    if (!this.beam?.active) {
      return null;
    }
    return {
      startPos: this.beam.startPos,
      endPos: this.beam.endPos,
      startTime: this.beam.startTime,
      duration: this.beam.duration,
    };
  }

  start(host: DisruptionBeamHost, targetPos: Vector3, target: ITargetable | null): void {
    const ship = host.getSpaceship();
    if (!ship) {
      return;
    }
    // Get ship's cockpit position (forward from center)
    const shipPos = { ...ship.position };
    this.beam = {
      active: true,
      startPos: shipPos,
      endPos: targetPos,
      target,
      startTime: performance.now(),
      duration: 1500, // 1.5 seconds beam duration
    };
    host.logInfo('Disruption beam started', {
      distance: Math.hypot(targetPos.x - shipPos.x, targetPos.y - shipPos.y, targetPos.z - shipPos.z),
    });
  }

  update(host: DisruptionBeamHost): void {
    if (!this.beam || !this.beam.active) {
      return;
    }
    const now = performance.now();
    const elapsed = now - this.beam.startTime;

    // Recalculate beam positions each frame (ship and target move)
    const ship = host.getSpaceship();
    if (ship) {
      this.beam.startPos = { ...ship.position };
    }
    const targetPos = (this.beam.target as { position?: Vector3 } | null)?.position;
    if (targetPos) {
      this.beam.endPos = { ...targetPos };
    }

    if (elapsed >= this.beam.duration) {
      // Beam finished - destroy target if it's an asteroid
      const target = this.beam.target;
      if (host.isAsteroidTarget(target)) {
        // Apply lethal damage (triggers reactive destruction system)
        const healthMax = (target as { healthMax?: number } | null)?.healthMax;
        host.applyDamageToObject(target as ITargetable, healthMax || 9999);
      }
      // Deactivate beam
      this.beam = null;
    }
  }
}
