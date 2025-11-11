import { WebGLService } from '../../services/webgl.service';
import { ShaderManager } from '../ShaderManager';
import { Portal } from '../Portal';

/**
 * PortalShaderService
 * Encapsula el uso de los shaders relacionados con el Portal (halo/runas, ojo, llama),
 * delegando la compilación/ubicaciones en ShaderManager y exponiendo una API clara.
 */
export class PortalShaderService {
  private gl: WebGL2RenderingContext | null = null;
  // Programa simple para pentáculo (líneas)
  private pentacleProgram: WebGLProgram | null = null;
  private pentacleAttribs: { [k: string]: number } = {};
  private pentacleUniforms: { [k: string]: WebGLUniformLocation | null } = {};
  // Círculo circunscrito (buffer estático)
  private circleVBO: WebGLBuffer | null = null;
  private circleCount: number = 0;
  // Círculo grueso (anillo) como TRIANGLE_STRIP
  private circleRingVBO: WebGLBuffer | null = null;
  private circleRingCount: number = 0;
  // Pentáculo grueso como TRIANGLES
  private pentacleThickVBO: WebGLBuffer | null = null;
  private pentacleThickCount: number = 0;
  constructor(private webgl: WebGLService, private shaders: ShaderManager) {
    this.gl = this.webgl.getContext() as WebGL2RenderingContext | null;
  }

  /** Inicializa recursos auxiliares (pentáculo) */
  public initialize(): void {
    const gl = this.gl;
    if (!gl) return;
    // Compilar shader para líneas del pentáculo (color + pulsación)
    const vsSrc = `#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 a_pos;\nuniform mat4 u_modelMatrix;\nuniform mat4 u_viewMatrix;\nuniform mat4 u_projectionMatrix;\nvoid main(){\n  vec4 world = u_modelMatrix * vec4(a_pos,1.0);\n  gl_Position = u_projectionMatrix * (u_viewMatrix * world);\n}`;
    const fsSrc = `#version 300 es\nprecision highp float;\nout vec4 fragColor;\nuniform float u_time;\nuniform vec3 u_color;\nvoid main(){\n  float pulse = 0.55 + 0.45 * (0.5 + 0.5 * sin(u_time * 3.2));\n  fragColor = vec4(u_color * pulse, 1.0);\n}`;
    const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
    const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl.deleteProgram(prog); return; }
    this.pentacleProgram = prog;
    this.pentacleAttribs['position'] = gl.getAttribLocation(prog, 'a_pos');
    this.pentacleUniforms['modelMatrix'] = gl.getUniformLocation(prog, 'u_modelMatrix');
    this.pentacleUniforms['viewMatrix'] = gl.getUniformLocation(prog, 'u_viewMatrix');
    this.pentacleUniforms['projectionMatrix'] = gl.getUniformLocation(prog, 'u_projectionMatrix');
    this.pentacleUniforms['time'] = gl.getUniformLocation(prog, 'u_time');
    this.pentacleUniforms['color'] = gl.getUniformLocation(prog, 'u_color');

    // Crear buffer de círculo unitario en plano XY (línea fina – legacy)
    const seg = 96;
    const verts: number[] = [];
    for (let i=0;i<seg;i++) {
      const a = (i/seg) * Math.PI * 2;
      verts.push(Math.cos(a), Math.sin(a), 0);
    }
    this.circleVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.circleVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    this.circleCount = seg;

