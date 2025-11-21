import { GameAnimation } from './types';
import { GameEngine } from '../../GameEngine';

export class SpeedRiteAnimation implements GameAnimation {
  public readonly name = 'speed-rite';
  public readonly keepOutlinersVisible = true; // Speed rite maintains outliners visible

  private t = 0; // seconds elapsed
  private duration = 1.2; // 1200ms
  private blocking = true;

  public start(engine: GameEngine): void {
    this.t = 0;
    this.blocking = true;
    // Apply speed buff immediately when animation starts
    engine.applySpeedRite?.(120000); // 2 minutes
  }

  public update(_engine: GameEngine, dt: number): boolean {
    this.t += dt;
    if (this.t >= this.duration) {
      this.blocking = false;
      return true; // Animation complete
    }
    return false;
  }

  public render(engine: GameEngine): void {
    // Show placeholder text overlay during animation
    const gl = engine.gl;
    if (!gl) return;

    const canvas = gl.canvas as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate fade opacity (fade in first 0.2s, fade out last 0.3s)
    let alpha = 1.0;
    if (this.t < 0.2) {
      alpha = this.t / 0.2;
    } else if (this.t > this.duration - 0.3) {
      alpha = (this.duration - this.t) / 0.3;
    }

    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ANIMATION NUMBER 1.', canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }

  public isBlockingInputs(): boolean {
    return this.blocking;
  }

  public cleanup?(engine: GameEngine): void {
    this.blocking = false;
    // No special cleanup needed for speed rite
  }
}
