import { Vector3 } from '../../types/game.types';

/**
 * SolarSystemPanel: renders a full-screen, opaque top-down map of the solar system
 * onto a canvas, then draws it as a textured quad in front of the camera.
 * - Always considers clusters regardless of gameplay culling.
 * - Scales so the farthest object from the chosen center fits within the panel with a margin.
 */
export class SolarSystemPanel {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private ibo: WebGLBuffer | null = null;
  private program: WebGLProgram | null = null;
  private enabled: boolean = false;
  private lastViewportW = 0;
  private lastViewportH = 0;

  constructor(gl: WebGL2RenderingContext, width: number = 1024, height: number = 1024) {
    this.gl = gl;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('SolarSystemPanel: 2D context not available');
    this.ctx = ctx;
    this.initGLResources();
  }

  public setEnabled(v: boolean) { this.enabled = v; }
  public isEnabled(): boolean { return this.enabled; }

  private initGLResources(): void {
    const gl = this.gl;
    // Create texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Fullscreen quad (clip-space coords)
    const vertices = new Float32Array([
      // x, y, u, v
      -1, -1, 0, 0,
       1, -1, 1, 0,
       1,  1, 1, 1,
      -1,  1, 0, 1,
    ]);
    const indices = new Uint16Array([0,1,2, 0,2,3]);

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.ibo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Simple textured quad shader
    const vsSrc = `#version 300 es\nprecision mediump float;\nlayout(location=0) in vec2 a_pos;\nlayout(location=1) in vec2 a_uv;\nout vec2 v_uv;\nvoid main(){ v_uv = a_uv; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
    const fsSrc = `#version 300 es\nprecision mediump float;\nuniform sampler2D u_tex;\nin vec2 v_uv;\nout vec4 frag;\nvoid main(){ frag = texture(u_tex, v_uv); }`;
    const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
    const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('SolarSystemPanel shader link error', gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs); gl.deleteShader(fs);
    this.program = prog;

    // Enable attributes
    const stride = 4 * 4; // 4 floats per vertex
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);

    gl.bindVertexArray(null);
  }

  /**
   * Draw a top-down (Y-axis) map to the internal canvas and upload to texture.
   */
  public updateMap(data: {
    center: Vector3;
    planets: Array<{ id: string; pos: Vector3; orbit?: { center: Vector3; a: number; b: number; orient: number } }>;
    clusters: Array<{ id: string; center: Vector3 }>; // always included regardless of gameplay culling
    debris: Array<{ id: string; pos: Vector3 }>; // e.g., Earth mega-asteroids
    ship?: { pos: Vector3 };
    marginPx?: number;
  }): void {
    const c = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const cx = W / 2, cy = H / 2;
    const margin = Math.max(16, Math.min(128, data.marginPx ?? 48));

    // 1) Compute max radial distance in XZ plane from center
    let maxR = 1;
    const radXZ = (p: Vector3) => Math.hypot(p.x - data.center.x, p.z - data.center.z);
    for (const p of data.planets) maxR = Math.max(maxR, radXZ(p.pos));
    for (const d of data.debris) maxR = Math.max(maxR, radXZ(d.pos));
    for (const cl of data.clusters) maxR = Math.max(maxR, radXZ(cl.center));
    if (data.ship) maxR = Math.max(maxR, radXZ(data.ship.pos));

    const Rpanel = Math.min(cx, cy) - margin;
    const s = (maxR > 0) ? (Rpanel / maxR) : 1;

    // 2) Clear opaque background
    c.save();
    c.fillStyle = '#05060a'; // deep dark
    c.fillRect(0, 0, W, H);

    // 3) Draw orbits as ellipses
    c.strokeStyle = 'rgba(160,180,220,0.55)';
    c.lineWidth = 1;
    for (const p of data.planets) {
      if (!p.orbit) continue;
      const oc = p.orbit.center;
      const a = p.orbit.a; const b = p.orbit.b; const ang = p.orbit.orient;
      // Sample ellipse with 256 points
      c.beginPath();
      const cosA = Math.cos(ang), sinA = Math.sin(ang);
      for (let i = 0; i <= 256; i++) {
        const t = (i / 256) * Math.PI * 2;
        const ex = Math.cos(t) * a;
        const ez = Math.sin(t) * b;
        // Rotate by orient and translate
        const rx = ex * cosA - ez * sinA; const rz = ex * sinA + ez * cosA;
        const worldX = oc.x + rx; const worldZ = oc.z + rz;
        const px = cx + (worldX - data.center.x) * s;
        const py = cy - (worldZ - data.center.z) * s;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke();
    }

    // 4) Draw objects
    const drawDot = (pos: Vector3, r: number, color: string) => {
      const px = cx + (pos.x - data.center.x) * s;
      const py = cy - (pos.z - data.center.z) * s;
      c.beginPath(); c.fillStyle = color; c.arc(px, py, Math.max(1, r), 0, Math.PI * 2); c.fill();
    };

    // Sun/center
    drawDot(data.center, 5, '#ffe08a');
    // Planets
    for (const p of data.planets) drawDot(p.pos, 3, '#68a0ff');
    // Debris
    c.fillStyle = '#e88d3a';
    for (const d of data.debris) drawDot(d.pos, 1.5, '#e88d3a');
    // Clusters (always included)
    for (const cl of data.clusters) drawDot(cl.center, 2.5, '#9ae6b4');
    // Ship
    if (data.ship) drawDot(data.ship.pos, 3.5, '#ff5d5d');

    // 5) Border
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.lineWidth = 2; c.strokeRect(1, 1, W - 2, H - 2);
    c.restore();

    // Upload to texture
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** Draws the fullscreen panel in front of the scene (opaque) */
  public render(viewportW: number, viewportH: number): void {
    if (!this.enabled || !this.texture || !this.program || !this.vao) return;
    const gl = this.gl;

    // Save previous GL state
    const prevBlend = gl.isEnabled(gl.BLEND);
    const prevDepth = gl.isEnabled(gl.DEPTH_TEST);

    // Opaque panel: depth off, blending off
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // Adjust viewport if changed (optional; we rely on caller's viewport)
    this.lastViewportW = viewportW; this.lastViewportH = viewportH;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const loc = gl.getUniformLocation(this.program, 'u_tex');
    gl.uniform1i(loc, 0);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // Restore
    gl.bindVertexArray(null);
    if (prevBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
    if (prevDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  }
}
