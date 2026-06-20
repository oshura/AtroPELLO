import { GameEngine } from '../../GameEngine';
import { SpellType } from '../../types/spell.types';
import { BaseAnimation } from './base-animation';

export class EternalRiteAnimation extends BaseAnimation {
  public readonly name = 'eternal-rite';
  public readonly spellType = SpellType.ETERNAL_RITE;
  // No keepOutlinersVisible property - defaults to false (outliners hidden)

  private t = 0; // seconds elapsed
  private duration = 2.0; // 2000ms
  private healthReduced = false;

  protected override onStart(): void {
    this.t = 0;
    this.healthReduced = false;
  }

  protected override onUpdate(engine: GameEngine, dt: number): boolean {
    this.t += dt;

    // Reduce health to 0 after animation completes
    if (this.t >= this.duration && !this.healthReduced) {
      this.healthReduced = true;
      const spaceship = engine.spaceship;
      if (spaceship) {
        spaceship.healthCurrent = 0; // Triggers death dialog automatically
      }
    }

    return this.t >= this.duration + 0.2;
  }

  public override render(engine: GameEngine): void {
    // Show placeholder text overlay during animation
    const gl = engine.gl;
    if (!gl) return;

    const canvas = gl.canvas as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate fade opacity (fade in first 0.3s, fade out last 0.4s)
    let alpha = 1.0;
    if (this.t < 0.3) {
      alpha = this.t / 0.3;
    } else if (this.t > this.duration - 0.4) {
      alpha = (this.duration - this.t) / 0.4;
    }

    ctx.save();
    ctx.fillStyle = `rgba(200, 100, 255, ${alpha})`; // Purple-ish color for void theme
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ETERNAL RITE - EMBRACING THE VOID', canvas.width / 2, canvas.height / 2);
    ctx.restore();
  }
}
