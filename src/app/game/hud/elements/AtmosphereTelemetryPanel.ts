import { AtmosphereTelemetryPanelState } from '../../types/hud.types';

interface MeterOptions {
  label: string;
  value: number;
  unit?: string;
  max?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  accent: string;
  textColor?: string;
}

/**
 * Panel dedicado para la telemetría atmosférica dentro del HUD.
 * Sustituye al TargetPanel cuando la escena atmosférica está activa.
 */
export class AtmosphereTelemetryPanel {
  private state: AtmosphereTelemetryPanelState | null = null;

  public setData(state: AtmosphereTelemetryPanelState | null): void {
    this.state = state;
  }

  public clear(): void {
    this.state = null;
  }

  public hasData(): boolean {
    return !!this.state;
  }

  public render(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    if (!this.state) {
      return;
    }

    ctx.save();
    this.drawFrame(ctx, x, y, width, height);

    const gap = 16;
    const leftWidth = Math.floor(width * 0.42);
    const rightWidth = width - leftWidth - gap;

    this.drawPlanetColumn(ctx, x + 12, y + 14, leftWidth - 24, height - 28);
    this.drawWeatherColumn(ctx, x + leftWidth + gap, y + 14, rightWidth - 24, height - 28);

    ctx.restore();
  }

  private drawFrame(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    ctx.save();
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, 'rgba(0, 20, 32, 0.85)');
    gradient.addColorStop(1, 'rgba(0, 6, 12, 0.85)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);

    ctx.strokeStyle = 'rgba(0,255,170,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);

    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(0,255,170,0.18)';
    const midY = y + height * 0.55;
    ctx.beginPath();
    ctx.moveTo(x + 12, midY);
    ctx.lineTo(x + width - 12, midY);
    ctx.stroke();
    ctx.restore();
  }

  private drawPlanetColumn(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    if (!this.state) {
      return;
    }
    const { planet, altitudeAboveGround, distanceToSurface, telemetry, warnings } = this.state;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 72, 56, 0.25)';
    ctx.fillRect(x, y, width, height);

    ctx.fillStyle = 'rgba(0,255,170,0.9)';
    ctx.font = '32px "Space Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(planet.name, x, y);

    ctx.fillStyle = 'rgba(180,255,255,0.9)';
    ctx.font = '18px "Space Mono", monospace';
    const subtype = planet.typeLabel ? ` / ${planet.typeLabel}` : '';
    ctx.fillText(`ID ${planet.id}${subtype}`, x, y + 34);

    const infoLines: string[] = [];
    if (typeof planet.probabilityOfLifePct === 'number') {
      infoLines.push(`Prob. vida ${Math.round(planet.probabilityOfLifePct)}%`);
    }
    if (planet.inhabitantsDisplay) {
      infoLines.push(`Habitantes: ${planet.inhabitantsDisplay}`);
    }
    if (planet.lesserBeingDisplay) {
      infoLines.push(`Ser menor: ${planet.lesserBeingDisplay}`);
    }
    infoLines.push(`Visitado: ${planet.visited ? 'Sí' : 'No'}`);

    ctx.font = '20px "Space Mono", monospace';
    ctx.fillStyle = 'rgba(200,255,255,0.85)';
    let lineY = y + 70;
    for (const line of infoLines) {
      ctx.fillText(line, x, lineY);
      lineY += 24;
    }

    const meterWidth = width - 12;
    const baseY = lineY + 8;
    this.drawMeter(ctx, {
      label: 'Altitud',
      value: altitudeAboveGround,
      unit: 'u',
      x,
      y: baseY,
      width: meterWidth,
      height: 32,
      accent: '#22d3ee',
      max: Math.max(1000, altitudeAboveGround + 100),
    });
    this.drawMeter(ctx, {
      label: 'Distancia a superficie',
      value: distanceToSurface,
      unit: 'u',
      x,
      y: baseY + 50,
      width: meterWidth,
      height: 32,
      accent: '#34d399',
      max: Math.max(1000, distanceToSurface + 100),
    });

    const telemetryStart = baseY + 110;
    this.drawMeter(ctx, {
      label: 'Visibilidad',
      value: telemetry.visibility,
      unit: '',
      x,
      y: telemetryStart,
      width: meterWidth,
      height: 22,
      accent: '#7dd3fc',
      max: 1,
    });
    this.drawMeter(ctx, {
      label: 'Turbulencia',
      value: telemetry.turbulence,
      unit: '',
      x,
      y: telemetryStart + 34,
      width: meterWidth,
      height: 22,
      accent: '#fb7185',
      max: 1,
    });
    this.drawMeter(ctx, {
      label: 'Lift por segundo',
      value: telemetry.liftPerSecond,
      unit: '',
      x,
      y: telemetryStart + 68,
      width: meterWidth,
      height: 22,
      accent: '#a78bfa',
      max: 1,
    });

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '18px "Space Mono", monospace';
    ctx.fillText(`Estabilidad: ${telemetry.stability.toUpperCase()}`, x, telemetryStart + 110);
    ctx.fillText(`Sacudidas: ${telemetry.turbulenceSeverity.toUpperCase()}`, x, telemetryStart + 134);

    if (warnings.length) {
      ctx.font = '16px "Space Mono", monospace';
      let warnY = telemetryStart + 154;
      for (const warn of warnings.slice(0, 3)) {
        ctx.fillStyle = 'rgba(251,113,133,0.85)';
        ctx.fillRect(x, warnY, meterWidth, 20);
        ctx.fillStyle = '#0f172a';
        ctx.fillText(warn, x + 6, warnY + 2);
        warnY += 26;
      }
    }

