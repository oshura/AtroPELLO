/**
 * Elemento HUD: Esfera de navegación 3D
 * Muestra la orientación 3D completa (pitch, roll, yaw)
 * FASE 4: Elementos HUD individuales
 */
export class NavigationSphere {
  private pitch: number = 0;
  private roll: number = 0;
  private yaw: number = 0;
  private radius: number = 60;
  
  constructor() {}

  public update(pitch: number, roll: number, yaw: number): void {
    this.pitch = pitch;
    this.roll = roll;
    this.yaw = yaw;
  }

  public render(ctx: CanvasRenderingContext2D, position: { x: number; y: number }): void {
    ctx.save();
    ctx.translate(position.x, position.y);
    
    this.drawSphereBase(ctx);
    this.drawArtificialHorizon(ctx);
    this.drawRollIndicator(ctx);
    this.drawCrosshair(ctx);
    this.drawOrientationValues(ctx);
    
    ctx.restore();
  }

  private drawSphereBase(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF10';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    
    ctx.strokeStyle = '#FFFFFF80';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius - 10, 0, 2 * Math.PI);
    ctx.stroke();
  }

  private drawArtificialHorizon(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.rotate((this.roll * Math.PI) / 180);
    
    const pitchOffset = (this.pitch / 90) * this.radius;
    
    ctx.fillStyle = '#0080FF40';
    ctx.beginPath();
    ctx.arc(0, pitchOffset, this.radius * 2, 0, Math.PI, true);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(0, 0, this.radius - 5, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.restore();
    ctx.save();
    ctx.rotate((this.roll * Math.PI) / 180);
    
    ctx.fillStyle = '#804000FF';
    ctx.beginPath();
    ctx.arc(0, pitchOffset, this.radius * 2, Math.PI, 2 * Math.PI, true);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(0, 0, this.radius - 5, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.restore();
    ctx.save();
    ctx.rotate((this.roll * Math.PI) / 180);
    
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-this.radius, pitchOffset);
    ctx.lineTo(this.radius, pitchOffset);
    ctx.stroke();
    
    this.drawPitchMarkers(ctx, pitchOffset);
    
    ctx.restore();
  }

  private drawPitchMarkers(ctx: CanvasRenderingContext2D, horizonY: number): void {
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#FFFF00';
    ctx.textAlign = 'center';
    
    for (let pitch = -80; pitch <= 80; pitch += 10) {
      if (pitch === 0) continue;
      
      const y = horizonY - (pitch / 90) * this.radius;
      const isWithinSphere = Math.abs(y) < this.radius - 5;
      
      if (isWithinSphere) {
        const markWidth = Math.abs(pitch) % 30 === 0 ? 20 : 10;
        
        ctx.beginPath();
        ctx.moveTo(-markWidth, y);
        ctx.lineTo(markWidth, y);
        ctx.stroke();
        
        if (Math.abs(pitch) % 30 === 0) {
          ctx.fillText(Math.abs(pitch).toString(), 0, y - 3);
        }
      }
    }
  }

  private drawRollIndicator(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    
    ctx.strokeStyle = '#FF00FF';
    ctx.lineWidth = 1;
    
    for (let angle = 0; angle < 360; angle += 30) {
      const radian = (angle * Math.PI) / 180;
      const isMainMark = angle % 90 === 0;
      const markLength = isMainMark ? 8 : 4;
      
      const x1 = Math.sin(radian) * (this.radius + 2);
      const y1 = -Math.cos(radian) * (this.radius + 2);
      const x2 = Math.sin(radian) * (this.radius + 2 + markLength);
      const y2 = -Math.cos(radian) * (this.radius + 2 + markLength);
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    
    ctx.rotate((this.roll * Math.PI) / 180);
    ctx.strokeStyle = '#FF00FF';
    ctx.fillStyle = '#FF00FF';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.moveTo(0, -(this.radius + 5));
    ctx.lineTo(-4, -(this.radius + 15));
    ctx.lineTo(4, -(this.radius + 15));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
  }

  private drawCrosshair(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(-5, 0);
    ctx.moveTo(5, 0);
    ctx.lineTo(15, 0);
    ctx.moveTo(0, -15);
    ctx.lineTo(0, -5);
    ctx.moveTo(0, 5);
    ctx.lineTo(0, 15);
    ctx.stroke();
    
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, 2 * Math.PI);
    ctx.fill();
  }

  private drawOrientationValues(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    
    const values = [
      `P: ${Math.round(this.pitch)}°`,
      `R: ${Math.round(this.roll)}°`,
      `Y: ${Math.round(this.yaw)}°`
    ];
    
    values.forEach((value, index) => {
      ctx.fillText(value, this.radius + 10, -20 + (index * 12));
    });
  }

  public getDebugInfo(): any {
    return {
      type: 'NavigationSphere',
      pitch: this.pitch,
      roll: this.roll,
      yaw: this.yaw,
      radius: this.radius
    };
  }
}