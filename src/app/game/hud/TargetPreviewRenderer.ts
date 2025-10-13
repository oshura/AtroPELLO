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
  private angle = 0;

  // Simple program for flat shaded preview
  private program: WebGLProgram | null = null;
  private aPos = -1;
  private uMVP: WebGLUniformLocation | null = null;

  // Geometry buffers (a low-poly icosa-like sphere proxy)
  private vbo: WebGLBuffer | null = null;
  private ibo: WebGLBuffer | null = null;
  private indexCount = 0;

  constructor(width = 256, height = 192) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = this.canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true, alpha: true });
    this.gl = gl as WebGL2RenderingContext | null;
    if (this.gl) {
      this.initGL();
    }
  }

  getCanvas(): HTMLCanvasElement { return this.canvas; }

  update(dt: number) { this.angle += dt * 0.8; }

  renderPreview(target: ITargetable): void {
    if (!this.gl || !this.program) return;
    const gl = this.gl;

    // Clear transparent
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    gl.useProgram(this.program);

    // Build MVP (simple orbiting Y rotation)
    const aspect = this.canvas.width / this.canvas.height;
    const f = 1.0 / Math.tan(45 * Math.PI / 180 / 2);
    const zNear = 0.1, zFar = 100;
    const proj = new Float32Array([
      f/aspect,0,0,0,
      0,f,0,0,
      0,0,(zFar+zNear)/(zNear-zFar),-1,
      0,0,(2*zFar*zNear)/(zNear-zFar),0
    ]);

    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const model = new Float32Array([
      c,0,s,0,
      0,1,0,0,
      -s,0,c,0,
      0,0,-3,1
    ]);

    // MVP = proj * model (no view for simplicity)
    const mvp = this.mul4(proj, model);
    gl.uniformMatrix4fv(this.uMVP, false, mvp);

    // Draw proxy geometry
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(this.aPos);
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
      out vec4 fragColor;
      void main(){ fragColor = vec4(1.0,1.0,1.0,1.0); }
    `;

    const program = this.link(vs, fs);
    if (!program) return;
    this.program = program;
    this.aPos = 0;
    this.uMVP = gl.getUniformLocation(program, 'u_mvp');

    // Build a simple low-poly sphere-like geometry
    const { vertices, indices } = this.buildIcosaProxy();
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this.indexCount = indices.length;
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

  private mul4(a: Float32Array, b: Float32Array): Float32Array {
    const r = new Float32Array(16);
    for (let i=0;i<4;i++) {
      for (let j=0;j<4;j++) {
        r[i*4+j] = a[i*4+0]*b[0*4+j] + a[i*4+1]*b[1*4+j] + a[i*4+2]*b[2*4+j] + a[i*4+3]*b[3*4+j];
      }
    }
    return r;
  }
}
