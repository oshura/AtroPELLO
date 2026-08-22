import { ShaderManager } from '../ShaderManager';
import { Camera } from '../Camera';
import { AracnidWebStation } from '../game-objects/stations/aracnid-web-station';
import { StationEmissiveBall } from '../game-objects/stations/station-emissive-ball';

/**
 * Render de las estaciones telaraña arácnidas (Fase 15). Hermano pequeño de StationRenderer: aquí
 * no hay puertos, marcos de acople ni ventanas — solo el cuerpo de seda (lit, color por vértice,
 * cull off para ver la tela por ambas caras) y el saco central emissive latiendo en violeta.
 */
export interface AracnidStationRenderHost {
  getGl(): WebGL2RenderingContext | null;
  getShaderManager(): ShaderManager | null;
  getCamera(): Camera | null;
  getStations(): readonly AracnidWebStation[];
  getSacs(): readonly StationEmissiveBall[];
  getLightDirection(): Float32Array;
  getLightColor(): Float32Array;
  getAmbientColor(): Float32Array;
  getAmbientStrength(): number;
}

export class AracnidStationRenderer {
  private lastGl: WebGL2RenderingContext | null = null;
  private buffered = new Set<string>();
  private bufferedObjects: Array<AracnidWebStation | StationEmissiveBall> = [];
  private readonly normalMatrix = new Float32Array(16);
  private readonly camPos = new Float32Array(3);

  /** Libera los buffers (cambio de sistema). */
  clear(): void {
    const gl = this.lastGl;
    if (gl) {
      for (const obj of this.bufferedObjects) {
        try { obj.destroy(gl); } catch {}
      }
    }
    this.buffered.clear();
    this.bufferedObjects = [];
  }

  render(host: AracnidStationRenderHost): void {
    const stations = host.getStations();
    if (!stations.length) {
      if (this.bufferedObjects.length) {
        this.clear();
      }
      return;
    }
    const gl = host.getGl();
    const sm = host.getShaderManager();
    const cam = host.getCamera();
    if (!gl || !sm || !cam) {
      return;
    }
    this.lastGl = gl;
    this.camPos[0] = cam.position.x;
    this.camPos[1] = cam.position.y;
    this.camPos[2] = cam.position.z;

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    const wasCull = gl.isEnabled(gl.CULL_FACE);
    gl.disable(gl.CULL_FACE); // la tela se ve por ambas caras

    sm.useLitProgram();
    sm.setLighting(host.getLightDirection(), host.getLightColor(), host.getAmbientColor(), host.getAmbientStrength());
    sm.setSpecular(this.camPos, 0.2, 14.0); // seda mate, apenas brillo
    sm.setLitVertexColorMode(true);

    for (const station of stations) {
      if (!station.active) continue;
      this.ensureBuffers(gl, station);
      sm.setLitEmissive(0.0);
      this.setNormalMatrix(station.modelMatrix);
      sm.setLitMatrices(station.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
      station.render(gl, sm.litProgram!, cam.viewMatrix, cam.projectionMatrix);
    }

    // Saco central: latido violeta (emissive modulado por tiempo, cada telar con su fase).
    const tSec = performance.now() / 1000;
    const sacs = host.getSacs();
    for (let i = 0; i < sacs.length; i++) {
      const sac = sacs[i];
      if (!sac.isActive()) continue;
      this.ensureBuffers(gl, sac);
      sm.setLitEmissive(0.55 + 0.35 * Math.sin(tSec * 1.7 + i * 2.1));
      this.setNormalMatrix(sac.modelMatrix);
      sm.setLitMatrices(sac.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
      sac.render(gl, sm.litProgram!, cam.viewMatrix, cam.projectionMatrix);
    }

    sm.setLitVertexColorMode(false);
    sm.setLitEmissive(0.0);
    if (wasCull) gl.enable(gl.CULL_FACE);
  }

  private ensureBuffers(gl: WebGL2RenderingContext, obj: AracnidWebStation | StationEmissiveBall): void {
    if (!obj.vertexBuffer) {
      obj.initBuffers(gl);
    }
    if (!this.buffered.has(obj.id)) {
      this.buffered.add(obj.id);
      this.bufferedObjects.push(obj);
    }
  }

  private setNormalMatrix(m: Float32Array): void {
    const n = this.normalMatrix;
    n[0] = m[0]; n[1] = m[1]; n[2] = m[2]; n[3] = 0;
    n[4] = m[4]; n[5] = m[5]; n[6] = m[6]; n[7] = 0;
    n[8] = m[8]; n[9] = m[9]; n[10] = m[10]; n[11] = 0;
    n[12] = 0; n[13] = 0; n[14] = 0; n[15] = 1;
  }
}
