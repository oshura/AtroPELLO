import { GameEngine } from '../../GameEngine';
import { SpellType } from '../../types/spell.types';
import { clamp01 } from './animation-math';
import { BaseAnimation } from './base-animation';

export class RespawnSigillumAnimation extends BaseAnimation {
  public readonly name = 'respawn-sigil';
  public readonly spellType = SpellType.RESPAWN_SIGILLUM;
  public readonly keepOutlinersVisible = false;

  private elapsed = 0;
  private readonly duration = 1.35; // seconds

  protected override onStart(): void {
    this.elapsed = 0;
    this.blocking = false; // este sigilo no bloquea la entrada
  }

  protected override onUpdate(_engine: GameEngine, dt: number): boolean {
    this.elapsed += dt;
    return this.elapsed >= this.duration;
  }

  public override render(engine: GameEngine): void {
    const overlay = engine.overlayRenderer;
    if (!overlay) {
      return;
    }
    const t = clamp01(this.elapsed / this.duration);
    const shrinkRadius = Math.max(0.05, 0.85 * (1 - t) + 0.05);
    const thickness = Math.max(0.035, 0.22 - t * 0.12);
    const pulseAlpha = clamp01(0.85 * (1 - t));
    overlay.drawRadialPulse([1, 1, 1], shrinkRadius, thickness, pulseAlpha, 0.1);

    if (t > 0.6) {
      const flashT = clamp01((t - 0.6) / 0.4);
      const flashAlpha = Math.min(0.85, flashT * flashT);
      overlay.drawSolid([1, 1, 1], flashAlpha);
    }
  }
}
