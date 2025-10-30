import { Injectable } from '@angular/core';
import { WebGLService } from '../../services/webgl.service';

interface OutlineRenderData {
  x: number; // screen px (framebuffer pixels)
  y: number; // screen px (framebuffer pixels)
  name: string;
  typeLabel: string;
  distanceEdge: number; // units to edge
  color: string; // css hex or rgba
  healthPct?: number; // 0-100 if available
  // Optional visual tuning per overlay
  intensity?: number; // 0..1 global alpha multiplier (default 1)
  thickness?: number; // line thickness multiplier (default 1)
}

@Injectable({ providedIn: 'root' })
export class TargetOutline2DRenderer {
  private gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  
  // GL resources
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | WebGLVertexArrayObjectOES | null = null;
  private vbo: WebGLBuffer | null = null;

  // Uniforms
  private uScreenSize: WebGLUniformLocation | null = null;
  private uTranslate: WebGLUniformLocation | null = null;
  private uSize: WebGLUniformLocation | null = null;
  private uSampler: WebGLUniformLocation | null = null;

  // Texture from offscreen 2D canvas
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  // per-content texture cache to allow rendering multiple markers without conflicts
  private cache = new Map<string, { texture: WebGLTexture; lastUpload: number }>();
  private maxCacheSize = 16;

  // Redraw throttling
  // Global minimum interval between any canvas->texture uploads per channel (e.g., 'hover', 'selected').
  private minUploadIntervalMs = 80;
  private lastGlobalUploadMsByChannel = new Map<string, number>();
  private lastRenderedKeyByChannel = new Map<string, string>();

  // Fixed pixel size of the marker texture
  private readonly texWidth = 220;
  private readonly texHeight = 90;

