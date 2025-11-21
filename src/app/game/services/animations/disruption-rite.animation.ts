import { GameAnimation } from './types';
import { GameEngine } from '../../GameEngine';
import { ITargetable } from '../../types/targeting.types';

export class DisruptionRiteAnimation implements GameAnimation {
  public readonly name = 'disruption-rite';
  // No keepOutlinersVisible property - defaults to false (outliners hidden)

  private t = 0; // seconds elapsed
  private textDuration = 2.0; // 2000ms for text display
  private totalDuration = 3.5; // 2s text + 1.5s beam
  private blocking = true;
  private beamStarted = false;
  private target: ITargetable | null = null;
  private targetPos: { x: number; y: number; z: number } | null = null;

  public start(engine: GameEngine, target?: ITargetable): void {
    this.t = 0;
    this.blocking = true;
    this.beamStarted = false;
    this.target = target || null;

    // Calculate target position
    if (this.target) {
      const anyT: any = this.target;
      this.targetPos = anyT.boundingSphere?.center 
        ? { ...anyT.boundingSphere.center }
        : (anyT.position ? { x: anyT.position.x, y: anyT.position.y, z: anyT.position.z } : null);
    }
  }

  public update(engine: GameEngine, dt: number): boolean {
    this.t += dt;

    // Start beam after text display completes
    if (this.t >= this.textDuration && !this.beamStarted && this.targetPos) {
      this.beamStarted = true;
      engine.startDisruptionBeam?.(this.targetPos, this.target);
    }

    if (this.t >= this.totalDuration) {
      this.blocking = false;
      return true; // Animation complete
    }
    return false;
  }

  public render(engine: GameEngine): void {
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

  public isBlockingInputs(): boolean {
    return this.blocking;
  }

  public cleanup?(engine: GameEngine): void {
    this.blocking = false;
    // Beam continues its own lifecycle independently
  }
}
