import { GameAnimation } from './types';
import { GameEngine } from '../../GameEngine';
import { SpellType } from '../../types/spell.types';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export class RespawnSigillumAnimation implements GameAnimation {
  public readonly name = 'respawn-sigil';
  public readonly spellType = SpellType.RESPAWN_SIGILLUM;
  public readonly keepOutlinersVisible = false;

  private elapsed = 0;
  private readonly duration = 1.35; // seconds

  start(_engine: GameEngine): void {
    this.elapsed = 0;
  }

  update(_engine: GameEngine, dt: number): boolean {
    this.elapsed += dt;
    return this.elapsed >= this.duration;
  }

  render(engine: GameEngine): void {
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

  isBlockingInputs(): boolean {
    return false;
  }
}
