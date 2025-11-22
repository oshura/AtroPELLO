import { GameAnimation } from './types';
import { GameEngine } from '../../GameEngine';
import { ITargetable } from '../../types/targeting.types';
import { SpellType } from '../../types/spell.types';
import { Asteroid } from '../../game-objects';

export class VoidKinesisAnimation implements GameAnimation {
  public readonly name = 'void-kinesis';
  public readonly spellType = SpellType.VOID_KINESIS;

  private t = 0;
  private readonly textDuration = 1.5;
  private readonly totalDuration = 3.0;
  private beamStarted = false;
  private blocking = true;
  private target: ITargetable | null = null;
  private targetPos: { x: number; y: number; z: number } | null = null;

  public start(_engine: GameEngine, target?: ITargetable): void {
    this.t = 0;
    this.beamStarted = false;
    this.blocking = true;
    this.target = target ?? null;
    if (this.target) {
      const anyT: any = this.target;
      if (anyT.boundingSphere?.center) {
        this.targetPos = { ...anyT.boundingSphere.center };
      } else if (anyT.position) {
        this.targetPos = { x: anyT.position.x, y: anyT.position.y, z: anyT.position.z };
      } else {
        this.targetPos = null;
      }
    } else {
      this.targetPos = null;
    }
  }

  public update(engine: GameEngine, dt: number): boolean {
    this.t += dt;
    if (!this.beamStarted && this.t >= this.textDuration && this.target && this.targetPos) {
      this.beamStarted = true;
      engine.startVoidKinesisBeam(this.targetPos, this.target as unknown as Asteroid);
    }
    if (this.t >= this.totalDuration) {
      this.blocking = false;
      return true;
    }
    return false;
  }

  public render(engine: GameEngine): void {
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
    ctx.fillStyle = `rgba(255, 80, 60, ${alpha.toFixed(3)})`;
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VOID KINESIS', canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }

  private computeAlpha(): number {
    if (this.t < 0.25) {
      return this.t / 0.25;
    }
    if (this.t > this.textDuration - 0.35) {
      return Math.max(0, (this.textDuration - this.t) / 0.35);
    }
    return 1.0;
  }

  public isBlockingInputs(): boolean {
    return this.blocking;
  }

  public cleanup(): void {
    this.blocking = false;
  }
}
