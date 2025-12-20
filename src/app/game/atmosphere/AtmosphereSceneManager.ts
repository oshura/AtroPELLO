import { Camera } from '../Camera';
import { ShaderManager } from '../ShaderManager';
import { LandingApproachContext } from '../types/landing.types';
import { Vector3 } from '../../types/game.types';

interface SphereMesh {
  vbo: WebGLBuffer;
  cbo: WebGLBuffer;
  ibo: WebGLBuffer;
  indexCount: number;
  vertexCount: number;
  lastColorKey: string | null;
  hasRelief?: boolean;
}

export interface AtmosphereSceneState {
  active: boolean;
  context: LandingApproachContext | null;
  center: Vector3;
  groundRadius: number;
  skyRadius: number;
  groundColor: Float32Array;
  skyColor: Float32Array;
  entryAltitude: number;
  lastUpdatedMs: number;
}

export interface AtmosphereSceneActivationOptions {
  entryAltitude?: number;
  groundRadius?: number;
  skyRadius?: number;
  skyPadding?: number;
}

export class AtmosphereSceneManager {
  private groundMesh: SphereMesh | null = null;
  private skyMesh: SphereMesh | null = null;

  constructor(
    private readonly gl: WebGL2RenderingContext | null,
    private readonly shaderManager: ShaderManager,
  ) {}

  public dispose(): void {
    if (!this.gl) {
      this.groundMesh = null;
      this.skyMesh = null;
      return;
    }
    const destroy = (mesh: SphereMesh | null) => {
      if (!mesh) return;
      if (mesh.vbo) this.gl!.deleteBuffer(mesh.vbo);
      if (mesh.cbo) this.gl!.deleteBuffer(mesh.cbo);
      if (mesh.ibo) this.gl!.deleteBuffer(mesh.ibo);
    };
    destroy(this.groundMesh);
    destroy(this.skyMesh);
    this.groundMesh = null;
    this.skyMesh = null;
  }

  public render(state: AtmosphereSceneState, camera: Camera | null): void {
    if (!this.gl || !this.shaderManager || !camera || !state?.active || !state.context) {
      return;
    }
    if (!this.ensureMeshes()) {
      return;
    }

    const previousDepthMask = !!this.gl.getParameter(this.gl.DEPTH_WRITEMASK);
    const depthTestWasEnabled = this.gl.isEnabled(this.gl.DEPTH_TEST);
    if (!depthTestWasEnabled) {
      this.gl.enable(this.gl.DEPTH_TEST);
    }

    this.shaderManager.useBasicProgram();

    // Draw ground sphere (solid surface)
    this.gl.depthMask(true);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.groundMesh!.ibo);
    this.uploadColorIfNeeded(this.groundMesh!, state.groundColor);
    this.drawSphere(this.groundMesh!, state.center, state.groundRadius, camera);

