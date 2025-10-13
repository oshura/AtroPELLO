import { Injectable } from '@angular/core';

export interface HoverHUDInfo {
  name: string;
  distance: number; // world units
  screenX: number;
  screenY: number;
  visible: boolean;
}

@Injectable({ providedIn: 'root' })
export class TargetHUDService {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private host: HTMLElement | null = null;

  initializeOverlay(host: HTMLElement) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.left = '0';
    this.canvas.style.top = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '50';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    const resize = () => {
      if (!this.canvas || !host) return;
      const rect = host.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    };
    resize();
    window.addEventListener('resize', resize);
  }

  clear() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawHover(info: HoverHUDInfo) {
    if (!this.ctx || !this.canvas) return;
    this.clear();
    if (!info.visible) return;

    const { screenX, screenY, name, distance } = info;

    this.ctx.save();
    const pad = 6;
    const text = `${name}  •  ${distance.toFixed(0)} u`;
    this.ctx.font = '12px Segoe UI, Roboto, sans-serif';
    const tw = this.ctx.measureText(text).width;
    const th = 16;

    const bx = Math.round(screenX + 12);
    const by = Math.round(screenY - th - 12);

    // Box
    this.ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.ctx.strokeStyle = 'rgba(0,255,255,0.9)';
    this.ctx.lineWidth = 1;
    this.roundRect(bx - pad, by - th - pad, tw + pad * 2, th + pad * 2, 6);
    this.ctx.fill();
    this.ctx.stroke();

    // Text
    this.ctx.fillStyle = 'rgba(220, 255, 255, 0.95)';
    this.ctx.fillText(text, bx, by);
    this.ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
