import { ITargetable, TargetType } from '../types/targeting.types';

/**
 * Renders a simple rotating 3D preview of a target onto an offscreen canvas.
 * The result is a transparent PNG-like buffer suitable for compositing into the HUD Canvas 2D.
 *
 * Implementation is minimal and standalone to avoid touching global GL state.
 */
export class TargetPreviewRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement;
  private status: string = 'init';
  private angle = 0;
  private ctx2d: CanvasRenderingContext2D | null = null; // Fallback 2D

  // Simple program for flat shaded preview
  private program: WebGLProgram | null = null;
  private aPos = -1;
  private uMVP: WebGLUniformLocation | null = null;
  private uColor: WebGLUniformLocation | null = null;

  // Geometry buffers (a low-poly sphere-like proxy) in wireframe
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private lineIbo: WebGLBuffer | null = null;
  private lineIndexCount = 0;
  private triIbo: WebGLBuffer | null = null;
  private triIndexCount = 0;
  private lastMeshKey: string | null = null;

  constructor(width = 256, height = 192) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    // Intentar WebGL2 → fallback 2D (evitar WebGL1 por incompatibilidad con GLSL #version 300 es)
  const attrs: any = { antialias: true, premultipliedAlpha: false, alpha: true, preserveDrawingBuffer: true, depth: true, stencil: false, powerPreference: 'high-performance' };
    const gl2 = this.canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null;
    if (gl2) {
      this.gl = gl2;
      this.status = 'webgl2';
      this.initGL();
    } else {
      // Fallback 2D si no hay WebGL2
      this.ctx2d = this.canvas.getContext('2d');
      this.status = '2d-fallback';
    }
  }

  getCanvas(): HTMLCanvasElement { return this.canvas; }

  update(dt: number) { this.angle += dt * 0.4; /* rotación lenta */ }

  renderPreview(target: ITargetable): void {
    console.log('🖼️ TargetPreview.renderPreview()', { status: this.status, w: this.canvas.width, h: this.canvas.height });
    if (!this.gl || !this.program) {
      // Fallback 2D: dibujar cubo wireframe girando
      if (this.ctx2d) this.render2DFallback(target);
      return;
    }
    const gl = this.gl;

    // Clear transparent
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  // Intentar aumentar grosor de línea (no todos los backends lo soportan)
  try { (gl as any).lineWidth?.(2); } catch {}

    gl.useProgram(this.program);

    // Preparar geometría específica del target si está disponible
    this.ensureTargetGeometry(target);

    // Build MVP (column-major) with simple Y rotation and scale
  const aspect = this.canvas.width / this.canvas.height;
  const fovRad = 45 * Math.PI / 180;
  const proj = this.perspective(fovRad, aspect, 0.1, 100);
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
  const dist = -2.2;  // distancia fija de cámara
  const scale = this.computeAdaptiveScale(target, fovRad, aspect, dist);
    // Column-major model matrix: R_y * S, then translate z
    const model = new Float32Array(16);
    // first column (X axis)
    model[0] = c * scale; model[1] = 0;       model[2] = -s * scale; model[3] = 0;
    // second column (Y axis)
    model[4] = 0;         model[5] = scale;   model[6] = 0;          model[7] = 0;
    // third column (Z axis)
    model[8] = s * scale; model[9] = 0;       model[10]= c * scale;  model[11]= 0;
    // fourth column (translation)
    model[12]= 0;         model[13]= 0;       model[14]= dist;       model[15]= 1;

    // MVP = proj * model (no view for simplicity), column-major multiply
    const mvp = this.mul4(proj, model);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);

    // Hidden-line style rendering
    // 1) Depth prepass con triángulos (sin escribir color)
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.colorMask(false, false, false, false);
    if (this.triIbo && this.triIndexCount > 0) {
      if (this.vao) { gl.bindVertexArray(this.vao); }
      else {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.enableVertexAttribArray(this.aPos);
        gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.triIbo);
      gl.drawElements(gl.TRIANGLES, this.triIndexCount, gl.UNSIGNED_SHORT, 0);
      if (this.vao) { gl.bindVertexArray(null); }
      else { gl.disableVertexAttribArray(this.aPos); }
    }
    gl.colorMask(true, true, true, true);

    // 2) Pasada tenue: todas las aristas, sin depth test (para mostrar líneas ocultas)
    const faintColor = new Float32Array([0.0, 1.0, 1.0, 0.25]);
    if (this.uColor) gl.uniform4fv(this.uColor, faintColor);
    gl.disable(gl.DEPTH_TEST);
    if (this.vao) { gl.bindVertexArray(this.vao); }
    else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.enableVertexAttribArray(this.aPos);
      gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lineIbo);
    gl.drawElements(gl.LINES, this.lineIndexCount, gl.UNSIGNED_SHORT, 0);
    if (this.vao) { gl.bindVertexArray(null); }
    else { gl.disableVertexAttribArray(this.aPos); }

    // 3) Pasada brillante: aristas frontales con depth test habilitado para ocultar las traseras
    const brightColor = new Float32Array([0.0, 1.0, 1.0, 0.95]);
    if (this.uColor) gl.uniform4fv(this.uColor, brightColor);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    if (this.vao) {
      gl.bindVertexArray(this.vao);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.enableVertexAttribArray(this.aPos);
      gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lineIbo);
    gl.drawElements(gl.LINES, this.lineIndexCount, gl.UNSIGNED_SHORT, 0);
    if (this.vao) {
      gl.bindVertexArray(null);
    } else {
      gl.disableVertexAttribArray(this.aPos);
    }
    gl.flush();
  }

  private initGL() {
    const gl = this.gl!;
    const vs = `#version 300 es
      precision highp float;
      layout(location=0) in vec3 a_position;
      uniform mat4 u_mvp;
      void main(){ gl_Position = u_mvp * vec4(a_position,1.0); }
    `;
    const fs = `#version 300 es
      precision highp float;
      uniform vec4 u_color;
      out vec4 fragColor;
      void main(){ fragColor = u_color; } // color parametrizable
    `;

    const program = this.link(vs, fs);
    if (!program) {
      // Si no se pudo compilar/enlazar (p.ej., driver caprichoso), usar fallback 2D
      this.program = null;
      this.ctx2d = this.ctx2d || this.canvas.getContext('2d');
      this.status = 'shader-link-failed->2d';
      return;
    }
    this.program = program;
    this.aPos = 0;
    this.uMVP = gl.getUniformLocation(program, 'u_mvp');
    this.uColor = gl.getUniformLocation(program, 'u_color');
  this.status = 'webgl2-program-ok';

    // Inicializar buffers vacíos; la geometría se cargará por target o caerá en proxy
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(), gl.STATIC_DRAW);
  // Crear VAO para asegurar compatibilidad en WebGL2
  this.vao = gl.createVertexArray();
  gl.bindVertexArray(this.vao);
  gl.enableVertexAttribArray(this.aPos);
  gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
    // Crear IBO de líneas vacío inicialmente
    this.lineIbo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lineIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(), gl.STATIC_DRAW);
    this.lineIndexCount = 0;
    // Crear IBO de triángulos para prepass de profundidad
    this.triIbo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.triIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(), gl.STATIC_DRAW);
    this.triIndexCount = 0;
  }

  private link(vsSrc: string, fsSrc: string): WebGLProgram | null {
    const gl = this.gl!;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(vs)); return null; }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(fs)); return null; }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return null; }
    return prog;
  }

  public getStatus(): string { return this.status; }

  private buildIcosaProxy(): { vertices: Float32Array; indices: Uint16Array } {
    // A tiny proxy sphere based on cube subdiv or fixed octa; keep simple
    const v = new Float32Array([
      -1,-1, 1,  1,-1, 1,  1, 1, 1,  -1, 1, 1,
      -1,-1,-1,  1,-1,-1,  1, 1,-1,  -1, 1,-1
    ]);
    const idx = new Uint16Array([
      0,1,2, 0,2,3,
      1,5,6, 1,6,2,
      5,4,7, 5,7,6,
      4,0,3, 4,3,7,
      3,2,6, 3,6,7,
      4,5,1, 4,1,0
    ]);
    // Normalize to sphere-ish
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i], y = v[i+1], z = v[i+2];
      const l = Math.hypot(x,y,z) || 1;
      v[i] = x / l; v[i+1] = y / l; v[i+2] = z / l;
    }
    return { vertices: v, indices: idx };
  }

  private trianglesToUniqueLines(tri: Uint16Array): Uint16Array {
    const set = new Set<string>();
    const edges: number[] = [];
    const addEdge = (a: number, b: number) => {
      const i = a < b ? a : b;
      const j = a < b ? b : a;
      const key = i + ":" + j;
      if (!set.has(key)) {
        set.add(key);
        edges.push(i, j);
      }
    };
    for (let k = 0; k < tri.length; k += 3) {
      const i0 = tri[k], i1 = tri[k+1], i2 = tri[k+2];
      addEdge(i0, i1);
      addEdge(i1, i2);
      addEdge(i2, i0);
    }
    return new Uint16Array(edges);
  }

  // Carga geometría específica del target (si el objeto expone vertices/indices),
  // o usa un proxy genérico si no está disponible.
  private ensureTargetGeometry(target: ITargetable) {
    const gl = this.gl!;
    const anyT: any = target as any;
    let meshKey = 'proxy';

    const hasMesh = anyT && anyT.vertices instanceof Float32Array && anyT.indices instanceof Uint16Array && anyT.vertices.length > 0 && anyT.indices.length > 0;
    if (hasMesh) {
      meshKey = `${anyT.id || 'tgt'}:${anyT.vertices.length}:${anyT.indices.length}`;
    }

    if (this.lastMeshKey === meshKey) return; // ya configurado
    this.lastMeshKey = meshKey;

    let vertices: Float32Array;
    let indices: Uint16Array;
    if (hasMesh) {
      vertices = anyT.vertices as Float32Array;
      indices = anyT.indices as Uint16Array;
    } else {
      const proxy = this.buildIcosaProxy();
      vertices = proxy.vertices;
      indices = proxy.indices;
    }

    // Actualizar VBO
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Actualizar IBO de líneas a partir de triángulos
    const lineIndices = this.trianglesToUniqueLines(indices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lineIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lineIndices, gl.STATIC_DRAW);
    this.lineIndexCount = lineIndices.length;

    // Actualizar IBO de triángulos para prepass
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.triIbo!);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this.triIndexCount = indices.length;
  }

  // === FALLBACK 2D ===
  private render2DFallback(target: ITargetable) {
    if (!this.ctx2d) return;
    const ctx = this.ctx2d;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.save();
    ctx.strokeStyle = 'rgba(0,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.translate(w/2, h/2);
    // Escala adaptativa con margen del 82%
    const margin = 0.82;
    const baseMax = margin * 0.5 * Math.min(w,h);
    const refRadius = 2.0;
    const targetR = this.getTargetApproxRadius(target) || refRadius;
    const rel = targetR / refRadius;
    const scale = Math.min(baseMax, baseMax * Math.min(rel, 1));
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    // Intentar usar la malla del target si está disponible
    const anyT: any = target as any;
    const hasMesh = anyT && anyT.vertices instanceof Float32Array && anyT.indices instanceof Uint16Array && anyT.vertices.length > 0 && anyT.indices.length > 0;
    if (hasMesh) {
      const verts3 = anyT.vertices as Float32Array;
      const tris = anyT.indices as Uint16Array;
      const lineIdx = this.trianglesToUniqueLines(tris);
      // 1) Todas las líneas tenues
      ctx.save();
      ctx.strokeStyle = 'rgba(0,255,255,0.25)';
      for (let e = 0; e < lineIdx.length; e += 2) {
        const i = lineIdx[e] * 3, j = lineIdx[e+1] * 3;
        const x1 = verts3[i], y1 = verts3[i+1], z1 = verts3[i+2];
        const x2 = verts3[j], y2 = verts3[j+1], z2 = verts3[j+2];
        const rx1 = x1 * c + z1 * s; const rz1 = -x1 * s + z1 * c;
        const rx2 = x2 * c + z2 * s; const rz2 = -x2 * s + z2 * c;
        ctx.beginPath();
        ctx.moveTo(rx1 * scale, y1 * scale);
        ctx.lineTo(rx2 * scale, y2 * scale);
        ctx.stroke();
      }
      ctx.restore();

      // 2) Solo aristas de triángulos frontales en brillante
      ctx.save();
      ctx.strokeStyle = 'rgba(0,255,255,0.95)';
      for (let t = 0; t < tris.length; t += 3) {
        const i0 = tris[t]*3, i1 = tris[t+1]*3, i2 = tris[t+2]*3;
        const v0 = [verts3[i0], verts3[i0+1], verts3[i0+2]];
        const v1 = [verts3[i1], verts3[i1+1], verts3[i1+2]];
        const v2 = [verts3[i2], verts3[i2+1], verts3[i2+2]];
        const rv0 = [v0[0]*c + v0[2]*s, v0[1], -v0[0]*s + v0[2]*c];
        const rv1 = [v1[0]*c + v1[2]*s, v1[1], -v1[0]*s + v1[2]*c];
        const rv2 = [v2[0]*c + v2[2]*s, v2[1], -v2[0]*s + v2[2]*c];
        const e1 = [rv1[0]-rv0[0], rv1[1]-rv0[1], rv1[2]-rv0[2]];
        const e2 = [rv2[0]-rv0[0], rv2[1]-rv0[1], rv2[2]-rv0[2]];
        const n = [
          e1[1]*e2[2] - e1[2]*e2[1],
          e1[2]*e2[0] - e1[0]*e2[2],
          e1[0]*e2[1] - e1[1]*e2[0]
        ];
        if (n[2] > 0) {
          const drawEdge = (a: number[], b: number[]) => {
            ctx.beginPath();
            ctx.moveTo(a[0]*scale, a[1]*scale);
            ctx.lineTo(b[0]*scale, b[1]*scale);
            ctx.stroke();
          };
          drawEdge(rv0, rv1);
          drawEdge(rv1, rv2);
          drawEdge(rv2, rv0);
        }
      }
      ctx.restore();
    } else {
      // Proyección simple de un cubo como fallback
      const verts = [
        [-1,-1, 1], [ 1,-1, 1], [ 1, 1, 1], [-1, 1, 1],
        [-1,-1,-1], [ 1,-1,-1], [ 1, 1,-1], [-1, 1,-1]
      ];
      // Rotación Y
      const rotY = (v: number[]) => [ v[0]*c + v[2]*s, v[1], -v[0]*s + v[2]*c ];
      // Proyección ortográfica simple
      const proj = (v: number[]) => [ v[0]*scale, v[1]*scale ];
      const p: [number,number][] = verts.map(v => proj(rotY(v)) as [number,number]);
      const edges = [
        [0,1],[1,2],[2,3],[3,0],
        [4,5],[5,6],[6,7],[7,4],
        [0,4],[1,5],[2,6],[3,7]
      ];
      for (const [i,j] of edges) {
        ctx.beginPath();
        ctx.moveTo(p[i][0], p[i][1]);
        ctx.lineTo(p[j][0], p[j][1]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // === Escalado adaptativo (WebGL2) ===
  private getTargetApproxRadius(target: ITargetable): number {
    // Intentar varias fuentes: getter radius, boundingSphere, heurística por tipo
    const anyT = target as any;
    if (typeof anyT.radius === 'number') return Number(anyT.radius);
    if (typeof anyT.getRadius === 'function') {
      try { const v = anyT.getRadius(); if (typeof v === 'number') return v; } catch {}
    }
    if (anyT.boundingSphere && typeof anyT.boundingSphere.radius === 'number') {
      return Number(anyT.boundingSphere.radius);
    }
    // Heurística por tipo conocida
    if (typeof anyT.getTargetType === 'function' && anyT.getTargetType() === 'asteroid') {
      return 2.0; // valor medio
    }
    return 1.0; // por defecto
  }

  private computeAdaptiveScale(target: ITargetable, fovRad: number, aspect: number, dist: number): number {
    const f = 1.0 / Math.tan(fovRad / 2);
    const margin = 0.82; // margen para que no toque bordes
    // Máximo scale permisible para un radio unitario sin salirse del viewport
    const fitY = margin * (-dist) / f;
    const fitX = margin * (-dist) * aspect / f;
    const fitMax = Math.min(fitY, fitX);
    // Dimensionar relativo al radio del target frente a uno de referencia
    const refRadius = 2.0; // ~punto medio de asteroides
    const targetR = this.getTargetApproxRadius(target) || refRadius;
    const rel = targetR / refRadius; // <1 => más pequeño, >1 => más grande
    // No exceder el máximo para que quepa con margen
    const scale = Math.min(rel, 1.0) * fitMax;
    return Math.max(scale, 0.1); // evitar 0
  }

  // Column-major 4x4 matrix multiply: out = a * b
  private mul4(a: Float32Array, b: Float32Array): Float32Array {
    const out = new Float32Array(16);
    for (let j = 0; j < 4; j++) { // column of result
      const bj0 = b[j*4 + 0], bj1 = b[j*4 + 1], bj2 = b[j*4 + 2], bj3 = b[j*4 + 3];
      for (let i = 0; i < 4; i++) { // row of result
        out[j*4 + i] = a[0*4 + i] * bj0 + a[1*4 + i] * bj1 + a[2*4 + i] * bj2 + a[3*4 + i] * bj3;
      }
    }
    return out;
  }

  // Column-major perspective matrix
  private perspective(fovyRad: number, aspect: number, near: number, far: number): Float32Array {
    const f = 1.0 / Math.tan(fovyRad / 2);
    const nf = 1 / (near - far);
    const out = new Float32Array(16);
    out[0] = f / aspect; out[1] = 0; out[2] = 0;                         out[3] = 0;
    out[4] = 0;          out[5] = f; out[6] = 0;                         out[7] = 0;
    out[8] = 0;          out[9] = 0; out[10]= (far + near) * nf;         out[11]= -1;
    out[12]= 0;          out[13]= 0; out[14]= (2 * far * near) * nf;     out[15]= 0;
    return out;
  }
}
