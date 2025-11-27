import { TargetInfo } from '../../types/targeting.types';
import { CompassCountdownPayload } from '../../types/hud.types';

/**
 * Elemento HUD: Brújula con sistema de targeting
 * Muestra dirección hacia targets seleccionados
 * FASE 4: Elementos HUD individuales + Sistema de targeting
 */
export class Compass {
  private heading: number = 0;
  private radius: number = 80; // Triplicado de tamaño
  private targetInfo: TargetInfo | null = null;
  // Optional countdown overlay (timed spell or effect)
  private countdown: CompassCountdownPayload | null = null;
  
  constructor() {}

  public update(heading: number, targetInfo?: TargetInfo | null): void {
    this.heading = ((heading % 360) + 360) % 360;
    this.targetInfo = targetInfo || null;
  }

  // Timed spell/UI overlay setter
  public setCountdown(payload?: CompassCountdownPayload | null): void {
    if (!payload || !Number.isFinite(payload.seconds) || payload.seconds <= 0) {
      this.countdown = null;
      return;
    }
    this.countdown = {
      seconds: payload.seconds,
      label: payload.label ?? 'RITE',
      accentColor: payload.accentColor ?? '#ff3055'
    };
  }

  public render(ctx: CanvasRenderingContext2D, position: { x: number; y: number }): void {
    ctx.save();
    ctx.translate(position.x, position.y);
    
    this.drawCompassRing(ctx);
    this.drawDirectionMarkers(ctx);
    // Mostrar solo información del target si existe; si no, no marcar nada
    if (this.targetInfo) {
      this.drawTargetNeedle(ctx);
    }
    // Draw optional countdown overlay inside the ring, top-center with margin
    if (this.countdown && this.countdown.seconds > 0) {
      this.drawCountdown(ctx, this.countdown);
    }
    
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

  // Eliminada la aguja N/S: cuando hay target mostramos solo la aguja del target;
  // cuando no hay target, no se muestra ninguna aguja.

  private drawTargetNeedle(ctx: CanvasRenderingContext2D): void {
    if (!this.targetInfo) return; // No hay target, no dibujar aguja

    ctx.save();
    
    // Rotar hacia el bearing del target (relativo al heading actual)
    const rawAngle = this.targetInfo.bearing - this.heading;
    const targetAngle = ((rawAngle + 540) % 360) - 180; // Normalizar a [-180, 180]
    ctx.rotate((targetAngle * Math.PI) / 180);
    
    // Color según "sentido": delante (|ang| <= 90) verde; detrás rojo
    const isFrontHemisphere = Math.abs(targetAngle) <= 90;
    const needleColor = isFrontHemisphere ? '#00FF66' : '#FF4444';
    ctx.strokeStyle = needleColor;
    ctx.fillStyle = needleColor;
    ctx.lineWidth = 3;
    ctx.shadowColor = needleColor;
    ctx.shadowBlur = 8;
    
    // Triángulo apuntando al target
    ctx.beginPath();
    ctx.moveTo(0, -this.radius + 10);
    ctx.lineTo(-5, -this.radius + 25);
    ctx.lineTo(5, -this.radius + 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Indicador de elevación simple: pequeña marca en el centro (arriba/abajo)
    const elev = this.targetInfo.elevation || 0;
    const elevClamped = Math.max(-45, Math.min(45, elev));
    const elevLen = 12 * (Math.abs(elevClamped) / 45);
    if (elevLen > 2) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#00FFFFAA';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (elevClamped > 0) {
        // Arriba
        ctx.moveTo(0, 4);
        ctx.lineTo(0, 4 - elevLen);
      } else {
        // Abajo
        ctx.moveTo(0, -4);
        ctx.lineTo(0, -4 + elevLen);
      }
      ctx.stroke();
    }
    
    ctx.restore();
  }
  // Se elimina el valor numérico de heading para no "marcar" cuando no hay target

  public getDebugInfo(): any {
    return {
      type: 'Compass',
      heading: this.heading,
      headingNormalized: Math.round(this.heading),
      radius: this.radius,
      hasTarget: !!this.targetInfo,
      countdown: this.countdown,
      targetInfo: this.targetInfo ? {
        targetId: this.targetInfo.target.id,
        distance: Math.round(this.targetInfo.distance * 100) / 100,
        bearing: Math.round(this.targetInfo.bearing),
        elevation: Math.round(this.targetInfo.elevation)
      } : null
    };
  }

  // Helpers
  private drawCountdown(ctx: CanvasRenderingContext2D, payload: CompassCountdownPayload): void {
    const sec = Math.max(0, Math.ceil(payload.seconds));
    const mm = Math.floor(sec / 60);
    const ss = sec % 60;
    const timeText = `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
    const labelText = (payload.label || 'RITE').toUpperCase();
    const baseColor = payload.accentColor ?? '#ff3055';
    const haloColor = 'rgba(255,255,255,0.7)';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '11px "Space Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.shadowColor = baseColor;
    ctx.shadowBlur = 6;
    ctx.fillText(labelText, 0, -28);
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.scale(1, 1.15);
    const grad = ctx.createLinearGradient(-60, -20, -60, 30);
    grad.addColorStop(0, `${baseColor}55`);
    grad.addColorStop(0.5, baseColor);
    grad.addColorStop(1, `${baseColor}cc`);
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '30px "Space Mono", monospace';
    ctx.shadowColor = baseColor;
    ctx.shadowBlur = 14;
    ctx.fillText(timeText, 0, 0);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.4;
    ctx.strokeText(timeText, 0, 0);
    ctx.shadowColor = haloColor;
    ctx.shadowBlur = 18;
    ctx.globalAlpha = 0.55;
    ctx.fillText(timeText, 0, 0);
    ctx.restore();

    ctx.restore();
  }
}