    // Círculo grueso: anillo (outer R=1.0, inner R=1.0 - t)
  const t = 0.045; // grosor relativo (reducido a la mitad)
    const innerR = Math.max(0.0001, 1.0 - t);
    const ringVerts: number[] = [];
    for (let i=0;i<=seg;i++) { // <= para cerrar tira
      const a = (i/seg) * Math.PI * 2;
      const cx = Math.cos(a), sy = Math.sin(a);
      // Outer
      ringVerts.push(cx, sy, 0);
      // Inner
      ringVerts.push(cx * innerR, sy * innerR, 0);
    }
    this.circleRingVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.circleRingVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ringVerts), gl.STATIC_DRAW);
    this.circleRingCount = (seg + 1) * 2;

    // Pentáculo grueso: construir triángulos para cada segmento del orden 0-2-4-1-3-0
    const starR = 1.0;
    const starPts: Array<[number, number]> = [];
    for (let i=0;i<5;i++) {
      const ang = (-Math.PI/2) + i * 2*Math.PI/5;
      starPts.push([Math.cos(ang)*starR, Math.sin(ang)*starR]);
    }
    const order = [0,2,4,1,3,0];
  const halfW = 0.035; // grosor relativo del trazo del pentáculo (reducido a la mitad)
    const triVerts: number[] = [];
    for (let i=0;i<order.length-1;i++) {
      const ia = order[i], ib = order[i+1];
      const ax = starPts[ia][0], ay = starPts[ia][1];
      const bx = starPts[ib][0], by = starPts[ib][1];
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy/len, ny = dx/len; // perpendicular
      const ox = nx * halfW, oy = ny * halfW;
      // Quad corners
      const a0x = ax - ox, a0y = ay - oy;
      const a1x = ax + ox, a1y = ay + oy;
      const b1x = bx + ox, b1y = by + oy;
      const b0x = bx - ox, b0y = by - oy;
      // Triangles (a0,a1,b1) and (a0,b1,b0)
      triVerts.push(a0x, a0y, 0,  a1x, a1y, 0,  b1x, b1y, 0);
      triVerts.push(a0x, a0y, 0,  b1x, b1y, 0,  b0x, b0y, 0);
    }
    this.pentacleThickVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pentacleThickVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(triVerts), gl.STATIC_DRAW);
    this.pentacleThickCount = triVerts.length / 3;
  }

  /** Prepara el estado de mezcla/profundidad para efectos aditivos del portal. Devuelve estado previo. */
  public beginPortalBlend(): { blend: boolean; depth: boolean; depthMask: boolean; prevProgram: WebGLProgram | null } {
    const gl = this.gl!;
    const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const wasBlend = gl.isEnabled(gl.BLEND);
    const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    return { blend: wasBlend, depth: wasDepth, depthMask: prevDepthMask, prevProgram };
  }

  /** Restaura el estado de mezcla/profundidad anterior. */
  public endPortalBlend(state: { blend: boolean; depth: boolean; depthMask: boolean; prevProgram: WebGLProgram | null }): void {
    const gl = this.gl!;
    if (!state.blend) gl.disable(gl.BLEND);
    if (state.depth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    gl.depthMask(state.depthMask);
    if (state.prevProgram) gl.useProgram(state.prevProgram);
  }

  /** Configura y usa el shader de halo/runas del portal para un portal concreto. */
  // Halo desactivado: método conservado por compatibilidad pero sin dibujar.
  public useHaloShader(_portal: Portal, _view: Float32Array, _proj: Float32Array, _timeSec: number): void { /* halo removed */ }

  /** Dibuja el pentáculo grueso + círculo grueso en aditivo. */
  public renderPentacle(portal: Portal, view: Float32Array, proj: Float32Array, timeSec: number): void {
    const gl = this.gl;
    if (!gl || !this.pentacleProgram) return;
    gl.useProgram(this.pentacleProgram);
    const uM = this.pentacleUniforms['modelMatrix']; if (uM) gl.uniformMatrix4fv(uM, false, portal.modelMatrix);
    const uV = this.pentacleUniforms['viewMatrix']; if (uV) gl.uniformMatrix4fv(uV, false, view);
    const uP = this.pentacleUniforms['projectionMatrix']; if (uP) gl.uniformMatrix4fv(uP, false, proj);
    const uT = this.pentacleUniforms['time']; if (uT) gl.uniform1f(uT, timeSec);
  // Color carmesí brillante para el pentáculo
  const uC = this.pentacleUniforms['color']; if (uC) gl.uniform3fv(uC, new Float32Array([0.75, 0.0, 0.18]));
    const aPos = this.pentacleAttribs['position'];
    if (aPos < 0) return;
    // 1) Círculo grueso (anillo)
    if (this.circleRingVBO && this.circleRingCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.circleRingVBO);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.circleRingCount);
      gl.disableVertexAttribArray(aPos);
    }
    // 2) Pentáculo grueso (triángulos)
    if (this.pentacleThickVBO && this.pentacleThickCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pentacleThickVBO);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, this.pentacleThickCount);
      gl.disableVertexAttribArray(aPos);
    }
  }

  /** Devuelve la localización del atributo de posición para el shader de halo. */
  public getHaloPositionAttribLocation(): number {
    return (this.shaders as any).portalAttributes['position'] ?? -1;
  }
}
