import { GameEngine } from '../../GameEngine';
import { ITargetable } from '../../types/targeting.types';
import { SpellType } from '../../types/spell.types';
import { BaseAnimation } from './base-animation';

export class DisruptionRiteAnimation extends BaseAnimation {
  public readonly name = 'disruption-rite';
  public readonly spellType = SpellType.DISRUPT;
  // No keepOutlinersVisible property - defaults to false (outliners hidden)

  private t = 0; // seconds elapsed
  private textDuration = 2.0; // 2000ms for text display
  private totalDuration = 3.5; // 2s text + 1.5s beam
  private beamStarted = false;
  private target: ITargetable | null = null;
  private targetPos: { x: number; y: number; z: number } | null = null;

  protected override onStart(_engine: GameEngine, target?: ITargetable): void {
    this.t = 0;
    this.beamStarted = false;
    this.target = target || null;

    // Calculate target position
    if (this.target) {
      const t = this.target as {
        boundingSphere?: { center?: { x: number; y: number; z: number } };
        position?: { x: number; y: number; z: number };
      };
      this.targetPos = t.boundingSphere?.center
        ? { ...t.boundingSphere.center }
        : (t.position ? { x: t.position.x, y: t.position.y, z: t.position.z } : null);
    }
  }

  protected override onUpdate(engine: GameEngine, dt: number): boolean {
    this.t += dt;

    // Start beam after text display completes
    if (this.t >= this.textDuration && !this.beamStarted && this.targetPos) {
      this.beamStarted = true;
      engine.startDisruptionBeam?.(this.targetPos, this.target);
    }

    return this.t >= this.totalDuration; // true ⇒ terminada (el haz sigue su propio ciclo)
  }

  public override render(engine: GameEngine): void {
    // Only show text overlay during first part of animation
    if (this.t >= this.textDuration) return;

    const gl = engine.gl;
    if (!gl) return;

    const canvas = gl.canvas as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate fade opacity (fade in first 0.3s, fade out last 0.4s)
    let alpha = 1.0;
    if (this.t < 0.3) {
      alpha = this.t / 0.3;
    } else if (this.t > this.textDuration - 0.4) {
      alpha = (this.textDuration - this.t) / 0.4;
    }

    ctx.save();
    ctx.fillStyle = `rgba(255, 50, 50, ${alpha})`; // Red color for destructive spell
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MATERIAL DISRUPTION RITE', canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }
}
