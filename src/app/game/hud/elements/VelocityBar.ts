/**
 * Elemento HUD: Barra de velocidad vertical
 * Muestra la velocidad actual como barra progresiva
 * FASE 4: Elementos HUD individuales
 */
export class VelocityBar {
  private side: 'left' | 'right';
  private velocity: number = 0;
  private maxVelocity: number = 100;
  
  constructor(side: 'left' | 'right') {
    this.side = side;
  }

  public update(velocity: number): void {
    this.velocity = Math.max(0, Math.min(this.maxVelocity, velocity));
  }

  public render(ctx: CanvasRenderingContext2D, position: { x: number; y: number }): void {
    const barWidth = 20;
    const barHeight = 200;
    const fillHeight = (this.velocity / this.maxVelocity) * barHeight;
    
    ctx.strokeStyle = '#00FF00';
    ctx.fillStyle = '#00FF0080';
    ctx.lineWidth = 2;
    
    ctx.strokeRect(position.x, position.y, barWidth, barHeight);
    
    if (fillHeight > 0) {
      ctx.fillRect(
        position.x + 1, 
        position.y + barHeight - fillHeight, 
        barWidth - 2, 
        fillHeight
      );
    }
    
    this.drawScaleMarkers(ctx, position, barWidth, barHeight);
    this.drawValueText(ctx, position, barWidth, barHeight);
  }

  private drawScaleMarkers(ctx: CanvasRenderingContext2D, position: { x: number; y: number }, width: number, height: number): void {
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 4; i++) {
      const y = position.y + height - (i * height / 4);
      const markWidth = (i % 2 === 0) ? width * 0.6 : width * 0.3;
      
      ctx.beginPath();
      if (this.side === 'left') {
        ctx.moveTo(position.x + width, y);
        ctx.lineTo(position.x + width - markWidth, y);
      } else {
        ctx.moveTo(position.x, y);
        ctx.lineTo(position.x + markWidth, y);
      }
      ctx.stroke();
    }
  }

  private drawValueText(ctx: CanvasRenderingContext2D, position: { x: number; y: number }, width: number, height: number): void {
    ctx.fillStyle = '#00FF00';
    ctx.font = '12px monospace';
    ctx.textAlign = this.side === 'left' ? 'right' : 'left';
    
    const textX = this.side === 'left' ? position.x - 5 : position.x + width + 5;
    const textY = position.y + height + 15;
    
    ctx.fillText(Math.round(this.velocity).toString(), textX, textY);
  }

  public getDebugInfo(): any {
    return {
      type: 'VelocityBar',
      side: this.side,
      velocity: this.velocity,
      maxVelocity: this.maxVelocity,
      percentage: (this.velocity / this.maxVelocity) * 100
    };
  }
}