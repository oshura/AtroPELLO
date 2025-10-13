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

    // Panel background (transparent overall, but draw semi-transparent box)
    ctx.save();
    ctx.globalAlpha = 0.0; // keep fully transparent background by default
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(x, y, width, height);
    ctx.restore();

  // Outline frame (siempre verde fósforo, independiente de relación)
  ctx.save();
  ctx.strokeStyle = 'rgba(0,255,0,0.95)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, x, y, width, height, 10);
    ctx.stroke();
    ctx.restore();

    // Title (name + distance)
    ctx.save();
  ctx.font = '32px Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = color;
    const title = `${this.state.name}  •  ${Math.round(this.state.distance)}u`;
    // Bajar ligeramente el título
  ctx.fillText(title, x + 14, y + 38);
    ctx.restore();

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
    ctx.fillStyle = color;

    // Preparar líneas, filtrando claves internas
    const details = this.state.details || {};
  const lineHeight = 34; // acorde con 28px de fuente
    const lines: string[] = [];
    // Forzar 'type' como primera línea si existe
    if ((details as any).type !== undefined) {
      lines.push(`Type: ${this.prettyVal((details as any).type)}`);
    }
    for (const [key, value] of Object.entries(details)) {
      if (key === 'previewStatus' || key === 'type') continue; // ocultar internos y evitar duplicar
      lines.push(`${this.prettyKey(key)}: ${this.prettyVal(value)}`);
    }
    // Alinear por abajo con el límite del wireframe
    const totalHeight = lines.length * lineHeight;
    const bottomMargin = 6; // margen inferior para evitar recorte
    const startY = infoY + pvH - totalHeight - bottomMargin;
    let yCursor = startY;
    for (const line of lines) {
      if (yCursor > infoY + pvH - lineHeight) break; // seguridad con baseline top
      ctx.fillText(line, infoX, yCursor);
      yCursor += lineHeight;
    }

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
}
