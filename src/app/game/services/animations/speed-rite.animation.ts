import { GameEngine } from '../../GameEngine';
import { SpellType } from '../../types/spell.types';
import { BaseAnimation } from './base-animation';

export class SpeedRiteAnimation extends BaseAnimation {
  public readonly name = 'speed-rite';
  public readonly keepOutlinersVisible = true; // Speed rite maintains outliners visible
  public readonly spellType = SpellType.SPEED;

  private t = 0; // seconds elapsed
  private duration = 1.2; // 1200ms

  protected override onStart(engine: GameEngine): void {
    this.t = 0;
    // Apply speed buff immediately when animation starts
    engine.applySpeedRite?.(120000); // 2 minutes
  }

  protected override onUpdate(_engine: GameEngine, dt: number): boolean {
    this.t += dt;
    return this.t >= this.duration; // true ⇒ terminada
  }

  public override render(engine: GameEngine): void {
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
}
