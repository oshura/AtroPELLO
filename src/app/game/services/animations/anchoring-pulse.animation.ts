import { GameEngine } from '../../GameEngine';
import { ITargetable } from '../../types/targeting.types';
import { SpellType } from '../../types/spell.types';
import { Asteroid } from '../../game-objects';
import { BaseAnimation } from './base-animation';

export class AnchoringPulseAnimation extends BaseAnimation {
  public readonly name = 'anchoring-pulse';
  public readonly spellType = SpellType.ANCHORING_PULSE;

  private t = 0;
  private readonly textDuration = 1.8;
  private readonly totalDuration = 3.2;
  private beamStarted = false;
  private target: ITargetable | null = null;
  private targetPos: { x: number; y: number; z: number } | null = null;

  protected override onStart(_engine: GameEngine, target?: ITargetable): void {
    this.t = 0;
    this.beamStarted = false;
    this.target = target ?? null;
    if (this.target) {
      const t = this.target as {
        boundingSphere?: { center?: { x: number; y: number; z: number } };
        position?: { x: number; y: number; z: number };
      };
      if (t.boundingSphere?.center) {
        this.targetPos = { ...t.boundingSphere.center };
      } else if (t.position) {
        this.targetPos = { x: t.position.x, y: t.position.y, z: t.position.z };
      } else {
        this.targetPos = null;
      }
    } else {
      this.targetPos = null;
    }
  }

  protected override onUpdate(engine: GameEngine, dt: number): boolean {
    this.t += dt;
    if (!this.beamStarted && this.t >= this.textDuration && this.target) {
      this.beamStarted = true;
      engine.startAnchoringPulseBeam(this.target as unknown as Asteroid);
    }
    return this.t >= this.totalDuration;
  }

  public override render(engine: GameEngine): void {
    if (this.t >= this.textDuration) {
      return;
    }
    const gl = engine.gl;
    if (!gl) return;
    const canvas = gl.canvas as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const alpha = this.computeAlpha();
    ctx.save();
    ctx.fillStyle = `rgba(80, 210, 255, ${alpha.toFixed(3)})`;
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ANCHORING PULSE', canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }

  private computeAlpha(): number {
    if (this.t < 0.25) {
      return this.t / 0.25;
    }
    if (this.t > this.textDuration - 0.3) {
      return Math.max(0, (this.textDuration - this.t) / 0.3);
    }
    return 1.0;
  }
}
