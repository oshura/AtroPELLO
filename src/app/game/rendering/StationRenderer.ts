import { ShaderManager } from '../ShaderManager';
import { Camera } from '../Camera';
import { TextureManager } from '../TextureManager';
import { SpaceStationSystem } from '../services/state/space-station-system';
import { HumanSpaceStation } from '../game-objects/stations/human-space-station';
import { DockPort } from '../game-objects/stations/dock-port';
import { StationEmissiveBall } from '../game-objects/stations/station-emissive-ball';
import { DockedShipWreck } from '../game-objects/stations/docked-ship-wreck';
import { StationWindowMesh, windowFlickerIntensity } from '../game-objects/stations/station-windows';

/**
 * Render de la estación espacial (extraído de GameEngine.renderSpaceStation, regla #1: el motor solo
 * delega). Cuerpo texturizado + puertos emissive + bola de motor + VENTANAS (§7 I0, capa fija +
 * parpadeante) + pecios atracados. Cull desactivado en todo el pase (toroide visible por ambas caras).
 */
export interface StationRenderHost {
  getGl(): WebGL2RenderingContext | null;
  getShaderManager(): ShaderManager | null;
  getCamera(): Camera | null;
  getStationSystem(): SpaceStationSystem;
  getTextureManager(): TextureManager | null;
  getLightDirection(): Float32Array;
  getLightColor(): Float32Array;
  getAmbientColor(): Float32Array;
  getAmbientStrength(): number;
}

export class StationRenderer {
  private renderedStation: HumanSpaceStation | null = null;
  private renderedPorts: DockPort[] = [];
  private renderedMotors: StationEmissiveBall[] = [];
  private renderedWrecks: DockedShipWreck[] = [];
  private renderedWindows: StationWindowMesh[] = [];
  private diffuseTex: WebGLTexture | null = null;
  private texLoading = false;
  private lastGl: WebGL2RenderingContext | null = null;
  // Scratch reutilizables (HOT: sin alocaciones por frame).
  private readonly normalMatrix = new Float32Array(16);
  private readonly camPos = new Float32Array(3);

  /** Libera los buffers de la estación y sus satélites (al cambiar de sistema o regenerar). */
  clear(): void {
    const gl = this.lastGl;
    if (gl) {
      if (this.renderedStation) { try { this.renderedStation.destroy(gl); } catch {} }
      for (const p of this.renderedPorts) { try { p.destroy(gl); } catch {} }
      for (const m of this.renderedMotors) { try { m.destroy(gl); } catch {} }
      for (const w of this.renderedWrecks) { try { w.destroy(gl); } catch {} }
      for (const v of this.renderedWindows) { try { v.destroy(gl); } catch {} }
    }
    this.renderedStation = null;
    this.renderedPorts = [];
    this.renderedMotors = [];
    this.renderedWrecks = [];
    this.renderedWindows = [];
  }

