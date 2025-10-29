export type LandingOverlayWindows = {
  current?: { pointsNDC: Array<{ x: number; y: number }>; color: string };
  ideal?: { pointsNDC: Array<{ x: number; y: number }>; color: string };
} | null;

/**
 * A lightweight full-screen HUD layer (behind the main HUD) to draw landing windows.
 * Renders to an offscreen Canvas2D uploaded to a WebGL texture and drawn via ScreenOverlayRenderer.
 */
export class LandingOverlay {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: WebGLTexture | null = null;
  private windows: LandingOverlayWindows = null;
  private dirty = true;

  constructor(gl: WebGL2RenderingContext, width = 1024, height = 768) {
    this.gl = gl;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('LandingOverlay: 2D context not available');
    this.ctx = ctx;
    this.texture = this.createTexture();
  }

  public setWindows(w: LandingOverlayWindows) {
    this.windows = w;
    this.dirty = true;
  }

  public resize(width: number, height: number) {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.dirty = true;
  }

  private createTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  private upload(): void {
    if (!this.texture) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.canvas
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.dirty = false;
  }

  private drawToCanvas(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.windows) return;
    const drawQuad = (ptsNDC: Array<{ x: number; y: number }>, color: string, lineWidth = 2) => {
      if (!ptsNDC || ptsNDC.length < 4) return;
      const toCanvas = (p: { x: number; y: number }) => ({
        x: (p.x * 0.5 + 0.5) * canvas.width,
        y: (1 - (p.y * 0.5 + 0.5)) * canvas.height
      });
      const c0 = toCanvas(ptsNDC[0]);
      const c1 = toCanvas(ptsNDC[1]);
      const c2 = toCanvas(ptsNDC[2]);
      const c3 = toCanvas(ptsNDC[3]);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(c0.x, c0.y);
      ctx.lineTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    };
    if (this.windows.current) drawQuad(this.windows.current.pointsNDC, this.windows.current.color, 2);
    if (this.windows.ideal) drawQuad(this.windows.ideal.pointsNDC, this.windows.ideal.color, 3);
  }

  public render(overlayRenderer: any /* ScreenOverlayRenderer */): void {
    if (!this.texture) return;
    if (this.dirty) {
      this.drawToCanvas();
      this.upload();
    }
    // Draw full-screen with alpha=1 using cover scaling to match viewport
    const texW = this.canvas.width;
    const texH = this.canvas.height;
    overlayRenderer.drawTextureCover(this.texture, texW, texH, 1.0, 1.0);
  }

  public getTexture(): WebGLTexture | null { return this.texture; }
}
