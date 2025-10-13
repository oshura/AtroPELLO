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

    // Outline frame
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    this.roundRect(ctx, x, y, width, height, 10);
    ctx.stroke();
    ctx.restore();

    // Title (name + distance)
    ctx.save();
  ctx.font = '28px Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = color;
    const title = `${this.state.name}  •  ${Math.round(this.state.distance)}u`;
    ctx.fillText(title, x + 14, y + 22);
    ctx.restore();

    // Preview region
    const pvX = x + 12;
    const pvY = y + 32;
  const pvW = Math.min(320, width * 0.4);
  const pvH = Math.min(240, height - 60);
    if (this.state.previewCanvas) {
      ctx.drawImage(this.state.previewCanvas, pvX, pvY, pvW, pvH);
    } else {
      // Placeholder frame
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.strokeRect(pvX, pvY, pvW, pvH);
      ctx.restore();
    }

    // Details list on the right
    const infoX = pvX + pvW + 16;
    const infoY = pvY;
    const infoW = width - (infoX - x) - 12;

    ctx.save();
  ctx.font = '24px Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = color;

    const details = this.state.details || {};
    let offset = 0;
    for (const [key, value] of Object.entries(details)) {
      const line = `${this.prettyKey(key)}: ${this.prettyVal(value)}`;
      ctx.fillText(line, infoX, infoY + offset);
  offset += 32;
      if (offset > pvH) break;
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
