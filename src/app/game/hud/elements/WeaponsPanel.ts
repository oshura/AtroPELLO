import { WeaponKind, WeaponsHudSnapshot } from '../../types/weapon.types';

/**
 * WeaponsPanel — panel de armamento del HUD (esquina superior izquierda).
 *
 * Sustituye al bloque "NO WEAPONS" que vivía dentro de `HUDManager.renderToTexture()`.
 * Lista las armas instaladas, marca la seleccionada en cian (mismo lenguaje que el grimorio),
 * y muestra cadencia y coste de cada una.
 *
 * OJO con las dimensiones: 182×140 es ancla de layout del HUD (el medidor de salud se coloca a su
 * derecha y el de energía del vacío lo espeja). Cambiarlas mueve medio HUD.
 */

const PANEL_WIDTH = 182;
const PANEL_HEIGHT = 140;
/** El quad del HUD aplasta la textura en vertical; todo el texto compensa con este factor. */
const TEXT_STRETCH_Y = 1.25;
const MAX_VISIBLE_ROWS = 5;
const SELECTED_COLOR = '#00c5ff';
const SELECTED_INNER_COLOR = '#00e0ff';

export class WeaponsPanel {
  private snapshot: WeaponsHudSnapshot | null = null;

  public update(snapshot: WeaponsHudSnapshot | null | undefined): void {
    this.snapshot = snapshot ?? null;
  }

  public getDimensions(): { width: number; height: number } {
    return { width: PANEL_WIDTH, height: PANEL_HEIGHT };
  }

  /** `position` es la esquina superior izquierda del panel. */
  public render(ctx: CanvasRenderingContext2D, position: { x: number; y: number }): void {
    const { x, y } = position;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 64, 32, 0.35)';
    ctx.fillRect(x, y, PANEL_WIDTH, PANEL_HEIGHT);
    ctx.strokeStyle = 'rgba(0,255,0,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 1, y - 1, PANEL_WIDTH + 2, PANEL_HEIGHT + 2);

    const entries = this.snapshot?.entries ?? [];
    if (entries.length === 0) {
      this.drawEmpty(ctx, x, y);
      ctx.restore();
      return;
    }

    const visible = Math.min(MAX_VISIBLE_ROWS, entries.length);
    const paddingY = 8;
    const footerH = 14;
    const rowH = Math.floor((PANEL_HEIGHT - paddingY * 2 - footerH) / visible);
    for (let i = 0; i < visible; i++) {
      this.drawRow(ctx, entries[i], x + 6, y + paddingY + i * rowH, PANEL_WIDTH - 12, rowH - 3);
    }
    this.drawFooter(ctx, x, y, entries.length);
    ctx.restore();
  }

  private drawEmpty(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '20px Segoe UI, Roboto, sans-serif';
    this.drawStretchedText(ctx, 'NO WEAPONS', x + PANEL_WIDTH / 2, y + PANEL_HEIGHT / 2);
  }

  private drawRow(
    ctx: CanvasRenderingContext2D,
    entry: WeaponsHudSnapshot['entries'][number],
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    ctx.save();
    ctx.fillStyle = entry.selected ? 'rgba(0, 90, 120, 0.45)' : 'rgba(0,128,64,0.22)';
    ctx.fillRect(x, y, width, height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = entry.selected ? SELECTED_COLOR : 'rgba(0,255,128,0.55)';
    ctx.strokeRect(x - 0.5, y - 0.5, width + 1, height + 1);
    if (entry.selected) {
      ctx.strokeStyle = SELECTED_INNER_COLOR;
      ctx.strokeRect(x + 1.5, y + 1.5, width - 3, height - 3);
    }

    const iconCx = x + 11;
    const iconCy = y + height / 2;
    this.drawKindIcon(ctx, entry.kind, iconCx, iconCy, entry.selected);

    ctx.fillStyle = entry.selected ? '#d8f8ff' : 'rgba(210,255,225,0.9)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '13px Segoe UI, Roboto, sans-serif';
    this.drawStretchedText(ctx, this.truncate(ctx, entry.label, width - 62), x + 22, iconCy - 3);

    if (entry.ammoLabel) {
      ctx.textAlign = 'right';
      ctx.font = '11px Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = 'rgba(190,235,205,0.85)';
      this.drawStretchedText(ctx, entry.ammoLabel, x + width - 5, iconCy - 3);
    }

    // Barra de cadencia: llena justo tras disparar, vacía cuando el arma vuelve a estar lista.
    const barY = y + height - 5;
    const barW = width - 26;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 22, barY, barW, 2);
    if (entry.cooldownPct > 0) {
      ctx.fillStyle = 'rgba(255,180,60,0.9)';
      ctx.fillRect(x + 22, barY, barW * Math.min(1, entry.cooldownPct), 2);
    } else {
      ctx.fillStyle = 'rgba(0,255,128,0.75)';
      ctx.fillRect(x + 22, barY, barW, 2);
    }
    ctx.restore();
  }

  private drawKindIcon(
    ctx: CanvasRenderingContext2D,
    kind: WeaponKind,
    cx: number,
    cy: number,
    selected: boolean
  ): void {
    ctx.save();
    ctx.strokeStyle = selected ? SELECTED_INNER_COLOR : 'rgba(0,255,128,0.85)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.2;
    if (kind === WeaponKind.BEAM) {
      // Haz continuo: tres ondas.
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const ox = cx - 5 + i * 4;
        ctx.moveTo(ox, cy - 4);
        ctx.quadraticCurveTo(ox + 2, cy, ox, cy + 4);
      }
      ctx.stroke();
    } else {
      // Proyectil: punta de flecha.
      ctx.beginPath();
      ctx.moveTo(cx + 5, cy);
      ctx.lineTo(cx - 4, cy - 4.5);
      ctx.lineTo(cx - 4, cy + 4.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawFooter(ctx: CanvasRenderingContext2D, x: number, y: number, installed: number): void {
    const snapshot = this.snapshot;
    const slots = snapshot?.slotsMax ?? installed;
    const guided = snapshot?.guidedCount ?? 0;
    ctx.save();
    ctx.font = '10px Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = 'rgba(180,225,195,0.75)';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    this.drawStretchedText(ctx, `[R] ${installed}/${slots}`, x + 7, y + PANEL_HEIGHT - 4);
    if (guided > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = SELECTED_INNER_COLOR;
      this.drawStretchedText(ctx, `GUIADO x${guided}`, x + PANEL_WIDTH - 7, y + PANEL_HEIGHT - 4);
    }
    ctx.restore();
  }

  /** Dibuja compensando el aplastado vertical del plano del HUD. */
  private drawStretchedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, TEXT_STRETCH_Y);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  private truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) {
      return text;
    }
    let result = text;
    while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
      result = result.slice(0, -1);
    }
    return `${result}…`;
  }
}
