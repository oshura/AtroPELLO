export interface FlightVectorReticleState {
  visible: boolean;
  normalizedX: number; // 0..1 in HUD canvas space
  normalizedY: number; // 0..1 in HUD canvas space
  edgeFade: number;    // 0..1, 1=center, 0=edge
  speedRatio: number;  // 0..1 relativo al velocímetro extendido
  mode: 'navigation' | 'combat';
  precisionActive?: boolean;
}

/**
 * Retícula discreta que marca el punto de fuga de la nave.
 * Cuando existan armas activas el modo "combat" intensificará el trazo.
 */
export class FlightVectorReticle {
  private state: FlightVectorReticleState | null = null;
  private precisionCollapseProgress: number = 0;
  private lastRenderTimestamp: number | null = null;

  public setState(state: FlightVectorReticleState | null): void {
    this.state = state;
  }

  public render(ctx: CanvasRenderingContext2D): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const deltaTime = this.lastRenderTimestamp === null ? 0 : (now - this.lastRenderTimestamp) / 1000;
    this.lastRenderTimestamp = now;
    this.updatePrecisionCollapse(deltaTime);

    if (!this.state || !this.state.visible) {
      return;
    }

    const canvas = ctx.canvas;
    const x = clamp(this.state.normalizedX * canvas.width, 0, canvas.width);
    const y = clamp(this.state.normalizedY * canvas.height, 0, canvas.height);

    const precisionActive = !!this.state.precisionActive;
    const modeColor = this.state.mode === 'combat' ? '#ff6b6b' : '#5bf5ff';
    const haloColor = this.state.mode === 'combat' ? 'rgba(255,107,107,0.5)' : 'rgba(91,245,255,0.55)';
    const precisionHalo = this.state.mode === 'combat' ? 'rgba(255,241,107,0.85)' : 'rgba(244,255,186,0.8)';
    const baseAlpha = this.state.mode === 'combat' ? 0.85 : 0.7;
    const alphaBoost = 0.2 + this.state.edgeFade * 0.35;
    const alphaMultiplier = precisionActive ? 1.35 : 1;
    const alpha = clamp(baseAlpha * alphaBoost * alphaMultiplier, 0.2, 1);
    if (alpha <= 0.02) {
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;

    const baseLineWidth = this.state.mode === 'combat' ? 2.6 : 2;
    const baseShadowBlur = 12 * (0.35 + this.state.edgeFade * 0.65);

    const baseRadius = 7 + this.state.speedRatio * 3;
    const haloRadius = baseRadius * 1.28 + 1.5;
    const outerGlowRadiusBase = haloRadius * 1.6 + 2.6;
    const outerGlowRadius = lerp(outerGlowRadiusBase, 0.3, this.precisionCollapseProgress);
    const outerGlowDot = outerGlowRadius <= 0.6;
    const sides = 5;

    // Pentágono exterior
    ctx.save();
    ctx.strokeStyle = modeColor;
    ctx.lineWidth = baseLineWidth;
    ctx.shadowColor = haloColor;
    ctx.shadowBlur = baseShadowBlur;
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
    ctx.restore();

    // Pentágono halo ligeramente más grande en verde fosforescente apagado
    ctx.save();
    ctx.strokeStyle = 'rgba(125, 255, 150, 0.5)';
    ctx.lineWidth = 1.4;
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
    ctx.strokeStyle = precisionActive ? 'rgba(255, 255, 255, 0.85)' : 'rgba(90, 200, 120, 0.25)';
    ctx.lineWidth = outerGlowDot ? 1.5 : 1.2;
    ctx.shadowColor = precisionActive ? precisionHalo : haloColor;
    ctx.shadowBlur = baseShadowBlur * (precisionActive ? 1.4 : 0.6);
    if (outerGlowDot) {
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0.25, outerGlowRadius), 0, Math.PI * 2);
      ctx.fillStyle = precisionActive ? 'rgba(255,255,255,0.8)' : 'rgba(90,200,120,0.35)';
      ctx.fill();
    } else {
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
    }
    ctx.restore();

    ctx.restore();
  }

    private updatePrecisionCollapse(deltaTime: number): void {
      const target = this.state?.precisionActive ? 1 : 0;
      const ratePerSecond = 5;
      const maxStep = ratePerSecond * Math.max(deltaTime, 1 / 240);
      this.precisionCollapseProgress = approach(this.precisionCollapseProgress, target, maxStep);
    }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

  function lerp(start: number, end: number, t: number): number {
    const clamped = clamp(t, 0, 1);
    return start + (end - start) * clamped;
  }

  function approach(current: number, target: number, maxDelta: number): number {
    if (maxDelta <= 0) {
      return current;
    }
    if (current < target) {
      return Math.min(target, current + maxDelta);
    }
    if (current > target) {
      return Math.max(target, current - maxDelta);
    }
    return target;
  }
