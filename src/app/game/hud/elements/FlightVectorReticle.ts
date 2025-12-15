export interface FlightVectorReticleState {
  visible: boolean;
  normalizedX: number; // 0..1 in HUD canvas space
  normalizedY: number; // 0..1 in HUD canvas space
  edgeFade: number;    // 0..1, 1=center, 0=edge
  speedRatio: number;  // 0..1 relativo al velocímetro extendido
  mode: 'navigation' | 'combat';
}

/**
 * Retícula discreta que marca el punto de fuga de la nave.
 * Cuando existan armas activas el modo "combat" intensificará el trazo.
 */
export class FlightVectorReticle {
  private state: FlightVectorReticleState | null = null;

  public setState(state: FlightVectorReticleState | null): void {
    this.state = state;
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.state || !this.state.visible) {
      return;
    }

    const canvas = ctx.canvas;
    const x = clamp(this.state.normalizedX * canvas.width, 0, canvas.width);
    const y = clamp(this.state.normalizedY * canvas.height, 0, canvas.height);

    const modeColor = this.state.mode === 'combat' ? '#ff6b6b' : '#5bf5ff';
    const haloColor = this.state.mode === 'combat' ? 'rgba(255,107,107,0.5)' : 'rgba(91,245,255,0.55)';
    const baseAlpha = this.state.mode === 'combat' ? 0.85 : 0.7;
    const alphaBoost = 0.2 + this.state.edgeFade * 0.35;
    const alpha = clamp(baseAlpha * alphaBoost, 0.2, 1);
    if (alpha <= 0.02) {
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = modeColor;
    ctx.lineWidth = this.state.mode === 'combat' ? 2.6 : 2;
    ctx.shadowColor = haloColor;
    ctx.shadowBlur = 12 * (0.35 + this.state.edgeFade * 0.65);

    const baseRadius = 7 + this.state.speedRatio * 3;
    const haloRadius = baseRadius * 1.28 + 1.5;
    const outerGlowRadius = haloRadius * 1.6 + 2.6;
    const sides = 5;

    // Pentágono exterior
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
      const px = Math.cos(angle) * baseRadius;
      const py = Math.sin(angle) * baseRadius;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.stroke();

    // Pentágono halo ligeramente más grande en verde fosforescente apagado
    ctx.save();
    ctx.strokeStyle = 'rgba(125, 255, 150, 0.5)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
      const px = Math.cos(angle) * haloRadius;
      const py = Math.sin(angle) * haloRadius;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Halo exterior aún más grande y tenue para profundidad
    ctx.save();
    ctx.strokeStyle = 'rgba(90, 200, 120, 0.25)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
      const px = Math.cos(angle) * outerGlowRadius;
      const py = Math.sin(angle) * outerGlowRadius;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