    // Draw sky dome (backface visible, no depth writes so ship renders on top)
    const wasCullEnabled = this.gl.isEnabled(this.gl.CULL_FACE);
    this.gl.disable(this.gl.CULL_FACE);
    this.gl.depthMask(false);
    this.uploadColorIfNeeded(this.skyMesh!, state.skyColor);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.skyMesh!.ibo);
    this.drawSphere(this.skyMesh!, state.center, state.skyRadius, camera);

    // Restore state
    this.gl.depthMask(previousDepthMask);
    if (wasCullEnabled) {
      this.gl.enable(this.gl.CULL_FACE);
    }
    if (!depthTestWasEnabled) {
      this.gl.disable(this.gl.DEPTH_TEST);
    }
  }

  private ensureMeshes(): boolean {
    if (this.groundMesh && this.skyMesh) {
      return true;
    }
    const gl = this.gl;
    if (!gl) {
      return false;
    }
    const buildSphere = (withRelief: boolean): SphereMesh | null => {
      const latSegments = 32;
      const lonSegments = 64;
      const positions: number[] = [];
      for (let lat = 0; lat <= latSegments; lat++) {
        const theta = (lat / latSegments) * Math.PI;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        for (let lon = 0; lon <= lonSegments; lon++) {
          const phi = (lon / lonSegments) * Math.PI * 2;
          const sinPhi = Math.sin(phi);
          const cosPhi = Math.cos(phi);
          let radius = 1.0;
          if (withRelief) {
            const noise = this.terrainNoise(theta, phi);
            radius = 1.0 + noise * 0.08;
          }
          const x = cosPhi * sinTheta * radius;
          const y = cosTheta * radius;
          const z = sinPhi * sinTheta * radius;
          positions.push(x, y, z);
        }
      }
      const stride = lonSegments + 1;
      const indices: number[] = [];
      for (let lat = 0; lat < latSegments; lat++) {
        for (let lon = 0; lon < lonSegments; lon++) {
          const first = lat * stride + lon;
          const second = first + stride;
          indices.push(first, second, first + 1);
          indices.push(second, second + 1, first + 1);
        }
      }
      const vbo = gl.createBuffer();
      const cbo = gl.createBuffer();
      const ibo = gl.createBuffer();
      if (!vbo || !cbo || !ibo) {
        if (vbo) gl.deleteBuffer(vbo);
        if (cbo) gl.deleteBuffer(cbo);
        if (ibo) gl.deleteBuffer(ibo);
        return null;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions.length), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
      return {
        vbo,
        cbo,
        ibo,
        indexCount: indices.length,
        vertexCount: positions.length / 3,
        lastColorKey: null,
        hasRelief: withRelief,
      };
    };
    this.groundMesh = buildSphere(true);
    this.skyMesh = buildSphere(false);
    return !!(this.groundMesh && this.skyMesh);
  }

  private terrainNoise(theta: number, phi: number): number {
    const freq1 = 4.2;
    const freq2 = 11.7;
    const freq3 = 23.5;
    const octave1 = Math.sin(theta * freq1) * Math.cos(phi * freq1);
    const octave2 = Math.sin(theta * freq2 + 1.3) * Math.cos(phi * freq2 - 0.7) * 0.5;
    const octave3 = Math.sin(theta * freq3 + 2.1) * Math.cos(phi * freq3 + 1.9) * 0.25;
    const raw = octave1 + octave2 + octave3;
    return Math.max(-0.5, Math.min(1.0, raw));
  }

  private uploadColorIfNeeded(mesh: SphereMesh, color: Float32Array): void {
    if (!this.gl || !mesh || !color || color.length < 3) {
      return;
    }
    const key = `${color[0].toFixed(3)}|${color[1].toFixed(3)}|${color[2].toFixed(3)}`;
    if (mesh.lastColorKey === key) {
      return;
    }
    const colors = new Float32Array(mesh.vertexCount * 3);
    for (let i = 0; i < mesh.vertexCount; i++) {
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.cbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, colors, this.gl.DYNAMIC_DRAW);
    mesh.lastColorKey = key;
  }

  private drawSphere(mesh: SphereMesh, center: Vector3, radius: number, camera: Camera): void {
    if (!this.gl || !mesh) {
      return;
    }
    const positionLoc = this.shaderManager.basicAttributes['position'];
    const colorLoc = this.shaderManager.basicAttributes['color'];
    if (positionLoc === undefined || colorLoc === undefined) {
      return;
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.vbo);
    this.gl.enableVertexAttribArray(positionLoc);
    this.gl.vertexAttribPointer(positionLoc, 3, this.gl.FLOAT, false, 0, 0);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.cbo);
    this.gl.enableVertexAttribArray(colorLoc);
    this.gl.vertexAttribPointer(colorLoc, 3, this.gl.FLOAT, false, 0, 0);

    this.shaderManager.setBasicMatrices(
      this.buildModelMatrix(center, radius),
      camera.viewMatrix,
      camera.projectionMatrix,
    );
    this.gl.drawElements(this.gl.TRIANGLES, mesh.indexCount, this.gl.UNSIGNED_SHORT, 0);

    this.gl.disableVertexAttribArray(positionLoc);
    this.gl.disableVertexAttribArray(colorLoc);
  }

  private buildModelMatrix(center: Vector3, radius: number): Float32Array {
    const matrix = new Float32Array(16);
    matrix[0] = radius;
    matrix[5] = radius;
    matrix[10] = radius;
    matrix[15] = 1;
    matrix[12] = center.x;
    matrix[13] = center.y;
    matrix[14] = center.z;
    return matrix;
  }
}
