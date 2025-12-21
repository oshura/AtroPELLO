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
  private precisionActive: boolean = false;
  // Atmosphere mode: artificial horizon
  private atmosphereMode: boolean = false;
  private pitch: number = 0; // degrees
  private roll: number = 0; // degrees
  private altitudeAboveGround: number = 0; // units
  private readonly horizonBlend: number = 0.18;
  private readonly altitudeBlend: number = 0.25;
  
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

  public setPrecisionMode(active: boolean): void {
    this.precisionActive = !!active;
  }

  /**
   * Activa modo horizonte artificial para vuelo atmosférico
   */
  public setAtmosphereMode(active: boolean, pitch: number = 0, roll: number = 0, altitudeAboveGround: number = 0): void {
    if (!active) {
      this.atmosphereMode = false;
      return;
    }

    const normalizedPitch = this.clamp(pitch, -90, 90);
    const normalizedRoll = this.normalizeSignedAngle(roll);
    const normalizedAltitude = Math.max(0, altitudeAboveGround);

    if (!this.atmosphereMode) {
      this.pitch = normalizedPitch;
      this.roll = normalizedRoll;
      this.altitudeAboveGround = normalizedAltitude;
    } else {
      this.pitch = this.lerp(this.pitch, normalizedPitch, this.horizonBlend);
      this.roll = this.lerpAngle(this.roll, normalizedRoll, this.horizonBlend);
      this.altitudeAboveGround = this.lerp(this.altitudeAboveGround, normalizedAltitude, this.altitudeBlend);
    }

    this.atmosphereMode = true;
  }

  public render(ctx: CanvasRenderingContext2D, position: { x: number; y: number }): void {
    ctx.save();
    ctx.translate(position.x, position.y);
    
    // Modo horizonte artificial o brújula normal
    if (this.atmosphereMode) {
      this.drawArtificialHorizon(ctx);
    } else {
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
      if (this.precisionActive) {
        this.drawPrecisionOverlay(ctx);
      }
    }
    
    ctx.restore();
  }

  /**
   * Dibuja horizonte artificial para vuelo atmosférico
   */
  private drawArtificialHorizon(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    
    // Aplicar roll (horizonte se inclina en sentido contrario a la nave)
    ctx.rotate((-this.roll * Math.PI) / 180);
    
    // Calcular desplazamiento vertical basado en pitch (nariz arriba => horizonte baja)
    const pitchOffset = (this.pitch / 90) * this.radius; // ±90° = ±radius completo
    
    // Clip circular
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.clip();
    
    // Cielo (azul, parte superior)
    ctx.fillStyle = '#4A90E2';
    ctx.fillRect(-this.radius, -this.radius, this.radius * 2, this.radius + pitchOffset);
    
    // Suelo (marrón, parte inferior)
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(-this.radius, pitchOffset, this.radius * 2, this.radius * 2);
    
    // Línea del horizonte
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#FFFFFF';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(-this.radius, pitchOffset);
    ctx.lineTo(this.radius, pitchOffset);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Marcas de pitch cada 10° (líneas horizontales)
    ctx.strokeStyle = '#FFFFFF80';
    ctx.lineWidth = 1;
    for (let angle = -60; angle <= 60; angle += 10) {
      if (angle === 0) continue; // Ya dibujamos el horizonte
      const offset = (angle / 90) * this.radius;
      const lineLen = Math.abs(angle) % 30 === 0 ? 30 : 20;
      ctx.beginPath();
      ctx.moveTo(-lineLen, pitchOffset + offset);
      ctx.lineTo(lineLen, pitchOffset + offset);
      ctx.stroke();
      
      // Etiquetas de ángulo
      if (Math.abs(angle) % 30 === 0) {
        ctx.font = '10px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.abs(angle).toString(), 0, pitchOffset + offset);
      }
    }
    
    ctx.restore();
    
    // Marcador central (nave fija)
    ctx.save();
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00FF00';
    ctx.shadowBlur = 6;
    // Cruz central
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(-5, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(5, 0);
    ctx.stroke();
    // Punto central
    ctx.fillStyle = '#00FF00';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    
    // Altímetro (texto sobre el horizonte)
    ctx.save();
    ctx.fillStyle = '#00FF00';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00FF00';
    ctx.shadowBlur = 8;
    const altValue = Math.max(0, Math.round(this.altitudeAboveGround));
    const altText = `${altValue}`;
    ctx.save();
    ctx.translate(0, -this.radius + 22);
    ctx.scale(1, 1.5); // estirar verticalmente
    ctx.font = 'bold 26px "Space Mono", monospace';
    ctx.strokeText(altText, 0, 0);
    ctx.fillText(altText, 0, 0);
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.restore();
    
    // Borde del instrumento
    ctx.save();
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
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
    
    // Rotar usando el bearing relativo al morro (0=frente). Negamos para corregir simetría izquierda/derecha.
    const targetAngle = this.normalizeSignedAngle(-this.targetInfo.bearing);
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
      atmosphereMode: this.atmosphereMode,
      atmospherePitch: this.pitch,
      atmosphereRoll: this.roll,
      altitudeAboveGround: this.altitudeAboveGround,
      countdown: this.countdown,
      targetInfo: this.targetInfo ? {
        targetId: this.targetInfo.target.id,
        distance: Math.round(this.targetInfo.distance * 100) / 100,
        bearing: Math.round(this.targetInfo.bearing),
        elevation: Math.round(this.targetInfo.elevation)
      } : null
    };
  }

  private normalizeSignedAngle(value: number): number {
    return ((value % 360) + 540) % 360 - 180;
  }

  private lerp(current: number, target: number, alpha: number): number {
    const t = Math.max(0, Math.min(1, alpha));
    return current + (target - current) * t;
  }

  private lerpAngle(current: number, target: number, alpha: number): number {
    const t = Math.max(0, Math.min(1, alpha));
    const delta = this.normalizeSignedAngle(target - current);
    return this.normalizeSignedAngle(current + delta * t);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
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

  private drawPrecisionOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = '#00FFF6';
    ctx.shadowBlur = 6;
    ctx.font = '11px "Space Mono", monospace';
    ctx.translate(0, 34);
    ctx.scale(1, 1.33);
    ctx.fillText('PRECISION', 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}