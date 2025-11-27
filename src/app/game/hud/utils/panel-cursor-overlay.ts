import { PanelCursorOverlayState } from './panel-cursor.types';

/**
 * Lightweight 2D canvas overlay that renders custom panel cursors on top of the
 * WebGL canvas so they remain visible even inside the letterboxed "dead zones".
 */
export class PanelCursorOverlay {
  private readonly host: HTMLCanvasElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private rafHandle: number | null = null;
  private state: PanelCursorOverlayState | null = null;
  private readonly onHostResizeBound: () => void;
  private resizeObserver?: ResizeObserver;

  constructor(hostCanvas: HTMLCanvasElement) {
    this.host = hostCanvas;
    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('panel-cursor-overlay');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.zIndex = '5';
    this.canvas.style.opacity = '0';
    this.ctx = this.canvas.getContext('2d');
    const parent = this.host.parentElement;
    if (parent) {
      parent.appendChild(this.canvas);
    }
    this.onHostResizeBound = () => this.syncSize();
    this.host.addEventListener('webgl-resize', this.onHostResizeBound);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.syncSize());
      this.resizeObserver.observe(this.host);
    }
    this.syncSize();
  }

  public dispose(): void {
    this.state = null;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.clear();
    this.host.removeEventListener('webgl-resize', this.onHostResizeBound);
    this.resizeObserver?.disconnect();
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }

  public setState(state: PanelCursorOverlayState | null): void {
    this.state = state;
    if (!state) {
      this.canvas.style.opacity = '0';
    } else {
      this.canvas.style.opacity = '1';
    }
    if (!state) {
      this.clear();
      return;
    }
    this.requestRender();
  }

  private requestRender(): void {
    if (this.rafHandle !== null) {
      return;
    }
    this.rafHandle = requestAnimationFrame((ts) => this.render(ts));
  }

  private render(timestamp: number): void {
    this.rafHandle = null;
    this.clear();
    if (!this.state || !this.ctx) {
      return;
    }
    this.drawCursor(this.state, timestamp / 1000);
    // Grimoire cursor is animated, keep requesting frames while active
    if (this.state.mode === 'grimoire') {
      this.requestRender();
    }
  }

  private clear(): void {
    if (!this.ctx) {
      return;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private syncSize(): void {
    const width = this.host.width;
    const height = this.host.height;
    if (!width || !height) {
      return;
    }
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  private drawCursor(state: PanelCursorOverlayState, timeSeconds: number): void {
    if (!this.ctx) {
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(state.viewportX, state.viewportY);
    switch (state.mode) {
      case 'grimoire':
        this.drawPentacleCursor(ctx, state.radius, timeSeconds);
        break;
      case 'inventory':
        this.drawInventoryCursor(ctx, state.radius);
        break;
      case 'map':
        this.drawMapCursor(ctx, state.radius);
        break;
      default:
        break;
    }
    ctx.restore();
  }

  private drawPentacleCursor(c: CanvasRenderingContext2D, radius: number, timeSeconds: number): void {
    const pulseScale = 1 + 0.06 * Math.sin(timeSeconds * 2.2);
    const glow = 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(timeSeconds * 3.1));
    const outer = radius * pulseScale;
    c.save();
    const gradient = c.createRadialGradient(0, 0, outer * 0.6, 0, 0, outer * 1.4);
    gradient.addColorStop(0, `rgba(200,0,40,${(glow * 0.7).toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(200,0,40,0)');
    c.fillStyle = gradient;
    c.beginPath();
    c.arc(0, 0, outer * 1.35, 0, Math.PI * 2);
    c.fill();

    c.strokeStyle = '#b00020';
    c.lineWidth = 2.2;
    c.beginPath();
    c.arc(0, 0, outer, 0, Math.PI * 2);
    c.stroke();

    const starRadius = outer * 0.85;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      pts.push([Math.cos(ang) * starRadius, Math.sin(ang) * starRadius]);
    }
    const order = [0, 2, 4, 1, 3, 0];
    c.beginPath();
    c.moveTo(pts[order[0]][0], pts[order[0]][1]);
    for (let i = 1; i < order.length; i++) {
      c.lineTo(pts[order[i]][0], pts[order[i]][1]);
    }
    c.closePath();
    c.stroke();

    c.fillStyle = `rgba(139,0,0,${(0.1 + glow * 0.2).toFixed(3)})`;
    c.beginPath();
    c.arc(0, 0, outer * 0.82, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  private drawInventoryCursor(c: CanvasRenderingContext2D, radius: number): void {
    const ringRadius = Math.max(10, radius * 0.7);
    const glowR = Math.max(16, ringRadius * 2);
    const glow = c.createRadialGradient(0, 0, 0, 0, 0, glowR);
    glow.addColorStop(0, 'rgba(152,218,255,0.9)');
    glow.addColorStop(1, 'rgba(16,164,255,0)');
    c.fillStyle = glow;
    c.beginPath();
    c.arc(0, 0, glowR * 0.65, 0, Math.PI * 2);
    c.fill();

    c.strokeStyle = 'rgba(56,189,248,0.95)';
    c.lineWidth = 1.8;
    c.beginPath();
    c.arc(0, 0, ringRadius, 0, Math.PI * 2);
    c.stroke();

    c.fillStyle = '#e0f7ff';
    c.beginPath();
    c.arc(0, 0, Math.max(3, ringRadius * 0.25), 0, Math.PI * 2);
    c.fill();
  }

  private drawMapCursor(c: CanvasRenderingContext2D, radius: number): void {
    const len = Math.max(8, radius);
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-len, 0);
    c.lineTo(len, 0);
    c.moveTo(0, -len);
    c.lineTo(0, len);
    c.stroke();
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(14,165,233,0.8)';
    c.beginPath();
    c.arc(0, 0, Math.max(3, radius * 0.35), 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
}
