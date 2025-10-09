/**
 * Elemento HUD: Velocímetro digital
 * Muestra velocidad numérica con efectos visuales
 * FASE 4: Elementos HUD individuales
 */
export class SpeedometerDigital {
  private speed: number = 0;
  private maxSpeed: number = 200;
  private animatedSpeed: number = 0;
  private lastUpdateTime: number = 0;
  
  constructor() {}

  public update(speed: number): void {
    this.speed = Math.max(0, Math.min(this.maxSpeed, speed));
    
    const currentTime = Date.now();
    const deltaTime = Math.min(currentTime - this.lastUpdateTime, 100) / 1000;
    this.lastUpdateTime = currentTime;
    
    const speedDifference = this.speed - this.animatedSpeed;
    const animationSpeed = 50;
    
    if (Math.abs(speedDifference) > 0.1) {
      this.animatedSpeed += speedDifference * animationSpeed * deltaTime;
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
    
    const fillWidth = (this.animatedSpeed / this.maxSpeed) * barWidth;
    if (fillWidth > 0) {
      const gradient = ctx.createLinearGradient(-barWidth/2, 0, barWidth/2, 0);
      gradient.addColorStop(0, '#00FF80');
      gradient.addColorStop(0.6, '#FFFF00');
      gradient.addColorStop(1, '#FF4000');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(-barWidth/2, barY, fillWidth, barHeight);
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
    const labels = ['0', '50', '100', '150', '200'];
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