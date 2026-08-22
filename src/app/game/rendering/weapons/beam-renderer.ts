import { Vector3 } from '../../../types/game.types';
import { ShaderManager } from '../../ShaderManager';

/**
 * BeamRenderer — dibujo de haces continuos (Fase 12 — docs/ARMAS.md).
 *
 * Sustituye al patrón que repetían los tres haces de hechizo del motor, con dos correcciones:
 *
 * 1. **Billboard de verdad.** El código antiguo tomaba como perpendicular `(-dy, dx, 0)`, un vector
 *    del plano XY: un haz casi vertical degeneraba en una línea invisible. Aquí la perpendicular
 *    sale de `cross(dirección, forward de cámara)`, así que el haz siempre encara al espectador.
 * 2. **Buffers persistentes.** El código antiguo creaba y destruía dos VBOs POR FRAME. Aquí se
 *    crean una vez y se reescriben con `bufferSubData`.
 */

export interface BeamDrawParams {
  start: Vector3;
  end: Vector3;
  /** Grosor en unidades de mundo. */
  width: number;
  color: [number, number, number];
  /** Multiplicador de brillo 0..1 (fundidos de entrada/salida, pulsos, enganche). */
  intensity: number;
  /** Atenuación del color en el extremo lejano (0 = igual que el origen). */
  tailFade?: number;
}

const VERTEX_COUNT = 4;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export class BeamRenderer {
  private vbo: WebGLBuffer | null = null;
  private cbo: WebGLBuffer | null = null;
  private readonly positions = new Float32Array(VERTEX_COUNT * 3);
  private readonly colors = new Float32Array(VERTEX_COUNT * 3);

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly shaders: ShaderManager
  ) {}

  /**
   * Dibuja un haz. `cameraForward` orienta el billboard; `view`/`projection` son las matrices de
   * la cámara activa.
   */
  public draw(
    params: BeamDrawParams,
    cameraForward: Vector3,
    view: Float32Array,
    projection: Float32Array
  ): void {
    const gl = this.gl;
    const dx = params.end.x - params.start.x;
    const dy = params.end.y - params.start.y;
    const dz = params.end.z - params.start.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 0.01 || params.intensity <= 0) {
      return;
    }
    const dir = { x: dx / length, y: dy / length, z: dz / length };
    const side = this.billboardSide(dir, cameraForward);
    const half = Math.max(0.01, params.width) * 0.5;

    this.writeQuad(params.start, params.end, side, half);
    this.writeColors(params.color, params.intensity, params.tailFade ?? 0.3);

    if (!this.ensureBuffers()) {
      return;
    }
    this.shaders.useBasicProgram();
    const posLoc = this.shaders.basicAttributes['position'];
    const colorLoc = this.shaders.basicAttributes['color'];

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.cbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colors);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);

    this.shaders.setBasicMatrices(IDENTITY, view, projection);

    // Aditivo y sin escribir profundidad: el haz brilla por encima sin tapar nada.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const depthWasEnabled = gl.isEnabled(gl.DEPTH_TEST);
    if (depthWasEnabled) {
      gl.disable(gl.DEPTH_TEST);
    }
    gl.depthMask(false);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, VERTEX_COUNT);

    gl.depthMask(true);
    if (depthWasEnabled) {
      gl.enable(gl.DEPTH_TEST);
    }
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(posLoc);
    gl.disableVertexAttribArray(colorLoc);
  }

  public dispose(): void {
    if (this.vbo) {
      this.gl.deleteBuffer(this.vbo);
      this.vbo = null;
    }
    if (this.cbo) {
      this.gl.deleteBuffer(this.cbo);
      this.cbo = null;
    }
  }

  /** Perpendicular al haz que además encara a la cámara. Con fallback si son casi paralelos. */
  private billboardSide(dir: Vector3, cameraForward: Vector3): Vector3 {
    let side = this.cross(dir, cameraForward);
    let len = Math.hypot(side.x, side.y, side.z);
    if (len < 1e-4) {
      // Haz mirando directamente a la cámara: cualquier perpendicular estable sirve.
      side = this.cross(dir, Math.abs(dir.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 });
      len = Math.hypot(side.x, side.y, side.z) || 1;
    }
    return { x: side.x / len, y: side.y / len, z: side.z / len };
  }

  private writeQuad(start: Vector3, end: Vector3, side: Vector3, half: number): void {
    const p = this.positions;
    p[0] = start.x - side.x * half; p[1] = start.y - side.y * half; p[2] = start.z - side.z * half;
    p[3] = start.x + side.x * half; p[4] = start.y + side.y * half; p[5] = start.z + side.z * half;
    p[6] = end.x - side.x * half;   p[7] = end.y - side.y * half;   p[8] = end.z - side.z * half;
    p[9] = end.x + side.x * half;   p[10] = end.y + side.y * half;  p[11] = end.z + side.z * half;
  }

  private writeColors(color: [number, number, number], intensity: number, tailFade: number): void {
    const c = this.colors;
    const near = Math.max(0, Math.min(1, intensity));
    const far = near * Math.max(0, 1 - tailFade);
    c[0] = color[0] * near; c[1] = color[1] * near; c[2] = color[2] * near;
    c[3] = color[0] * near; c[4] = color[1] * near; c[5] = color[2] * near;
    c[6] = color[0] * far;  c[7] = color[1] * far;  c[8] = color[2] * far;
    c[9] = color[0] * far;  c[10] = color[1] * far; c[11] = color[2] * far;
  }

  private ensureBuffers(): boolean {
    const gl = this.gl;
    if (!this.vbo) {
      this.vbo = gl.createBuffer();
      if (!this.vbo) return false;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.positions.byteLength, gl.DYNAMIC_DRAW);
    }
    if (!this.cbo) {
      this.cbo = gl.createBuffer();
      if (!this.cbo) return false;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.colors.byteLength, gl.DYNAMIC_DRAW);
    }
    return true;
  }

  private cross(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }
}