    ctx.restore();
  }

  private drawWeatherColumn(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    if (!this.state) {
      return;
    }
    const { weather, telemetry, driftHeadingDeg, driftPitchDeg } = this.state;
    const padding = 12;
    const innerX = x + padding;
    const innerWidth = Math.max(0, width - padding * 2);

    ctx.save();
    ctx.fillStyle = 'rgba(4, 12, 32, 0.35)';
    ctx.fillRect(x, y, width, height);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(125,211,252,0.95)';
    ctx.font = '28px "Space Mono", monospace';
    const label = weather?.label ?? 'Sin evento activo';
    ctx.fillText(label, innerX, y);

    ctx.font = '18px "Space Mono", monospace';
    ctx.fillStyle = 'rgba(203,213,225,0.9)';
    const eta = weather ? this.formatEta(weather.etaMs) : '—';
    ctx.fillText(`ETA ${eta}`, innerX, y + 26);

    if (weather) {
      const minAlt = Number.isFinite(weather.layerBounds.min) ? Math.round(weather.layerBounds.min) : 0;
      const maxAlt = Number.isFinite(weather.layerBounds.max) ? Math.round(weather.layerBounds.max) : Infinity;
      const maxLabel = Number.isFinite(maxAlt) ? `${maxAlt}u` : '∞';
      ctx.font = '16px "Space Mono", monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.9)';
      ctx.fillText(`Capa ${weather.layerLabel} • ${minAlt}u-${maxLabel}`, innerX, y + 48);
    }

    const infoY = y + (weather ? 74 : 54);
    const infoHeight = 120;
    ctx.strokeStyle = 'rgba(45,212,191,0.45)';
    ctx.strokeRect(innerX, infoY, innerWidth, infoHeight);

    ctx.font = '18px "Space Mono", monospace';
    ctx.fillStyle = 'rgba(148,163,184,0.9)';
    ctx.fillText(`Evento: ${weather?.eventType ?? 'clear'}`, innerX + 8, infoY + 8);
    ctx.fillText(`Precipitación: ${weather?.precipitation ?? 'none'}`, innerX + 8, infoY + 34);
    ctx.fillText(`Rayos: ${(weather?.lightningChance ?? 0).toFixed(2)}`, innerX + 8, infoY + 60);
    ctx.fillText(`Intensidad: ${(weather?.intensity ?? 0).toFixed(2)}`, innerX + 8, infoY + 86);

    const driftCardY = infoY + infoHeight + 16;
    ctx.strokeStyle = 'rgba(59,130,246,0.45)';
    ctx.strokeRect(innerX, driftCardY, innerWidth, 110);
    ctx.fillStyle = 'rgba(59,130,246,0.85)';
    ctx.font = '20px "Space Mono", monospace';
    ctx.fillText('Vector de deriva', innerX + 8, driftCardY + 6);
    ctx.font = '16px "Space Mono", monospace';
    ctx.fillStyle = 'rgba(203,213,225,0.9)';
    ctx.fillText(`Heading ${driftHeadingDeg.toFixed(0)}°`, innerX + 8, driftCardY + 34);
    ctx.fillText(`Pitch ${driftPitchDeg.toFixed(0)}°`, innerX + 8, driftCardY + 56);
    ctx.fillText(`Magnitud ${telemetry.drift.magnitude.toFixed(2)}u/s`, innerX + 8, driftCardY + 78);

    const meterWidth = innerWidth;
    const metricsY = driftCardY + 130;
    this.drawMeter(ctx, {
      label: 'Drift horizontal',
      value: Math.hypot(telemetry.drift.x, telemetry.drift.z),
      unit: 'u/s',
      x: innerX,
      y: metricsY,
      width: meterWidth,
      height: 28,
      accent: '#38bdf8',
      max: Math.max(5, telemetry.drift.magnitude + 1),
      textColor: '#0f172a',
    });
    this.drawMeter(ctx, {
      label: 'Drift vertical',
      value: Math.abs(telemetry.drift.y),
      unit: 'u/s',
      x: innerX,
      y: metricsY + 40,
      width: meterWidth,
      height: 28,
      accent: '#fbbf24',
      max: Math.max(3, Math.abs(telemetry.drift.y) + 1),
      textColor: '#0f172a',
    });

    ctx.restore();
  }

  private drawMeter(ctx: CanvasRenderingContext2D, options: MeterOptions): void {
    const {
      label,
      value,
      unit,
      x,
      y,
      width,
      height,
      accent,
      max = 1,
      textColor = '#0f172a',
    } = options;

    const clamped = Math.max(0, Math.min(max, value));
    const pct = max <= 0 ? 0 : clamped / max;

    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,0.8)';
    ctx.fillRect(x, y, width, height);

    const fillWidth = width * pct;
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, fillWidth, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = 'rgba(226,232,240,0.85)';
    ctx.font = '14px "Space Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 6, y + height / 2);

    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    const valueStr = unit ? `${clamped.toFixed(0)} ${unit}` : `${(pct * 100).toFixed(0)}%`;
    ctx.fillText(valueStr, x + width - 6, y + height / 2);

    ctx.restore();
  }

  private formatEta(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) {
      return '0s';
    }
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }
}
