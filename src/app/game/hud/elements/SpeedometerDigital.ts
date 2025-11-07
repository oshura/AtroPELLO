/**
 * Elemento HUD: Velocímetro digital
 * Muestra velocidad numérica con efectos visuales
 * FASE 4: Elementos HUD individuales
 */
export class SpeedometerDigital {
  private speed: number = 0;          // Display value (0..100 or 0..200 when rite active)
  private maxSpeed: number = 100;     // Current max for normalization (100 normal, 200 during rite)
  private animatedSpeed: number = 0;
  private riteActive: boolean = false;
  // Eliminamos dependencia de reloj para evitar saltos grandes en dt
  // y estabilizamos con un suavizado exponencial por frame.
  private readonly SMOOTHING_ALPHA: number = 0.15; // 0..1
  
  constructor() {}

  public setRiteActive(active: boolean): void {
    this.riteActive = active;
    this.maxSpeed = active ? 200 : 100;
  }

  public update(speedPercentExtended: number): void {
    // speedPercentExtended: porcentaje sobre la velocidad base (0..100 normal, puede subir hasta 200 con rito)
    const max = this.riteActive ? 200 : 100;
    this.maxSpeed = max;
    this.speed = Math.max(0, Math.min(max, speedPercentExtended));

    // Suavizado exponencial estable por frame (sin overshoot)
    const diff = this.speed - this.animatedSpeed;
    if (Math.abs(diff) > 0.001) {
      this.animatedSpeed += diff * this.SMOOTHING_ALPHA;
      // Clamp animado por seguridad
      this.animatedSpeed = Math.max(0, Math.min(this.maxSpeed, this.animatedSpeed));
      // Evitar pequeños rebotes por acumulación numérica
      if (Math.abs(this.speed - this.animatedSpeed) < 0.01) {
        this.animatedSpeed = this.speed;
      }
    } else {
      this.animatedSpeed = this.speed;
    }
  }

  public render(ctx: CanvasRenderingContext2D, position: { x: number; y: number }): void {
    ctx.save();
    ctx.translate(position.x, position.y);
    
    this.drawSpeedometerFrame(ctx);
    this.drawMainSpeed(ctx);
    this.drawSpeedBar(ctx);
    this.drawLabels(ctx);
    
    ctx.restore();
  }

  private drawSpeedometerFrame(ctx: CanvasRenderingContext2D): void {
    const width = 120;
    const height = 40;
    
    ctx.strokeStyle = '#00FF80';
    ctx.fillStyle = '#00FF8020';
    ctx.lineWidth = 2;
    
    ctx.fillRect(-width/2, -height/2, width, height);
    ctx.strokeRect(-width/2, -height/2, width, height);
    
    ctx.strokeStyle = '#00FF8080';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-width/2 + 5, -height/2 + 5);
    ctx.lineTo(width/2 - 5, -height/2 + 5);
    ctx.moveTo(-width/2 + 5, height/2 - 5);
    ctx.lineTo(width/2 - 5, height/2 - 5);
    ctx.stroke();
  }

  private drawMainSpeed(ctx: CanvasRenderingContext2D): void {
    let color = '#00FF80';
  const speedPercentage = this.animatedSpeed / this.maxSpeed;
    
    if (speedPercentage > 0.8) {
      color = '#FF4000';
    } else if (speedPercentage > 0.6) {
      color = '#FFFF00';
    }
    
    ctx.fillStyle = color;
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
  const speedText = Math.round(this.animatedSpeed).toString().padStart(3, '0');
    ctx.fillText(speedText, 0, -5);
  }

  private drawSpeedBar(ctx: CanvasRenderingContext2D): void {
    const barWidth = 80;
    const barHeight = 4;
    const barY = 12;
    
    ctx.strokeStyle = '#00FF80';
    ctx.lineWidth = 1;
    ctx.strokeRect(-barWidth/2, barY, barWidth, barHeight);
    
    // Base bar (0..100%)
    const baseRatio = Math.max(0, Math.min(1, Math.min(this.animatedSpeed, 100) / 100));
    const baseWidth = baseRatio * barWidth;
    if (baseWidth > 0) {
      const gradient = ctx.createLinearGradient(-barWidth/2, 0, barWidth/2, 0);
      gradient.addColorStop(0, '#00FF80'); // verde
      gradient.addColorStop(0.6, '#FFFF00'); // amarillo
      gradient.addColorStop(1, '#FF4000'); // rojo
      ctx.fillStyle = gradient;
      ctx.fillRect(-barWidth/2, barY, baseWidth, barHeight);
    }
    // Extended overlay (100..200%) cuando riteActive: también con degradado verde→rojo para continuidad
    if (this.riteActive && this.animatedSpeed > 100) {
      const extraRatio = Math.min(1, (this.animatedSpeed - 100) / 100); // 0..1
      const extraWidth = extraRatio * barWidth;
      if (extraWidth > 0) {
        ctx.globalAlpha = 0.85;
        const overlayGrad = ctx.createLinearGradient(-barWidth/2, 0, barWidth/2, 0);
        overlayGrad.addColorStop(0, '#00FF80');
        overlayGrad.addColorStop(0.6, '#FFFF00');
        overlayGrad.addColorStop(1, '#FF4000');
        ctx.fillStyle = overlayGrad;
        ctx.fillRect(-barWidth/2, barY, extraWidth, barHeight);
        ctx.globalAlpha = 1.0;
      }
    }
    
    ctx.strokeStyle = '#00FF8080';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = -barWidth/2 + (i * barWidth / 4);
      ctx.beginPath();
      ctx.moveTo(x, barY - 2);
      ctx.lineTo(x, barY + barHeight + 2);
      ctx.stroke();
    }
  }

  private drawLabels(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#00FF80';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    ctx.fillText('KM/H', 0, 20);
    
    ctx.font = '6px monospace';
  const labels = this.riteActive ? ['0', '50', '100', '150', '200'] : ['0', '25', '50', '75', '100'];
    labels.forEach((label, index) => {
      const x = -40 + (index * 20);
      ctx.fillText(label, x, 25);
    });
  }

  public getDebugInfo(): any {
    return {
      type: 'SpeedometerDigital',
      speed: this.speed,
      animatedSpeed: this.animatedSpeed,
      maxSpeed: this.maxSpeed,
      speedPercentage: (this.speed / this.maxSpeed) * 100
    };
  }
}