  render(host: StationRenderHost): void {
    const system = host.getStationSystem();
    const station = system.getRenderable();
    if (station !== this.renderedStation) {
      this.clear();
      this.renderedStation = station;
    }
    const gl = host.getGl();
    const sm = host.getShaderManager();
    const cam = host.getCamera();
    if (!station || !gl || !sm || !cam) {
      return;
    }
    this.lastGl = gl;
    this.camPos[0] = cam.position.x;
    this.camPos[1] = cam.position.y;
    this.camPos[2] = cam.position.z;

    // Carga perezosa de la textura de casco (CC0). Hasta que llega, se usa el color por vértice (gris).
    const textureManager = host.getTextureManager();
    if (!this.diffuseTex && !this.texLoading && textureManager) {
      this.texLoading = true;
      textureManager.loadTextureFromUrl('station-panel', '/assets/textures/station_panel.jpg')
        .then(t => { this.diffuseTex = t; })
        .catch(() => {})
        .finally(() => { this.texLoading = false; });
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    const wasCull = gl.isEnabled(gl.CULL_FACE);
    gl.disable(gl.CULL_FACE); // toroide + tiles visibles por ambas caras

    // Cuerpo de la estación
    if (!station.vertexBuffer) station.initBuffers(gl);
    sm.useLitProgram();
    this.setNormalMatrix(station.modelMatrix);
    sm.setLitMatrices(station.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
    sm.setLighting(host.getLightDirection(), host.getLightColor(), host.getAmbientColor(), host.getAmbientStrength());
    sm.setSpecular(this.camPos, 0.35, 28.0);
    // Color por vértice (tono metálico gris/azulado) modulado por la textura de casco metálica.
    sm.setLitVertexColorMode(true);
    if (this.diffuseTex) {
      sm.setLitTexture(true, this.diffuseTex);
    }
    station.render(gl, sm.litProgram!, cam.viewMatrix, cam.projectionMatrix);
    sm.setLitTexture(false);
    sm.setLitVertexColorMode(false);

    // Puertos de acople: los ACOPLABLES (libres) lucen azul emissive; los ocupados por un pecio quedan
    // "apagados" (sin emissive), ya que no se puede aterrizar en ellos.
    sm.setLitVertexColorMode(true);
    for (const p of system.getPorts()) {
      if (!p.isActive()) continue;
      if (!p.vertexBuffer) { p.initBuffers(gl); this.renderedPorts.push(p); }
      sm.setLitEmissive(p.isDockable() ? 1.0 : 0.0);
      this.setNormalMatrix(p.modelMatrix);
      sm.setLitMatrices(p.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
      p.render(gl, sm.litProgram!, cam.viewMatrix, cam.projectionMatrix);
    }
    // "Bola" de motor (rojo/naranja, tobera del núcleo) — emissive más suave ("apagado").
    sm.setLitEmissive(0.75);
    for (const m of system.getMotors()) {
      if (!m.isActive()) continue;
      if (!m.vertexBuffer) { m.initBuffers(gl); this.renderedMotors.push(m); }
      this.setNormalMatrix(m.modelMatrix);
      sm.setLitMatrices(m.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
      m.render(gl, sm.litProgram!, cam.viewMatrix, cam.projectionMatrix);
    }

    // Ventanas del toroide (docs/ESTACIONES.md §7, I0): en espacio unidad → se dibujan con el
    // modelMatrix de la PROPIA estación. Capa fija (muertas casi negras + encendidas cálidas, colores
    // horneados por semilla) y capa parpadeante (emissive modulado por tiempo: energía inestable).
    const windows = system.getWindows();
    if (windows) {
      this.setNormalMatrix(station.modelMatrix);
      sm.setLitMatrices(station.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
      if (!windows.steady.isEmpty()) {
        if (!windows.steady.vertexBuffer) { windows.steady.initBuffers(gl); this.renderedWindows.push(windows.steady); }
        sm.setLitEmissive(1.0);
        windows.steady.render(gl, sm.litProgram!, cam.viewMatrix, cam.projectionMatrix);
      }
      if (!windows.flicker.isEmpty()) {
        if (!windows.flicker.vertexBuffer) { windows.flicker.initBuffers(gl); this.renderedWindows.push(windows.flicker); }
        sm.setLitEmissive(windowFlickerIntensity(performance.now() / 1000));
        windows.flicker.render(gl, sm.litProgram!, cam.viewMatrix, cam.projectionMatrix);
      }
    }
    sm.setLitVertexColorMode(false);
    sm.setLitEmissive(0.0);

    // Réplicas atracadas (pecios): SÓLIDO rusty/quemado con iluminación (color por vértice, sin textura).
    sm.setLitVertexColorMode(true);
    sm.setSpecular(this.camPos, 0.08, 8.0);
    for (const w of system.getWrecks()) {
      if (!w.isActive()) continue;
      if (!w.vertexBuffer) { w.initBuffers(gl); this.renderedWrecks.push(w); }
      this.setNormalMatrix(w.modelMatrix);
      sm.setLitMatrices(w.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
      w.render(gl, sm.litProgram!, cam.viewMatrix, cam.projectionMatrix);
    }
    sm.setLitVertexColorMode(false);

    if (wasCull) gl.enable(gl.CULL_FACE);
  }

  /** Normal matrix = 3x3 superior-izquierda del modelo (válida para escalas uniformes, como el motor). */
  private setNormalMatrix(m: Float32Array): void {
    const n = this.normalMatrix;
    n[0] = m[0]; n[1] = m[1]; n[2] = m[2]; n[3] = 0;
    n[4] = m[4]; n[5] = m[5]; n[6] = m[6]; n[7] = 0;
    n[8] = m[8]; n[9] = m[9]; n[10] = m[10]; n[11] = 0;
    n[12] = 0; n[13] = 0; n[14] = 0; n[15] = 1;
  }
}
