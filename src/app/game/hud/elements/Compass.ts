import { TargetInfo } from '../../types/targeting.types';

/**
 * Elemento HUD: Brújula con sistema de targeting
 * Muestra dirección hacia targets seleccionados
 * FASE 4: Elementos HUD individuales + Sistema de targeting
 */
export class Compass {
  private heading: number = 0;
  private radius: number = 80; // Triplicado de tamaño
  private targetInfo: TargetInfo | null = null;
  
  constructor() {}

  public update(heading: number, targetInfo?: TargetInfo | null): void {
    this.heading = ((heading % 360) + 360) % 360;
    this.targetInfo = targetInfo || null;
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
    // Efecto esférico 3D con gradientes radiales
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
    gradient.addColorStop(0, '#00FFFF40');
    gradient.addColorStop(0.7, '#00FFFF20');
    gradient.addColorStop(1, '#00FFFF60');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, 2 * Math.PI);
    ctx.fill();
    
    // Borde exterior con sombra
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset shadow
    
    // Anillos internos para efecto esférico
    ctx.strokeStyle = '#00FFFF80';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius - 10, 0, 2 * Math.PI);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(0, 0, this.radius - 20, 0, 2 * Math.PI);
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
    
    // Aguja Norte (amarilla) - CUADRADO como solicitado
    ctx.strokeStyle = '#FFFF00';
    ctx.fillStyle = '#FFFF00';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#FFFF00';
    ctx.shadowBlur = 6;
    
    // Dibujar cuadrado en lugar de triángulo
    const squareSize = 8;
    ctx.fillRect(-squareSize/2, -this.radius + 15, squareSize, squareSize);
    ctx.strokeRect(-squareSize/2, -this.radius + 15, squareSize, squareSize);
    
    // Aguja Sur (roja) más grande
    ctx.strokeStyle = '#FF0000';
    ctx.fillStyle = '#FF0000';
    ctx.shadowColor = '#FF0000';
    ctx.shadowBlur = 4;
    
    ctx.beginPath();
    ctx.moveTo(0, this.radius - 15);
    ctx.lineTo(-4, this.radius - 30);
    ctx.lineTo(4, this.radius - 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Centro de la aguja
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.restore();
    
    // Dibujar aguja hacia target (si existe)
    this.drawTargetNeedle(ctx);
  }

  private drawTargetNeedle(ctx: CanvasRenderingContext2D): void {
    if (!this.targetInfo) return; // No hay target, no dibujar aguja

    ctx.save();
    
    // Rotar hacia el bearing del target (relativo al heading actual)
    const targetAngle = this.targetInfo.bearing - this.heading;
    ctx.rotate((targetAngle * Math.PI) / 180);
    
    // Aguja hacia target (roja, triángulo)
    ctx.strokeStyle = '#FF0000';
    ctx.fillStyle = '#FF0000';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#FF0000';
    ctx.shadowBlur = 8;
    
    // Triángulo apuntando al target
    ctx.beginPath();
    ctx.moveTo(0, -this.radius + 10);
    ctx.lineTo(-5, -this.radius + 25);
    ctx.lineTo(5, -this.radius + 25);
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
      radius: this.radius,
      hasTarget: !!this.targetInfo,
      targetInfo: this.targetInfo ? {
        targetId: this.targetInfo.target.id,
        distance: Math.round(this.targetInfo.distance * 100) / 100,
        bearing: Math.round(this.targetInfo.bearing),
        elevation: Math.round(this.targetInfo.elevation)
      } : null
    };
  }
}