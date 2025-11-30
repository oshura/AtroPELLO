export interface ShipCargoSnapshot {
  current: number;
  max: number;
  pct?: number;
}

/**
 * HUD element that mirrors the health gauge layout to display cargo load.
 */
export class CargoGauge {
  private readonly width = 150;
  private readonly height = 104;
  private readonly smoothingAlpha = 0.2;
  private currentValue = 0;
  private targetValue = 0;
  private maxValue = 1;
  private hasData = false;

  public update(data: ShipCargoSnapshot | null | undefined): void {
    if (!data || !Number.isFinite(data.current) || !Number.isFinite(data.max) || data.max <= 0) {
      this.hasData = false;
      return;
    }
    this.hasData = true;
    this.maxValue = data.max;
    this.targetValue = Math.max(0, Math.min(data.max, data.current));
  }

  public getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  public render(ctx: CanvasRenderingContext2D, position: { x: number; y: number }): void {
    if (!this.hasData) {
      return;
    }

    const diff = this.targetValue - this.currentValue;
    if (Math.abs(diff) > 0.05) {
      this.currentValue += diff * this.smoothingAlpha;
    } else {
      this.currentValue = this.targetValue;
    }

    ctx.save();
    ctx.translate(position.x, position.y);

    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const pct = Math.max(0, Math.min(1, this.currentValue / Math.max(1, this.maxValue)));

    // Background panel
    ctx.fillStyle = 'rgba(15, 20, 25, 0.8)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    this.drawRoundedRect(ctx, -halfW, -halfH, this.width, this.height, 8);

    // Cargo icon (phosphorescent green) mirrored to the right side
    this.drawCargoIcon(ctx, halfW - 20, -halfH + 26, pct);

    // Cargo readout mirrored toward the right edge but left-to-right readable
    ctx.font = 'bold 20px "Share Tech Mono", monospace';
    ctx.textBaseline = 'middle';
    const currentText = this.formatValue(this.currentValue);
    const currentWidth = ctx.measureText(currentText).width;
    ctx.font = '12px "Share Tech Mono", monospace';
    const maxLabel = `${this.formatValue(this.maxValue)} /`;
    const maxLabelWidth = ctx.measureText(maxLabel).width;
    const gap = 6;
    const crossOffset = 28; // bring numbers closer to the cargo icon
    const textBlockEnd = halfW - crossOffset;
    const minTextStart = -halfW + 18;
    let currentTextX = textBlockEnd - currentWidth;
    let maxTextX = currentTextX - gap - maxLabelWidth;
    if (maxTextX < minTextStart) {
      const shift = minTextStart - maxTextX;
      maxTextX += shift;
      currentTextX += shift;
    }
    let primaryColor = '#ffffff';
    if (pct >= 0.75) {
      primaryColor = '#ff4d4d';
    } else if (pct >= 0.5) {
      primaryColor = '#ffe066';
    } else {
      primaryColor = '#00ff80';
    }
    ctx.fillStyle = primaryColor;
    ctx.save();
    ctx.translate(maxTextX, -halfH + 30);
    ctx.scale(1, 1.5);
    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(200,200,200,0.8)';
    ctx.fillText(maxLabel, 0, 0);
    ctx.restore();

    const currentValueColor = pct < 0.5 ? '#ffffff' : primaryColor;
    ctx.save();
    ctx.translate(currentTextX, -halfH + 28);
    ctx.scale(1, 1.5);
    ctx.font = 'bold 20px "Share Tech Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = currentValueColor;
    ctx.fillText(currentText, 0, 0);
    ctx.restore();

    // Progress bar mirrored: fills from right to left
    const barWidth = this.width - 38;
    const barHeight = 22;
    const barX = halfW - barWidth - 19;
    const barY = halfH - barHeight - 18;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    const barFill = pct * barWidth;
    let barColor = '#00ff80';
    if (pct >= 0.75) {
      barColor = '#ff4d4d';
    } else if (pct >= 0.5) {
      barColor = '#ffe066';
    }
    ctx.fillStyle = barColor;
    if (barFill > 0.001) {
      const fillX = barX + (barWidth - barFill);
      ctx.fillRect(fillX, barY, barFill, barHeight);
    }

    // Percent text anchored on the left side of the mirrored bar
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.save();
    ctx.translate(barX, barY - 2);
    ctx.scale(1, 1.5);
    ctx.fillText(`${Math.round(pct * 100)}%`, 0, 0);
    ctx.restore();

    ctx.restore();
  }

  private drawCargoIcon(ctx: CanvasRenderingContext2D, x: number, y: number, pct: number): void {
    ctx.save();
    ctx.translate(x, y);
    const baseAlpha = 0.2 + 0.6 * pct;
    ctx.strokeStyle = `rgba(0,255,128,${Math.min(1, baseAlpha + 0.25)})`;
    ctx.fillStyle = `rgba(0,255,128,${Math.min(1, baseAlpha)})`;
    ctx.lineWidth = 1.5;
    const size = 18;
    const half = size / 2;
    ctx.beginPath();
    ctx.rect(-half, -half, size, size);
    ctx.fill();
    ctx.stroke();
    // Diagonals to suggest a crate symbol
    ctx.beginPath();
    ctx.moveTo(-half, -half);
    ctx.lineTo(half, half);
    ctx.moveTo(-half, half);
    ctx.lineTo(half, -half);
    ctx.stroke();
    // Horizontal divider
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
    ctx.restore();
  }

  private formatValue(value: number): string {
    return Math.round(value).toString().padStart(3, '0');
  }

  private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
