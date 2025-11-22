export interface ShipHealthSnapshot {
  current: number;
  max: number;
  pct?: number;
}

/**
 * HUD element that displays the ship's hull integrity with a numeric readout and progress bar.
 */
export class HealthGauge {
  private readonly width = 150;
  private readonly height = 104;
  private readonly smoothingAlpha = 0.2;
  private currentValue = 0;
  private targetValue = 0;
  private maxValue = 1;
  private hasData = false;

  public update(data: ShipHealthSnapshot | null | undefined): void {
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

    // Smooth the displayed value for nicer animation.
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

    // Background panel
    ctx.fillStyle = 'rgba(15, 20, 25, 0.8)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    this.drawRoundedRect(ctx, -halfW, -halfH, this.width, this.height, 8);

    // Cross icon (phosphorescent green)
    ctx.save();
    ctx.translate(-halfW + 20, -halfH + 26);
    ctx.fillStyle = '#00ff80';
    ctx.fillRect(-3, -9, 6, 18);
    ctx.fillRect(-9, -3, 18, 6);
    ctx.restore();

    const pct = Math.max(0, Math.min(1, this.currentValue / Math.max(1, this.maxValue)));

    // Current health readout
    ctx.font = 'bold 20px "Share Tech Mono", monospace';
    ctx.textBaseline = 'middle';
    const currentText = this.formatValue(this.currentValue);
    let primaryColor = '#ffffff';
    if (pct <= 0.25) {
      primaryColor = '#ff4d4d';
    } else if (pct <= 0.5) {
      primaryColor = '#ffe066';
    }
    ctx.fillStyle = primaryColor;
    const currentWidth = ctx.measureText(currentText).width;
    ctx.save();
    ctx.translate(-halfW + 56, -halfH + 28);
    ctx.scale(1, 1.5);
    ctx.fillText(currentText, 0, 0);
    ctx.restore();

    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const maxText = `/ ${this.formatValue(this.maxValue)}`;
    ctx.save();
    ctx.translate(-halfW + 56 + currentWidth + 8, -halfH + 30);
    ctx.scale(1, 1.5);
    ctx.fillText(maxText, 0, 0);
    ctx.restore();

    // Progress bar
    const barWidth = this.width - 38;
    const barHeight = 22;
    const barX = -halfW + 19;
    const barY = halfH - barHeight - 18;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    const barFill = pct * barWidth;
    let barColor = '#00ff80';
    if (pct <= 0.25) {
      barColor = '#ff4d4d';
    } else if (pct <= 0.5) {
      barColor = '#ffe066';
    }
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barFill, barHeight);

    // Percent text
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.save();
    ctx.translate(barX + barWidth, barY - 2);
    ctx.scale(1, 1.5);
    ctx.fillText(`${Math.round(pct * 100)}%`, 0, 0);
    ctx.restore();

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
