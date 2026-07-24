import { GameLogger } from '../utils/GameLogger';
import { LogCategory } from '../../services/logging.service';

/**
 * PlanetRingRenderer — anillo plano real (annulus) en el plano ecuatorial del planeta, con bandas
 * procedurales semitransparentes. Se dibuja con la modelMatrix del planeta (hereda posición + tilt +
 * escala/radio); las bandas son circulares → el giro rápido no afecta. Ver docs/ARQUITECTURA.md §10.b.
 *
 * Radios en unidades de esfera-unidad local (× radio del planeta): inner 1.28, outer 2.35 → proporción
 * tipo Saturno. Se dibuja a TODAS las distancias (sin sprite). Convive con el cinturón de megaasteroides.
 */
const INNER = 1.28;
const OUTER = 2.35;
const SEGMENTS = 160;

const VERTEX_SRC = `#version 300 es
precision highp float;
in vec3 a_position;
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
out vec3 v_local;
void main(){
  vec4 world = u_modelMatrix * vec4(a_position, 1.0);
  gl_Position = u_projectionMatrix * (u_viewMatrix * world);
  v_local = a_position;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec3 v_local;
out vec4 fragColor;
uniform float u_inner;
uniform float u_outer;
uniform vec3  u_colorA;
uniform vec3  u_colorB;

float hash(float x){ return fract(sin(x * 127.1) * 43758.5453); }

void main(){
  float r = length(v_local.xz);
  float t = (r - u_inner) / (u_outer - u_inner);
  if (t < 0.0 || t > 1.0) discard;

  // Bandas concéntricas: fina + gruesa + grano por anillo
  float fine = 0.5 + 0.5 * sin(t * 190.0);
  float coarse = 0.5 + 0.5 * sin(t * 24.0 + 1.3);
  float grain = 0.7 + 0.3 * hash(floor(t * 200.0));
  float density = mix(0.30, 0.95, coarse) * (0.55 + 0.45 * fine) * grain;

  // Huecos tipo "División de Cassini"
  density *= 1.0 - 0.85 * (smoothstep(0.44, 0.46, t) - smoothstep(0.49, 0.51, t));
  density *= 1.0 - 0.55 * (smoothstep(0.70, 0.71, t) - smoothstep(0.73, 0.74, t));

  vec3 col = mix(u_colorA, u_colorB, 0.5 * coarse + 0.3 * fine);
  float alpha = clamp(density, 0.0, 1.0) * 0.82;
  // Desvanecer bordes interior/exterior
  alpha *= smoothstep(0.0, 0.05, t) * smoothstep(1.0, 0.95, t);
  fragColor = vec4(col, alpha);
}`;

export class PlanetRingRenderer {
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private ibo: WebGLBuffer | null = null;
  private indexCount = 0;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(private gl: WebGL2RenderingContext) {
    this.program = this.build();
    if (this.program) {
      for (const nm of ['u_modelMatrix', 'u_viewMatrix', 'u_projectionMatrix', 'u_inner', 'u_outer', 'u_colorA', 'u_colorB']) {
        this.uniforms[nm] = gl.getUniformLocation(this.program, nm);
      }
      this.buildMesh();
    }
  }

  /** Dibuja el anillo con la modelMatrix del planeta. Guarda/restaura estado GL (blend/cull/depthMask). */
  public render(modelMatrix: Float32Array, viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    const gl = this.gl;
    if (!this.program || !this.vao) return;
    const prevProg = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const wasBlend = gl.isEnabled(gl.BLEND);
    const wasCull = gl.isEnabled(gl.CULL_FACE);
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);       // anillo visible por ambas caras
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);            // no escribe profundidad (translúcido)

    gl.useProgram(this.program);
    const u = this.uniforms;
    if (u['u_modelMatrix']) gl.uniformMatrix4fv(u['u_modelMatrix'], false, modelMatrix);
    if (u['u_viewMatrix']) gl.uniformMatrix4fv(u['u_viewMatrix'], false, viewMatrix);
    if (u['u_projectionMatrix']) gl.uniformMatrix4fv(u['u_projectionMatrix'], false, projectionMatrix);
    if (u['u_inner']) gl.uniform1f(u['u_inner'], INNER);
    if (u['u_outer']) gl.uniform1f(u['u_outer'], OUTER);
    if (u['u_colorA']) gl.uniform3fv(u['u_colorA'], [0.78, 0.72, 0.60]);
    if (u['u_colorB']) gl.uniform3fv(u['u_colorB'], [0.90, 0.86, 0.74]);

    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    gl.depthMask(prevDepthMask);
    if (wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
    if (!wasBlend) gl.disable(gl.BLEND);
    if (prevProg) gl.useProgram(prevProg);
  }

  private buildMesh(): void {
    const gl = this.gl;
    const verts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const cs = Math.cos(a), sn = Math.sin(a);
      verts.push(INNER * cs, 0, INNER * sn); // vértice interior
      verts.push(OUTER * cs, 0, OUTER * sn); // vértice exterior
    }
    for (let i = 0; i < SEGMENTS; i++) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    this.indexCount = idx.length;
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.ibo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    const loc = this.program ? gl.getAttribLocation(this.program, 'a_position') : -1;
    if (loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);
  }

  private build(): WebGLProgram | null {
    const gl = this.gl;
    const vs = this.compile(gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      try { GameLogger.error(LogCategory.SHADERS, 'PlanetRingRenderer link error', { info: gl.getProgramInfoLog(prog) }); } catch {}
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  private compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl;
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      try { GameLogger.error(LogCategory.SHADERS, 'PlanetRingRenderer compile error', { info: gl.getShaderInfoLog(sh) }); } catch {}
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  public cleanup(): void {
    const gl = this.gl;
    if (this.program) { gl.deleteProgram(this.program); this.program = null; }
    if (this.vbo) { gl.deleteBuffer(this.vbo); this.vbo = null; }
    if (this.ibo) { gl.deleteBuffer(this.ibo); this.ibo = null; }
    if (this.vao) { gl.deleteVertexArray(this.vao); this.vao = null; }
  }
}