  constructor(private webgl: WebGLService) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.texWidth;
    this.canvas.height = this.texHeight;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available for TargetOutline2DRenderer');
    this.ctx = ctx;
  }

  public setMinUploadInterval(ms: number) {
    this.minUploadIntervalMs = Math.max(0, Math.floor(ms));
  }

  public initialize(): boolean {
    const ctx = this.webgl.getContext() as any;
    this.gl = (ctx && 'bindVertexArray' in ctx)
      ? (ctx as WebGL2RenderingContext)
      : (ctx as WebGLRenderingContext);
    if (!this.gl) return false;

    // Build shaders/program
    const isWebGL2 = 'bindVertexArray' in this.gl; // reliable check
    const vsSource = (isWebGL2 ? '#version 300 es\n' : '') + (
      isWebGL2
        ? `precision highp float;
           layout(location=0) in vec2 a_pos;
           uniform vec2 u_screenSize;
           uniform vec2 u_translate;
           uniform vec2 u_size;
           out vec2 v_uv;
           void main(){
             vec2 posPx = u_translate + a_pos * u_size;
             vec2 ndc = vec2(
               (posPx.x / u_screenSize.x) * 2.0 - 1.0,
               1.0 - (posPx.y / u_screenSize.y) * 2.0
             );
             gl_Position = vec4(ndc, 0.0, 1.0);
             v_uv = a_pos + 0.5;
           }`
        : `precision highp float;
           attribute vec2 a_pos;
           uniform vec2 u_screenSize;
           uniform vec2 u_translate;
           uniform vec2 u_size;
           varying vec2 v_uv;
           void main(){
             vec2 posPx = u_translate + a_pos * u_size;
             vec2 ndc = vec2(
               (posPx.x / u_screenSize.x) * 2.0 - 1.0,
               1.0 - (posPx.y / u_screenSize.y) * 2.0
             );
             gl_Position = vec4(ndc, 0.0, 1.0);
             v_uv = a_pos + 0.5;
           }`
    );

    const fsSource = (isWebGL2 ? '#version 300 es\n' : '') + (
      isWebGL2
        ? `precision highp float;
           in vec2 v_uv;
           uniform sampler2D u_sampler;
           out vec4 outColor;
           void main(){
             vec4 c = texture(u_sampler, v_uv);
             outColor = c;
           }`
        : `precision highp float;
           varying vec2 v_uv;
           uniform sampler2D u_sampler;
           void main(){
             vec4 c = texture2D(u_sampler, v_uv);
             gl_FragColor = c;
           }`
    );

    const prog = this.createProgram(vsSource, fsSource, !!isWebGL2);
    if (!prog) return false;
    this.program = prog;

    // Quad centered at origin, unit size in [-0.5,0.5]
    const verts = new Float32Array([
      -0.5, -0.5,
       0.5, -0.5,
       0.5,  0.5,
      -0.5,  0.5,
    ]);

    const gl = this.gl as any;
    // VAO (compat for WebGL1 with OES_vertex_array_object)
    const vaoExt = !('bindVertexArray' in gl) ? gl.getExtension('OES_vertex_array_object') : null;
    this.vao = ('createVertexArray' in gl)
      ? gl.createVertexArray()
      : (vaoExt ? vaoExt.createVertexArrayOES() : null);
    if (this.vao) {
      if ('bindVertexArray' in gl) gl.bindVertexArray(this.vao);
      else vaoExt.bindVertexArrayOES(this.vao);
    }
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const loc = 0;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 8, 0);
    if (this.vao) {
      if ('bindVertexArray' in gl) gl.bindVertexArray(null);
      else (vaoExt as any).bindVertexArrayOES(null);
    }

    this.uScreenSize = gl.getUniformLocation(this.program, 'u_screenSize');
    this.uTranslate = gl.getUniformLocation(this.program, 'u_translate');
    this.uSize = gl.getUniformLocation(this.program, 'u_size');
    this.uSampler = gl.getUniformLocation(this.program, 'u_sampler');

    return true;
  }

  private createProgram(vsSrc: string, fsSrc: string, isWebGL2: boolean): WebGLProgram | null {
    const gl = this.gl! as any;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('VS error', gl.getShaderInfoLog(vs));
      return null;
    }
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('FS error', gl.getShaderInfoLog(fs));
      return null;
    }
    const p = gl.createProgram()!;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    if (isWebGL2) {
      gl.bindAttribLocation(p, 0, 'a_pos');
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('Program link error', gl.getProgramInfoLog(p));
      return null;
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return p;
  }

  private drawToCanvas(data: OutlineRenderData): void {
    const ctx = this.ctx;
    const W = this.texWidth, H = this.texHeight;
    ctx.clearRect(0, 0, W, H);

    // Background: transparent; design anchored at texture center
    const accent = data.color || '#60a5fa';
    const cx = W / 2;
    const cy = H / 2;

    // Global alpha and line thickness tweaks for hover/selected distinctions
    const intensity = Math.max(0, Math.min(1, (data as any).intensity ?? 1));
    const thickness = Math.max(0.5, Math.min(2.0, (data as any).thickness ?? 1));
    ctx.save();
    ctx.globalAlpha = intensity;

    // Unit formatting (u -> ku if >= 1000u)
    const formatDist = (val: number) => {
      const v = Math.max(0, val);
      if (v >= 1000) return `${(v / 1000).toFixed(1)}ku`;
      return `${Math.round(v)}u`;
    };

    // Outer ring
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.0 * thickness;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.stroke();

    // Corner chevrons
    ctx.lineWidth = 1.5 * thickness;
    const r = 30; const len = 8;
    const drawChevron = (ang: number) => {
      const sx = cx + Math.cos(ang) * r;
      const sy = cy + Math.sin(ang) * r;
      const ex1 = sx + Math.cos(ang + Math.PI * 0.5) * len;
      const ey1 = sy + Math.sin(ang + Math.PI * 0.5) * len;
      const ex2 = sx + Math.cos(ang - Math.PI * 0.5) * len;
      const ey2 = sy + Math.sin(ang - Math.PI * 0.5) * len;
      ctx.beginPath(); ctx.moveTo(ex1, ey1); ctx.lineTo(sx, sy); ctx.lineTo(ex2, ey2); ctx.stroke();
    };
    drawChevron(0);
    drawChevron(Math.PI * 0.5);
    drawChevron(Math.PI);
    drawChevron(-Math.PI * 0.5);

  // Center dot removed by request

    // Texts: type/name above; health left bottom; distance right bottom
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Name at the top (position where type used to be)
    ctx.fillStyle = accent;
    ctx.font = '600 12px Segoe UI, Roboto, Arial';
    const topName = String(data.name || '');
    const maxWTop = 160;
    let renderedTop = topName;
    if (ctx.measureText(renderedTop).width > maxWTop) {
      while (renderedTop.length > 3 && ctx.measureText(renderedTop + '…').width > maxWTop) {
        renderedTop = renderedTop.slice(0, -1);
      }
      renderedTop += '…';
    }
    ctx.fillText(renderedTop, cx, cy - 38);

    // Previous name line removed (now used by type at bottom center)

    // Bottom labels (same font size as name)
    ctx.fillStyle = accent;
    ctx.font = '600 12px Segoe UI, Roboto, Arial';
    const hp = (typeof data.healthPct === 'number' && isFinite(data.healthPct))
      ? Math.max(0, Math.min(100, Math.round(data.healthPct)))
      : null;
  ctx.textAlign = 'right';
    if (hp !== null) ctx.fillText(`${hp}%`, cx - 28, cy + 26);
  ctx.textAlign = 'left';
    // Quantize distance label to reduce redraw churn
    ctx.fillText(`${formatDist(data.distanceEdge)}`, cx + 28, cy + 26);

  // Type at bottom center (lowered slightly more)
  ctx.textAlign = 'center';
  ctx.font = 'bold 11px Segoe UI, Roboto, Arial';
  ctx.fillText(String(data.typeLabel || '').toUpperCase(), cx, cy + 38);

    ctx.restore();
  }

  private uploadTextureFor(texture: WebGLTexture): void {
    const gl: any = this.gl!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Use premultiplied alpha for consistent blending
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // Create a coarse key to avoid unnecessary texture rebuilds
  private makeKey(data: OutlineRenderData): string {
    const distBucket = Math.round((data.distanceEdge || 0) / 25); // 25u buckets
    const hpBucket = (data.healthPct == null) ? -1 : Math.round((data.healthPct as number) / 5); // 5% buckets
    const intBucket = Math.round(Math.max(0, Math.min(1, (data as any).intensity ?? 1)) * 10);
    const thickBucket = Math.round(Math.max(0.5, Math.min(2.0, (data as any).thickness ?? 1)) * 10);
    return `${data.name}|${data.typeLabel}|${distBucket}|${hpBucket}|${data.color}|i${intBucket}|t${thickBucket}`;
  }

  public render(channel: string, anchorX: number, anchorY: number, data: OutlineRenderData): void {
    if (!this.gl || !this.program) return;

    const now = performance.now();
    const ch = channel || 'default';
    const key = this.makeKey(data);
    let entry = this.cache.get(key);
    if (!entry) {
      // Per-channel throttle: avoid creating/uploading a new texture more often than minUploadIntervalMs
      const lastUp = this.lastGlobalUploadMsByChannel.get(ch) || 0;
      const lastKey = this.lastRenderedKeyByChannel.get(ch) || null;
      if (now - lastUp >= this.minUploadIntervalMs || lastKey === null) {
        const gl: any = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.drawToCanvas(data);
        this.uploadTextureFor(tex);
        entry = { texture: tex, lastUpload: now };
        this.cache.set(key, entry);
        this.lastGlobalUploadMsByChannel.set(ch, now);
        this.lastRenderedKeyByChannel.set(ch, key);
        // prune simple LRU if needed
        if (this.cache.size > this.maxCacheSize) {
          const iter = this.cache.keys();
          const first = iter.next();
          if (!first.done) {
            const firstKey = first.value as string;
            const old = this.cache.get(firstKey);
            try { if (old) (this.gl as any).deleteTexture(old.texture); } catch {}
            this.cache.delete(firstKey);
          }
        }
      } else {
        // Too soon to build a new texture; fallback to last rendered key for THIS CHANNEL
        if (lastKey) {
          entry = this.cache.get(lastKey)!;
        }
        // If still missing (first draw for this channel), allow creation to avoid nothing being drawn
        if (!entry) {
          const gl: any = this.gl;
          const tex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          this.drawToCanvas(data);
          this.uploadTextureFor(tex);
          entry = { texture: tex, lastUpload: now };
          this.cache.set(key, entry);
          this.lastGlobalUploadMsByChannel.set(ch, now);
          this.lastRenderedKeyByChannel.set(ch, key);
        }
      }
    } else {
      // Same content key: only refresh the texture at most every minUploadIntervalMs
      const lastUp = this.lastGlobalUploadMsByChannel.get(ch) || 0;
      if (now - entry.lastUpload >= this.minUploadIntervalMs && now - lastUp >= this.minUploadIntervalMs) {
        this.drawToCanvas(data);
        this.uploadTextureFor(entry.texture);
        entry.lastUpload = now;
        this.lastGlobalUploadMsByChannel.set(ch, now);
      }
      this.lastRenderedKeyByChannel.set(ch, key);
    }

    const gl: any = this.gl;
    gl.useProgram(this.program);

    // Blending to overlay (constant state reduces flicker)
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Set uniforms
    const canvasEl = gl.canvas as HTMLCanvasElement;
    const screenW = canvasEl.width;
    const screenH = canvasEl.height;

    gl.uniform2f(this.uScreenSize, screenW, screenH);
  // Snap to integer pixels to reduce subpixel filter jitter and overdraw
  gl.uniform2f(this.uTranslate, Math.round(anchorX), Math.round(anchorY));
    gl.uniform2f(this.uSize, this.texWidth, this.texHeight);

    gl.uniform1i(this.uSampler, 0);

    // Bind VAO/VBO and draw
    const vaoExt = !('bindVertexArray' in gl) ? gl.getExtension('OES_vertex_array_object') : null;
    if (this.vao) {
      if ('bindVertexArray' in gl) gl.bindVertexArray(this.vao);
      else vaoExt.bindVertexArrayOES(this.vao);
    } else {
      // WebGL1 without VAO extension fallback
      const loc = 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 8, 0);
    }
    // bind the right texture for this key
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    // Unbind
    if (this.vao) {
      if ('bindVertexArray' in gl) gl.bindVertexArray(null);
      else (vaoExt as any).bindVertexArrayOES(null);
    }
  }
}
