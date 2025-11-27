export interface PanelLetterbox {
  /** Pixel offset from left edge of the viewport */
  x: number;
  /** Pixel offset from top edge of the viewport */
  y: number;
  /** Width of the textured area in pixels */
  width: number;
  /** Height of the textured area in pixels */
  height: number;
  /** Normalized coverage (0-1) of the textured area along X */
  coverageX: number;
  /** Normalized coverage (0-1) of the textured area along Y */
  coverageY: number;
  /** Normalized offset (0-1) from left edge */
  offsetX: number;
  /** Normalized offset (0-1) from top edge */
  offsetY: number;
}

export interface PanelLetterboxOptions {
  horizontalScale?: number;
}

export const PANEL_HORIZONTAL_STRETCH = 1.75;

export interface PanelCoordMap {
  mapX: number;
  mapY: number;
  inside: boolean;
  letterbox: PanelLetterbox;
  viewportX: number;
  viewportY: number;
}

const EPSILON = 1e-3;

const clamp = (value: number, min: number = 0, max: number = 1) => Math.max(min, Math.min(max, value));

export function computePanelLetterbox(
  viewportW: number,
  viewportH: number,
  textureW: number,
  textureH: number,
  options?: PanelLetterboxOptions
): PanelLetterbox {
  const safeViewportW = Math.max(1, viewportW);
  const safeViewportH = Math.max(1, viewportH);
  const horizontalScale = options?.horizontalScale ?? 1;
  const scaledTextureW = textureW * horizontalScale;
  const texAspect = scaledTextureW / Math.max(1, textureH);
  const viewportAspect = safeViewportW / safeViewportH;

  let width = safeViewportW;
  let height = safeViewportH;
  let x = 0;
  let y = 0;

  if (Math.abs(viewportAspect - texAspect) > EPSILON) {
    if (viewportAspect > texAspect) {
      // Viewport is wider: reduce width, add bars on left/right
      height = safeViewportH;
      width = height * texAspect;
      x = (safeViewportW - width) * 0.5;
    } else {
      // Viewport is taller: reduce height, add bars top/bottom
      width = safeViewportW;
      height = width / texAspect;
      y = (safeViewportH - height) * 0.5;
    }
  }

  const coverageX = clamp(width / safeViewportW, 0, 1);
  const coverageY = clamp(height / safeViewportH, 0, 1);
  const offsetX = clamp(x / safeViewportW, 0, 1);
  const offsetY = clamp(y / safeViewportH, 0, 1);

  return { x, y, width, height, coverageX, coverageY, offsetX, offsetY };
}

export function mapViewportPointToCanvas(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  viewportW: number,
  viewportH: number,
  textureW: number,
  textureH: number,
  options?: PanelLetterboxOptions
): PanelCoordMap {
  const safeRectW = Math.max(1, rect.width);
  const safeRectH = Math.max(1, rect.height);
  const px = ((clientX - rect.left) / safeRectW) * viewportW;
  const py = ((clientY - rect.top) / safeRectH) * viewportH;
  const letterbox = computePanelLetterbox(viewportW, viewportH, textureW, textureH, options);

  const inside =
    px >= letterbox.x && px <= letterbox.x + letterbox.width &&
    py >= letterbox.y && py <= letterbox.y + letterbox.height;

  const normX = (px - letterbox.x) / Math.max(1, letterbox.width);
  const normY = (py - letterbox.y) / Math.max(1, letterbox.height);

  const mapX = clamp(normX) * textureW;
  const mapY = clamp(normY) * textureH;

  return { mapX, mapY, inside, letterbox, viewportX: px, viewportY: py };
}
