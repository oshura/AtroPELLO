import { ITargetable, TargetType } from '../../types/targeting.types';

export type Relation = 'ally' | 'neutral' | 'enemy';

export interface TargetPanelState {
  active: boolean;
  relation: Relation;
  name: string;
  distance: number; // world units
  details?: Record<string, any>;
  // Offscreen preview canvas (transparent background, object drawn)
  previewCanvas?: HTMLCanvasElement | null;
}

export class TargetPanel {
  private state: TargetPanelState = {
    active: false,
    relation: 'neutral',
    name: '',
    distance: 0,
    details: {},
    previewCanvas: null
  };

  setData(data: Partial<TargetPanelState>) {
    this.state = { ...this.state, ...data };
  }

  clear() {
    this.state = { active: false, relation: 'neutral', name: '', distance: 0, details: {}, previewCanvas: null };
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
    if (!this.state.active) return;

    // Colors by relation
    const color = this.getAccentColor(this.state.relation);
    // Current details snapshot (used across title and list)
    const details = this.state.details || {};

  // Panel background (transparent overall, but draw semi-transparent box)
    ctx.save();
    ctx.globalAlpha = 0.0; // keep fully transparent background by default
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(x, y, width, height);
    ctx.restore();

  // Reservar espacio superior en la columna derecha para el badge de distancia
  let rightTopReserve = 0;

  // Outline frame (siempre verde fósforo, independiente de relación)
  ctx.save();
  ctx.strokeStyle = 'rgba(0,255,0,0.95)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, x, y, width, height, 10);
    ctx.stroke();
    ctx.restore();

    // Title (type + name), distance moved to fixed badge on the right
    ctx.save();
    ctx.font = '32px Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = color;
    const typeStr = (details as any).type !== undefined ? String((details as any).type) : '';
    const title = typeStr ? `${typeStr}  ${this.state.name}` : `${this.state.name}`;
    // Bajar ligeramente el título
    ctx.fillText(title, x + 14, y + 38);
    ctx.restore();

  // Fixed-position distance badge (top-right), right-aligned inside, fixed width
  ctx.save();
  ctx.font = '26px Segoe UI, Roboto, sans-serif';
  const rawDist = this.state.distance;
  const distText = rawDist >= 1000 ? `${(rawDist / 1000).toFixed(1)}ku` : `${Math.round(rawDist)}u`;
  // Reserve width for the widest possible label ('50.0ku' vs '999u')
  const padX = 12;
  const padY = 6;
  const w1 = ctx.measureText('999u').width;
  const w2 = ctx.measureText('50.0ku').width;
  const badgeW = Math.ceil(Math.max(w1, w2)) + padX * 2;
  const badgeH = 36; // más alto para mejor legibilidad
  const badgeX = x + width - badgeW - 14; // fixed right margin
  const badgeY = y + 12; // fixed top margin
  // Background for legibility
  ctx.fillStyle = 'rgba(0, 15, 25, 0.35)';
  ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
  // Frame
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);
  // Text (right-aligned within the badge)
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.fillText(distText, badgeX + badgeW - padX, badgeY + badgeH / 2);
  ctx.restore();
  // Aplicar reserva superior en la columna derecha equivalente a la altura del badge
  rightTopReserve = badgeH + 8;

    // Preview region
  const pvX = x + 12;
  const pvY = y + 48; // Bajar un poco más el área de preview
    const pvW = Math.min(320, width * 0.4);
    // Aumentar la altura ~1/6 por la parte inferior, sin salir del panel
    const allowedMaxH = Math.max(0, height - 60);
    const baseH = Math.min(240, allowedMaxH);
    const extraH = Math.floor(baseH / 6);
    const pvH = Math.min(baseH + extraH, allowedMaxH);
    // Backdrop para asegurar contraste
    ctx.save();
    ctx.fillStyle = 'rgba(0, 15, 25, 0.35)';
    ctx.fillRect(pvX - 2, pvY - 2, pvW + 4, pvH + 4);
    ctx.restore();

