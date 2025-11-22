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
  private readonly height = 56;
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

    // Red cross icon
    ctx.save();
    ctx.translate(-halfW + 20, -halfH + 18);
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(-4, -12, 8, 24);
    ctx.fillRect(-12, -4, 24, 8);
    ctx.restore();

    // Labels
    ctx.fillStyle = '#f8f8f8';
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('SHIP HEALTH', -halfW + 36, -halfH + 4);

    // Current health readout
    ctx.font = 'bold 20px "Share Tech Mono", monospace';
    ctx.textBaseline = 'middle';
    const currentText = this.formatValue(this.currentValue);
    const currentWidth = ctx.measureText(currentText).width;
    ctx.fillText(currentText, -halfW + 36, -halfH + 22);

    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const maxText = `/ ${this.formatValue(this.maxValue)}`;
    ctx.fillText(maxText, -halfW + 36 + currentWidth + 6, -halfH + 22);

    // Progress bar
    const barWidth = this.width - 40;
    const barHeight = 10;
    const barX = -halfW + 20;
    const barY = halfH - barHeight - 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    const pct = Math.max(0, Math.min(1, this.currentValue / Math.max(1, this.maxValue)));
    const barFill = pct * barWidth;
    const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
    gradient.addColorStop(0, '#00ff9d');
    gradient.addColorStop(0.5, '#ffe066');
    gradient.addColorStop(1, '#ff4d4d');
    ctx.fillStyle = gradient;
    ctx.fillRect(barX, barY, barFill, barHeight);

    // Percent text
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.round(pct * 100)}%`, barX + barWidth, barY - 2);

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
