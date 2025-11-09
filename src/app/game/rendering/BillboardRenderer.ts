import { Vector3 } from '../../types/game.types';
import { GameLogger } from '../utils/GameLogger';
import { LogCategory } from '../../services/logging.service';

/**
 * BillboardRenderer: renders camera-facing quads in world space with a texture.
 * Used for distant LOD impostors (e.g., planets at very large distances).
 */
export class BillboardRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private ibo: WebGLBuffer | null = null;
  private quadVertices: Float32Array = new Float32Array(4 * 5); // x,y,z,u,v for 4 verts
  private textures: Map<string, WebGLTexture> = new Map();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.initGL();
  }

  private initGL(): void {
    const gl = this.gl;
    // Simple unlit textured shader in world space
    const vsSrc = `#version 300 es\nprecision mediump float;\n
      layout(location=0) in vec3 a_pos;\nlayout(location=1) in vec2 a_uv;\n
      uniform mat4 u_view;\nuniform mat4 u_proj;\n
      out vec2 v_uv;\n
      void main(){\n        v_uv = a_uv;\n        gl_Position = u_proj * u_view * vec4(a_pos, 1.0);\n      }`;
    const fsSrc = `#version 300 es\nprecision mediump float;\n
      in vec2 v_uv;\nout vec4 frag;\nuniform sampler2D u_tex;\nuniform vec4 u_tint;\n
      void main(){\n        vec4 tex = texture(u_tex, v_uv);\n        // Descartar fragmentos casi transparentes para evitar halos y depth punch-through visual\n        if (tex.a * u_tint.a < 0.01) { discard; }\n        frag = tex * u_tint;\n      }`;
    const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
    const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      try { GameLogger.error(LogCategory.SHADERS, 'BillboardRenderer shader link error', { info: gl.getProgramInfoLog(prog) }); } catch {}
    }
    gl.deleteShader(vs); gl.deleteShader(fs);
    this.program = prog;

    // Quad indices (two triangles)
    const indices = new Uint16Array([0,1,2, 0,2,3]);
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.ibo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.quadVertices, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    const stride = 5 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 3 * 4);
    gl.bindVertexArray(null);
  }

  /** Create or get a circular soft-edge texture (keyed by hex color) */
  public getCircleTexture(hex: string): WebGLTexture {
    const key = `circle-${hex}`;
    const existing = this.textures.get(key);
    if (existing) return existing;
    const tex = this.createCircleTexture(hex);
    this.textures.set(key, tex);
    return tex;
  }

  /** Create a specific Earth-split sprite texture (cached) */
  public getEarthSplitTexture(): WebGLTexture {
    const key = 'earth-split';
    const existing = this.textures.get(key);
    if (existing) return existing;
    const tex = this.createEarthSplitTexture();
    this.textures.set(key, tex);
    return tex;
  }

  /** Create or get a cached elliptical ring (annulus) texture for distant ring visuals */
  public getRingTexture(key: string = 'ring-default'): WebGLTexture {
    const existing = this.textures.get(key);
    if (existing) return existing;
    const tex = this.createRingTexture();
    this.textures.set(key, tex);
    return tex;
  }

  private createCircleTexture(hex: string): WebGLTexture {
    const gl = this.gl;
    const size = 128;
    const cnv = document.createElement('canvas'); cnv.width = size; cnv.height = size;
    const ctx = cnv.getContext('2d')!;
    ctx.clearRect(0,0,size,size);
    const cx = size/2, cy = size/2, r = size*0.46;
    // Soft edge circle with slight limb darkening and alpha falloff at the rim
    const grad = ctx.createRadialGradient(cx, cy, r*0.15, cx, cy, r*1.02);
    // convert hex to rgb
    const rgb = this.hexToRgb(hex) || { r: 200, g: 200, b: 200 };
    const c1 = `rgba(${rgb.r},${rgb.g},${rgb.b},1)`;
    const cMid = `rgba(${Math.round(rgb.r*0.75)},${Math.round(rgb.g*0.75)},${Math.round(rgb.b*0.75)},0.95)`;
    const cEdge = `rgba(${Math.round(rgb.r*0.6)},${Math.round(rgb.g*0.6)},${Math.round(rgb.b*0.6)},0.0)`;
    grad.addColorStop(0.0, c1);
    grad.addColorStop(0.85, cMid);
    grad.addColorStop(1.0, cEdge);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
    return this.uploadCanvasTexture(cnv);
  }

  private createEarthSplitTexture(): WebGLTexture {
    const size = 128;
    const cnv = document.createElement('canvas'); cnv.width = size; cnv.height = size;
    const ctx = cnv.getContext('2d')!;
    const cx = size/2, cy = size/2; const r = size*0.46;
    ctx.clearRect(0,0,size,size);
  // draw two hemispheres separated by a slightly smaller gap
    ctx.save();
    const topGrad = ctx.createRadialGradient(cx, cy - r*0.2, r*0.1, cx, cy - r*0.2, r);
    topGrad.addColorStop(0, 'rgba(120,180,255,1)');
    topGrad.addColorStop(1, 'rgba(60,90,150,1)');
    ctx.fillStyle = topGrad;
  ctx.beginPath(); ctx.arc(cx, cy - r*0.20, r*0.9, Math.PI, 0); ctx.fill();
    const botGrad = ctx.createRadialGradient(cx, cy + r*0.2, r*0.1, cx, cy + r*0.2, r);
    botGrad.addColorStop(0, 'rgba(120,180,255,1)');
    botGrad.addColorStop(1, 'rgba(60,90,150,1)');
    ctx.fillStyle = botGrad;
  ctx.beginPath(); ctx.arc(cx, cy + r*0.20, r*0.9, 0, Math.PI); ctx.fill();
    // dotted debris ring
    ctx.strokeStyle = 'rgba(200,200,200,0.9)';
    ctx.fillStyle = 'rgba(210,210,210,0.9)';
    const debrisCount = 42;
    for (let i=0;i<debrisCount;i++){
      const t = (i/debrisCount)*Math.PI*2;
      const rr = r*1.25 + (Math.random()-0.5)*r*0.06; // tighter ring
      const x = cx + Math.cos(t)*rr;
      const y = cy + Math.sin(t)*rr*0.55; // less vertical dispersion
      const s = 1 + Math.random()*1.5;
      ctx.beginPath(); ctx.arc(x,y,s,0,Math.PI*2); ctx.fill();
    }
  // emphasize a few mega-asteroids as larger bright points
    for (let i=0;i<6;i++){
      const t = Math.random()*Math.PI*2;
      const rr = r*1.25 + (Math.random()-0.5)*r*0.045; // tighter mega-asteroids
      const x = cx + Math.cos(t)*rr;
      const y = cy + Math.sin(t)*rr*0.55;
      const s = 2.5 + Math.random()*2.0; // larger
      // soft glow: draw a faint outer circle first
      const grad = ctx.createRadialGradient(x,y,0, x,y,s*2.2);
      grad.addColorStop(0, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(x,y,s*2.2,0,Math.PI*2); ctx.fill();
      // core
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(x,y,s,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
    // Apply a soft circular alpha mask so the sprite has a transparent contour
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    const mask = ctx.createRadialGradient(cx, cy, r*0.85, cx, cy, r*1.02);
    mask.addColorStop(0.0, 'rgba(255,255,255,1)');
    mask.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = mask;
    ctx.fillRect(0,0,size,size);
    ctx.restore();
    return this.uploadCanvasTexture(cnv);
  }

  private createRingTexture(): WebGLTexture {
    const size = 256; // larger for cleaner edges
    const cnv = document.createElement('canvas'); cnv.width = size; cnv.height = size;
    const ctx = cnv.getContext('2d')!;
    ctx.clearRect(0,0,size,size);
    const cx = size/2, cy = size/2;
    // Ellipse scale to suggest tilt
    const ellipseYScale = 0.58;
    const outerR = size * 0.47;
    const innerR = size * 0.30;
    // Base ring color palette (subtle beige/gray)
    const bands = [
      { w: 1.00, color: 'rgba(210,200,180,0.75)' },
      { w: 0.92, color: 'rgba(220,210,190,0.85)' },
      { w: 0.84, color: 'rgba(205,195,175,0.90)' },
      { w: 0.76, color: 'rgba(225,215,195,0.80)' },
      { w: 0.68, color: 'rgba(200,190,170,0.92)' },
      { w: 0.60, color: 'rgba(215,205,185,0.85)' }
    ];
    // Draw outer soft fade
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, ellipseYScale);
    const gradOuter = ctx.createRadialGradient(0, 0, outerR*0.92, 0, 0, outerR*1.02);
    gradOuter.addColorStop(0, 'rgba(255,255,255,0.0)');
    gradOuter.addColorStop(1, 'rgba(255,255,255,0.0)');
    // Background remains transparent; we'll paint bands below
    ctx.restore();
    // Paint banded ring from outside to inside
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, ellipseYScale);
    for (let i = 0; i < bands.length; i++) {
      const t0 = i / bands.length;
      const t1 = (i+1) / bands.length;
      const r0 = outerR - (outerR - innerR) * t0;
      const r1 = outerR - (outerR - innerR) * t1;
      ctx.fillStyle = bands[i].color;
      // Outer disk slice
      ctx.beginPath();
      ctx.ellipse(0, 0, r0, r0, 0, 0, Math.PI*2);
      ctx.ellipse(0, 0, r1, r1, 0, 0, Math.PI*2);
      ctx.fill('evenodd');
    }
    // Soft edges: feather outer and inner boundaries
    const feather = 8;
    for (let k = 0; k < feather; k++) {
      const a = (feather - k) / feather * 0.08;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      // Outer feather (expand by k)
      ctx.beginPath();
      ctx.ellipse(0, 0, outerR + k, outerR + k, 0, 0, Math.PI*2);
      ctx.ellipse(0, 0, outerR, outerR, 0, 0, Math.PI*2);
      ctx.fill('evenodd');
      // Inner feather (shrink by k)
      ctx.beginPath();
      ctx.ellipse(0, 0, innerR - k, innerR - k, 0, 0, Math.PI*2);
      ctx.ellipse(0, 0, innerR, innerR, 0, 0, Math.PI*2);
      ctx.fill('evenodd');
    }
    ctx.restore();
    // Add a slight noise grain to break perfect uniformity
    ctx.save();
    const noiseAlpha = 0.06;
    const img = ctx.getImageData(0,0,size,size);
    const d = img.data;
    for (let i=0; i<d.length; i+=4) {
      const n = (Math.random()*2 - 1) * 18; // +/- 18
      d[i] = Math.min(255, Math.max(0, d[i] + n));
      d[i+1] = Math.min(255, Math.max(0, d[i+1] + n));
      d[i+2] = Math.min(255, Math.max(0, d[i+2] + n));
      // alpha stays as computed by band fills
    }
    ctx.putImageData(img, 0, 0);
    ctx.restore();
    // Convert to WebGL texture
    return this.uploadCanvasTexture(cnv);
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return null;
    return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
  }

  private uploadCanvasTexture(canvas: HTMLCanvasElement): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip ? 1 : 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  /** Renders a billboard at world position with a given texture and pixel diameter on screen */
  public render(position: Vector3, pixelDiameter: number, viewMatrix: Float32Array, projectionMatrix: Float32Array, cameraPosition: Vector3, cameraUp: Vector3, cameraRight: Vector3, tint: [number,number,number,number], texture: WebGLTexture): void {
    if (!this.program || !this.vao || !this.vbo) return;
    const gl = this.gl;

    // Compute world size from desired pixel size
    const proj = projectionMatrix as unknown as Float32Array;
    const f = proj[5] || 1.0; // 1/tan(fov/2)
    const fovV = 2 * Math.atan(1 / f);
    const heightPx = (gl.canvas as HTMLCanvasElement).height || 1;
  const dx = position.x - cameraPosition.x; const dy = position.y - cameraPosition.y; const dz = position.z - cameraPosition.z;
    const distance = Math.hypot(dx, dy, dz) || 1;
    const worldDiameter = (pixelDiameter * distance * fovV) / heightPx;
    const half = worldDiameter * 0.5;

  // Use camera basis passed from caller (world space)
  const right = { x: cameraRight.x, y: cameraRight.y, z: cameraRight.z };
  const up    = { x: cameraUp.x, y: cameraUp.y, z: cameraUp.z };
    // Normalize
    const rl = Math.hypot(right.x, right.y, right.z) || 1; right.x/=rl; right.y/=rl; right.z/=rl;
    const ul = Math.hypot(up.x, up.y, up.z) || 1; up.x/=ul; up.y/=ul; up.z/=ul;

    // Corners in world space (v0..v3)
    const v0 = { x: position.x - right.x*half - up.x*half, y: position.y - right.y*half - up.y*half, z: position.z - right.z*half - up.z*half };
    const v1 = { x: position.x + right.x*half - up.x*half, y: position.y + right.y*half - up.y*half, z: position.z + right.z*half - up.z*half };
    const v2 = { x: position.x + right.x*half + up.x*half, y: position.y + right.y*half + up.y*half, z: position.z + right.z*half + up.z*half };
    const v3 = { x: position.x - right.x*half + up.x*half, y: position.y - right.y*half + up.y*half, z: position.z - right.z*half + up.z*half };

    // Update vertex buffer (x,y,z,u,v)
    const verts = this.quadVertices;
    verts.set([v0.x, v0.y, v0.z, 0, 0,  v1.x, v1.y, v1.z, 1, 0,  v2.x, v2.y, v2.z, 1, 1,  v3.x, v3.y, v3.z, 0, 1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);

    // Render
    const wasBlend = gl.isEnabled(gl.BLEND);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
  gl.enable(gl.DEPTH_TEST);
  // For transparent billboards, do not write depth to avoid square occlusion artifacts
  const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
  gl.depthMask(false);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    const uView = gl.getUniformLocation(this.program, 'u_view');
    const uProj = gl.getUniformLocation(this.program, 'u_proj');
    const uTint = gl.getUniformLocation(this.program, 'u_tint');
    const uTex = gl.getUniformLocation(this.program, 'u_tex');
    if (uView) gl.uniformMatrix4fv(uView, false, viewMatrix);
    if (uProj) gl.uniformMatrix4fv(uProj, false, projectionMatrix);
    if (uTint) gl.uniform4fv(uTint, new Float32Array(tint));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (uTex) gl.uniform1i(uTex, 0);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // restore
    gl.bindVertexArray(null);
    if (!wasBlend) gl.disable(gl.BLEND);
    if (!wasDepth) gl.disable(gl.DEPTH_TEST);
    gl.depthMask(prevDepthMask);
  }

  // No-op helper retained for potential future usage
  private getCameraPositionFromView(_view: Float32Array): { x: number; y: number; z: number } { return { x: 0, y: 0, z: 0 }; }
}
