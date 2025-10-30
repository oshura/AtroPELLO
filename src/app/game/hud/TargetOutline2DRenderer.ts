import { Injectable } from '@angular/core';
import { WebGLService } from '../../services/webgl.service';

interface OutlineRenderData {
  x: number; // screen px
  y: number; // screen px
  name: string;
  typeLabel: string;
  distanceEdge: number; // units to edge
  color: string; // css hex or rgba
  healthPct?: number; // 0-100 if available
}

@Injectable({ providedIn: 'root' })
export class TargetOutline2DRenderer {
  private gl: WebGL2RenderingContext | null = null;

  // GL resources
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;

  // Uniforms
  private uScreenSize: WebGLUniformLocation | null = null;
  private uTranslate: WebGLUniformLocation | null = null;
  private uSize: WebGLUniformLocation | null = null;
  private uSampler: WebGLUniformLocation | null = null;

  // Texture from offscreen 2D canvas
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: WebGLTexture | null = null;
  private lastKey: string = '';

  // Fixed pixel size of the marker
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

  public initialize(): boolean {
    this.gl = this.webgl.getContext() as WebGL2RenderingContext;
    if (!this.gl) return false;

    const vsSource = `#version 300 es\n
    precision highp float;\n
    layout(location=0) in vec2 a_pos; // quad corners in px around origin (-0.5..+0.5 scaled)\n
    uniform vec2 u_screenSize;\n
    uniform vec2 u_translate; // px center on screen\n
    uniform vec2 u_size; // px size of quad (w,h)\n
    out vec2 v_uv;\n
    void main(){\n
      vec2 halfSize = 0.5 * u_size;\n
      vec2 posPx = u_translate + a_pos * u_size;\n
      // px -> NDC\n
      vec2 ndc = vec2(\n        (posPx.x / u_screenSize.x) * 2.0 - 1.0,\n
        1.0 - (posPx.y / u_screenSize.y) * 2.0\n
      );\n
      gl_Position = vec4(ndc, 0.0, 1.0);\n
      // map a_pos from [-0.5,0.5] to [0,1]\n
      v_uv = a_pos + 0.5;\n
    }`;

    const fsSource = `#version 300 es\n
    precision highp float;\n
    in vec2 v_uv;\n
    uniform sampler2D u_sampler;\n
    out vec4 outColor;\n
    void main(){\n
      vec4 c = texture(u_sampler, v_uv);\n
      outColor = c;\n
    }`;

    const prog = this.createProgram(vsSource, fsSource);
    if (!prog) return false;
    this.program = prog;

    // Quad centered at origin, unit size in [-0.5,0.5]
    const verts = new Float32Array([
      -0.5, -0.5,
       0.5, -0.5,
       0.5,  0.5,
      -0.5,  0.5,
    ]);

    const gl = this.gl;
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);

    this.uScreenSize = gl.getUniformLocation(this.program, 'u_screenSize');
    this.uTranslate = gl.getUniformLocation(this.program, 'u_translate');
    this.uSize = gl.getUniformLocation(this.program, 'u_size');
    this.uSampler = gl.getUniformLocation(this.program, 'u_sampler');

    // Prepare texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return true;
  }

  private createProgram(vsSrc: string, fsSrc: string): WebGLProgram | null {
    const gl = this.gl!;
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

    // Background: fully transparent; design anchored at texture center
    const accent = data.color || '#60a5fa';
    const cx = W / 2;
    const cy = H / 2;

    // Helper: unit formatting (u -> ku if >= 1000u)
    const formatDist = (val: number) => {
      const v = Math.max(0, val);
      if (v >= 1000) return `${(v / 1000).toFixed(1)}ku`;
      return `${Math.round(v)}u`;
    };

    // Outer subtle ring
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.stroke();

    // Corner chevrons around the ring (integrated outline)
    ctx.lineWidth = 1.5;
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

    // Center dot
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(cx, cy, 2.25, 0, Math.PI * 2); ctx.fill();

    // Integrated micro text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Type (bold, above ring) in accent color
    ctx.fillStyle = accent;
    ctx.font = 'bold 11px Segoe UI, Roboto, Arial'; // Keep the same font style
  ctx.fillText(String(data.typeLabel || '').toUpperCase(), cx, cy - 38);

    // Name (slightly larger) also in accent color
    ctx.fillStyle = accent;
      ctx.font = '600 12px Segoe UI, Roboto, Arial'; // Keep the same font style
    const name = String(data.name || '');
    const maxW = 160;
    let rendered = name;
    if (ctx.measureText(rendered).width > maxW) {
      while (rendered.length > 3 && ctx.measureText(rendered + '…').width > maxW) {
        rendered = rendered.slice(0, -1);
      }
      rendered += '…';
    }
      ctx.fillText(rendered, cx, cy - 22); // Adjusted position

    // Bottom labels: health left, distance right; both in accent color
    ctx.fillStyle = accent;
      ctx.font = '600 12px Segoe UI, Roboto, Arial'; // Made bottom labels same size as name
    // Health bottom-left
    const hp = typeof data.healthPct === 'number' && isFinite(data.healthPct) ? Math.max(0, Math.min(100, Math.round(data.healthPct))) : null;
    ctx.textAlign = 'right';
    if (hp !== null) {
      ctx.fillText(`${hp}%`, cx - 28, cy + 26);
    }
    // Distance bottom-right
    ctx.textAlign = 'left';
    ctx.fillText(`${formatDist(data.distanceEdge)}`, cx + 28, cy + 26);
    ctx.restore();
  }

  private uploadTexture(): void {
    const gl = this.gl!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  public render(anchorX: number, anchorY: number, data: OutlineRenderData): void {
    if (!this.gl || !this.program || !this.vao) return;

    // Rebuild texture only when needed
  const key = `${data.name}|${data.typeLabel}|${Math.round(data.distanceEdge/5)}|${data.color}|${Math.round((data.healthPct ?? -1))}`;
    if (key !== this.lastKey) {
      this.drawToCanvas(data);
      this.uploadTexture();
      this.lastKey = key;
    }

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Blending to overlay
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const canvasEl = gl.canvas as HTMLCanvasElement;
    const screenW = canvasEl.width;
    const screenH = canvasEl.height;

    gl.uniform2f(this.uScreenSize, screenW, screenH);
    gl.uniform2f(this.uTranslate, anchorX, anchorY);
    gl.uniform2f(this.uSize, this.texWidth, this.texHeight);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uSampler, 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }
}
