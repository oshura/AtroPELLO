import { ITargetable } from '../../types/targeting.types';

/**
 * Driver del outliner 2D de targeting (STEP 5), extraído de GameEngine (regla #1): decide QUÉ
 * pintar (hovered/selected, colores, intensidades) y delega el trazo en el componente de outline.
 * El motor sólo aporta el host.
 */
export interface TargetOutline2DLike {
  render(kind: 'hover' | 'selected', x: number, y: number, data: unknown): void;
}

export interface TargetOutlineTargetingLike {
  getCurrentTarget?: () => ITargetable | null;
  getHoveredTarget?: () => ITargetable | null;
  getTargetDisplayInfo?: (t: ITargetable) => {
    screenPosition?: { x: number; y: number } | null;
    name?: string;
    type?: string;
    accentColor?: string;
    details?: { health?: { current?: number; max?: number } };
  } | null;
}

export interface TargetOutlineDriverHost {
  isEnabled(): boolean;
  getOutline(): TargetOutline2DLike | null;
  getTargeting(): TargetOutlineTargetingLike | null;
  /** Animación/pre-cast en curso: overlays fuera para una vista limpia. */
  shouldHideOverlays(): boolean;
  getDevicePixelRatio(): number;
  getDisplayDistance(target: ITargetable): number;
}

function toRGBA(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const bigint = parseInt(h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/** Pinta hovered (si difiere del seleccionado) y seleccionado encima. Nunca rompe el frame. */
export function renderTargetOutline2D(host: TargetOutlineDriverHost): void {
  if (!host.isEnabled()) return;
  const outline = host.getOutline();
  const targeting = host.getTargeting();
  if (!outline || !targeting) return;
  try {
    const selected = targeting.getCurrentTarget?.();
    const hovered = targeting.getHoveredTarget?.();
    if (!selected && !hovered) return;

    const blockOverlays = host.shouldHideOverlays();
    const dpr = host.getDevicePixelRatio() || 1;

    const buildData = (t: ITargetable) => {
      const info = targeting.getTargetDisplayInfo?.(t);
      if (!info || !info.screenPosition) return null;
      const typeLabel = ((): string => {
        try { return String(info.type || (t as { getTargetType?: () => unknown }).getTargetType?.() || 'unknown'); } catch { return 'unknown'; }
      })();
      const healthPct = (() => {
        try {
          const h = info.details?.health;
          if (h && typeof h.current === 'number' && typeof h.max === 'number' && h.max > 0) {
            return (h.current / h.max) * 100;
          }
        } catch {}
        return undefined;
      })();
      const distanceRaw = host.getDisplayDistance(t);
      return {
        x: info.screenPosition.x * dpr,
        y: info.screenPosition.y * dpr,
        // Nombre vivo antes que el snapshot (evita 1 frame rancio).
        name: ((t as { getDisplayName?: () => string }).getDisplayName?.() || info.name || t.id),
        typeLabel,
        distanceDisplay: Number.isFinite(distanceRaw) ? distanceRaw : 0,
        color: info.accentColor || '#60a5fa',
        healthPct,
        intensity: 1.0,
        thickness: 1.0,
      };
    };

    if (!blockOverlays && hovered && (!selected || hovered.id !== selected.id)) {
      const hData = buildData(hovered);
      if (hData) {
        hData.color = toRGBA(hData.color, 1.0);
        hData.intensity = 0.85; // hover algo más brillante
        hData.thickness = 1.1;
        outline.render('hover', hData.x, hData.y, hData);
      }
    }

    if (!blockOverlays && selected) {
      const sData = buildData(selected);
      if (sData) {
        sData.color = toRGBA(sData.color, 1.0);
        sData.intensity = 1.0;
        sData.thickness = 1.2;
        outline.render('selected', sData.x, sData.y, sData);
      }
    }
  } catch {
    // No romper el frame por errores visuales.
  }
}