    if (this.state.previewCanvas) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.state.previewCanvas, pvX, pvY, pvW, pvH);
      // Overlay informativo fijo
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(pvX + 6, pvY + pvH - 22, 180, 16);
  ctx.fillStyle = 'rgba(0,255,255,0.95)';
  ctx.font = '12px Segoe UI, Roboto, sans-serif';
  ctx.fillText('Target acquisition OK', pvX + 10, pvY + pvH - 10);
      ctx.restore();
    } else {
      // Placeholder y etiqueta de debug
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.strokeRect(pvX, pvY, pvW, pvH);
      ctx.fillStyle = 'rgba(0,255,255,0.6)';
      ctx.font = '12px Segoe UI, Roboto, sans-serif';
      ctx.fillText('Preview no disponible', pvX + 8, pvY + 18);
      ctx.restore();
    }
    // Borde siempre visible para diagnóstico
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.strokeRect(pvX, pvY, pvW, pvH);
    ctx.restore();

    // Details list on the right
    const infoX = pvX + pvW + 16;
    const infoY = pvY;
    const infoW = width - (infoX - x) - 12;

    ctx.save();
    // Aumentar tamaño de fuente para mejor legibilidad
    ctx.font = '28px Segoe UI, Roboto, sans-serif';
    // Usar textBaseline 'top' para evitar recortes inferiores
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = color;

    // Preparar líneas, filtrando claves internas
    // details already defined above
  // Hacer la letra más alta (no más ancha) usando escala vertical
  const detailsScaleY = 1.2; // factor de altura
  const lineHeight = Math.ceil(34 * detailsScaleY); // acorde con 28px y escala
    const lines: string[] = [];
    let voidMassLine: string | null = null;
    for (const [key, value] of Object.entries(details)) {
      if (key === 'previewStatus' || key === 'type' || key === 'name') continue; // ocultar internos y evitar duplicar nombre
      // Renombrar 'albedo' a 'Albedo(Refl.)' y mostrar en %
      if (key.toLowerCase() === 'albedo') {
        const pct = Math.max(0, Math.min(100, Math.round(Number(value) * 100)));
        lines.push(`Albedo(Refl.): ${pct}%`);
        continue;
      }
      // Mostrar salud como porcentaje si viene explícita
      if (key === 'healthPct') {
        const pct = Math.max(0, Math.min(100, Math.round(Number(value))));
        lines.push(`Salud: ${pct}%`);
        continue;
      }
        // Volume en Mu con etiqueta fija
        if (key === 'volumeMu') {
          const v = Number(value);
          const vStr = Number.isFinite(v) ? v.toFixed(2) : String(value);
          lines.push(`Volume: ${vStr} Mu³`);
          continue;
      }
        // Back-compat: if old 'volumeGu' shows up, convert to Mu for display
        if (key === 'volumeGu') {
          const vGu = Number(value);
          const vMu = Number.isFinite(vGu) ? vGu * 1000 : NaN;
          const vStr = Number.isFinite(vMu) ? vMu.toFixed(2) : String(value);
          lines.push(`Volume: ${vStr} Mu³`);
          continue;
        }
      // Void mass: reservar para el final
      if (key === 'voidMassUnits') {
        const v = Math.max(0, Math.round(Number(value)));
        voidMassLine = `Void mass: ${v}u`;
        continue;
      }
      // Probability of Life: X%
      if (key === 'probabilityOfLifePct') {
        const pct = Math.max(0, Math.min(100, Math.round(Number(value))));
        lines.push(`Probability of Life: ${pct}%`);
        continue;
      }
      lines.push(`${this.prettyKey(key)}: ${this.prettyVal(value)}`);
    }
    // Asegurar que Void mass va al final si existe
    if (voidMassLine) lines.push(voidMassLine);
    // Alinear por abajo con el límite del wireframe
    const totalHeight = lines.length * lineHeight;
    const bottomMargin = 6; // margen inferior para evitar recorte
    const startY = infoY + pvH - totalHeight - bottomMargin;
    let yCursor = startY;
    for (const line of lines) {
      if (yCursor > infoY + pvH - lineHeight) break; // seguridad con baseline top
      // Dibujar con escala vertical sin ensanchar
      ctx.save();
      ctx.translate(infoX, yCursor);
      ctx.scale(1, detailsScaleY);
      ctx.fillText(line, 0, 0);
      ctx.restore();
      yCursor += lineHeight;
    }

    ctx.restore();

  // === Barra de salud a la derecha (pegada al borde del panel) ===
  const healthPct = this.resolveHealthPct(details);
  const barMargin = 12; // un poco más de margen del lado derecho
  const barW = 28; // barra más gruesa
  const barX = x + width - barW - barMargin;
  // Reservar espacio superior para texto dentro del mismo alto total pvH
  const labelH = 18; // más compacto para liberar espacio al badge de distancia
  const labelGap = 4; // separación bajo el texto
  const totalAvailH = Math.max(0, pvH - rightTopReserve);
  const barY = pvY + rightTopReserve + labelH + labelGap;
  const barH = Math.max(10, totalAvailH - (labelH + labelGap));
  // Texto del porcentaje encima de la barra (centrado)
  ctx.save();
  ctx.font = '18px Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.fillText(`${healthPct}%`, barX + barW/2, pvY + rightTopReserve);
  ctx.restore();
  // Marco de la barra
  ctx.save();
  // Borde rectangular (sin esquinas redondeadas)
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);
  // Fondo rectangular liso
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(barX, barY, barW, barH);
  // Color por tramos
  const hpColor = this.healthColor(healthPct);
  // Relleno desde abajo hacia arriba
  const fillH = Math.round((healthPct / 100) * barH);
  const fillY = barY + (barH - fillH);
  ctx.fillStyle = hpColor;
  ctx.fillRect(barX, fillY, barW, fillH);
  ctx.restore();
  }

  private getAccentColor(relation: Relation): string {
    switch (relation) {
      case 'ally':
        return 'rgba(0,255,128,0.95)';
      case 'enemy':
        return 'rgba(255,64,0,0.95)';
      default:
        return 'rgba(0,255,255,0.95)';
    }
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private prettyKey(k: string): string {
    return k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  }
  private prettyVal(v: any): string {
    if (typeof v === 'number') return v.toFixed(2);
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  private resolveHealthPct(details: Record<string, any> | undefined): number {
    const d = details || {};
  if (typeof d['healthPct'] === 'number') return Math.max(0, Math.min(100, Math.round(d['healthPct'] as number)));
  const hc = typeof d['healthCurrent'] === 'number' ? (d['healthCurrent'] as number) : 1;
  const hm = typeof d['healthMax'] === 'number' ? (d['healthMax'] as number) : (hc || 1);
    if (hm <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((hc / hm) * 100)));
  }
  private healthColor(pct: number): string {
    if (pct >= 75) return 'rgba(0,255,0,0.95)'; // verde
    if (pct >= 50) return 'rgba(255,220,0,0.95)'; // amarillo
    if (pct >= 25) return 'rgba(255,128,0,0.95)'; // naranja
    return 'rgba(255,0,0,0.95)'; // rojo
  }
}
