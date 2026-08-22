import { ShaderManager } from '../../ShaderManager';

/**
 * Escudo visual del Void Cocoon (esfera aditiva con el shader de storm shell), extraído de
 * GameEngine (regla #1). Geometría creada UNA vez y cacheada; el motor sólo calcula los parámetros
 * del frame (matriz, tiempos, flash de impacto) y delega aquí.
 */
export interface VoidCocoonShieldParams {
  modelMatrix: Float32Array;
  viewMatrix: Float32Array;
  projectionMatrix: Float32Array;
  elapsedSec: number;
  /** Segundos restantes de capullo (modula la intensidad base; el máximo son 30). */
  remainingSec: number;
  /** 0..1: destello del último impacto absorbido. */
  impactFlash: number;
}

interface ShieldGeometry {
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  indexCount: number;
}

const BASE_COLOR = new Float32Array([0.08, 0.28, 0.42]);
const VEIN_COLOR = new Float32Array([0.45, 0.9, 1.0]);

export class VoidCocoonShieldRenderer {
  private geometry: ShieldGeometry | null = null;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly shaderManager: ShaderManager) {}

  draw(params: VoidCocoonShieldParams): void {
    const gl = this.gl;
    const sm = this.shaderManager;
    if (!sm.stormShellProgram || !this.ensureGeometry()) {
      return;
    }
    const mesh = this.geometry!;
    const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const wasBlend = gl.isEnabled(gl.BLEND);
    const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
    const prevDepthMask = !!gl.getParameter(gl.DEPTH_WRITEMASK);
    const wasCull = gl.isEnabled(gl.CULL_FACE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    const normalized = Math.max(0, Math.min(1, params.remainingSec / 30));
    const baseIntensity = 0.55 + 0.35 * normalized + 0.15 * Math.sin(params.elapsedSec * 2.4);

    sm.useStormShellProgram();
    sm.setStormShellMatrices(params.modelMatrix, params.viewMatrix, params.projectionMatrix);
    sm.setStormShellParams(
      params.elapsedSec,
      Math.min(1.3, baseIntensity),
      Math.min(1, Math.max(0, params.impactFlash)),
      1.08,
      BASE_COLOR,
      VEIN_COLOR,
    );

    const posLoc = sm.stormShellAttributes['position'];
    if (posLoc !== undefined && posLoc >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(posLoc);
    }

    gl.depthMask(prevDepthMask);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (wasBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
    if (wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    if (wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
    gl.useProgram(prevProgram);
  }

  /** Esfera unidad (24×36) con sólo posiciones: el shader de storm shell no usa normales. */
  private ensureGeometry(): boolean {
    if (this.geometry) {
      return true;
    }
    const gl = this.gl;
    const latSegments = 24;
    const lonSegments = 36;
    const positions: number[] = [];
    for (let lat = 0; lat <= latSegments; lat++) {
      const theta = (lat / latSegments) * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      for (let lon = 0; lon <= lonSegments; lon++) {
        const phi = (lon / lonSegments) * Math.PI * 2;
        positions.push(Math.cos(phi) * sinTheta, cosTheta, Math.sin(phi) * sinTheta);
      }
    }
    const stride = lonSegments + 1;
    const indexList: number[] = [];
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const first = lat * stride + lon;
        const second = first + stride;
        indexList.push(first, second, first + 1, second, second + 1, first + 1);
      }
    }
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    if (!vbo || !ibo) {
      return false;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    const indices = new Uint16Array(indexList);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this.geometry = { vbo, ibo, indexCount: indices.length };
    return true;
  }
}
