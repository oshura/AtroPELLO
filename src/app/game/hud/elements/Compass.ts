/**
 * Elemento HUD: Brújula circular
 * Muestra la orientación compass/heading de la nave
 * FASE 4: Elementos HUD individuales
 */
export class Compass {
  private heading: number = 0;
  private radius: number = 40;
  
  constructor() {}

  public update(heading: number): void {
    this.heading = ((heading % 360) + 360) % 360;
  }

  public render(ctx: CanvasRenderingContext2D, position: { x: number; y: number }): void {
    ctx.save();
    ctx.translate(position.x, position.y);
    
    this.drawCompassRing(ctx);
    this.drawDirectionMarkers(ctx);
    this.drawCompassNeedle(ctx);
    this.drawHeadingValue(ctx);
    
    ctx.restore();
  }

  private drawCompassRing(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = '#00FFFF';
    ctx.fillStyle = '#00FFFF20';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(0, 0, this.radius - 5, 0, 2 * Math.PI);
    ctx.stroke();
  }

  private drawDirectionMarkers(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = '#00FFFF';
    ctx.fillStyle = '#00FFFF';
    ctx.lineWidth = 1;
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let angle = 0; angle < 360; angle += 30) {
      const radian = (angle * Math.PI) / 180;
      const isCardinal = angle % 90 === 0;
      const markLength = isCardinal ? 8 : 5;
      
      const x1 = Math.sin(radian) * (this.radius - 2);
      const y1 = -Math.cos(radian) * (this.radius - 2);
      const x2 = Math.sin(radian) * (this.radius - 2 - markLength);
      const y2 = -Math.cos(radian) * (this.radius - 2 - markLength);
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      
      if (isCardinal) {
        const textRadius = this.radius - 15;
        const textX = Math.sin(radian) * textRadius;
        const textY = -Math.cos(radian) * textRadius;
        
        let label = '';
        switch (angle) {
          case 0: label = 'N'; break;
          case 90: label = 'E'; break;
          case 180: label = 'S'; break;
          case 270: label = 'W'; break;
        }
        
        ctx.fillText(label, textX, textY);
      }
    }
  }

  private drawCompassNeedle(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.rotate((this.heading * Math.PI) / 180);
    
    ctx.strokeStyle = '#FFFF00';
    ctx.fillStyle = '#FFFF00';
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.moveTo(0, -this.radius + 8);
    ctx.lineTo(-3, -this.radius + 18);
    ctx.lineTo(3, -this.radius + 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.strokeStyle = '#FF0000';
    ctx.beginPath();
    ctx.moveTo(0, this.radius - 8);
    ctx.lineTo(-2, this.radius - 15);
    ctx.lineTo(2, this.radius - 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
  }

  private drawHeadingValue(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#00FFFF';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    const headingText = Math.round(this.heading).toString().padStart(3, '0') + '°';
    ctx.fillText(headingText, 0, this.radius + 10);
  }

  public getDebugInfo(): any {
    return {
      type: 'Compass',
      heading: this.heading,
      headingNormalized: Math.round(this.heading),
      radius: this.radius
    };
  }
}