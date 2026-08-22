import { mat3, mat4 } from 'gl-matrix';
import { Camera, CameraMode } from '../../Camera';
import { Spaceship, ThrusterState } from '../../game-objects/Spaceship';
import { GameLogger } from '../../utils/GameLogger';
import { LogCategory } from '../../../services/logging.service';
import { buildVastago, ShipGeometryConfig, ShipPart } from './ship-geometry';

/**
 * ShipRenderer — render de la nave del jugador "Vástago". Programa propio con casco metálico (líneas de
 * panel + desgaste), rim fresnel y acentos emisivos (canopy/luces/escapes). Aplica las transformadas
 * dinámicas por parte: pitch del morro (anclaje), plegado de alas y escala+color del escape por empuje.
 * docs/ARQUITECTURA.md §10.c. El motor solo delega: `renderSpaceship()` → `shipRenderer.render(...)`.
 */
const VERTEX_SRC = `#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
uniform mat4 u_model, u_view, u_proj;
uniform mat3 u_normalMat;
out vec3 v_obj; out vec3 v_N; out vec3 v_world;
void main(){
  vec4 w = u_model * vec4(a_position, 1.0);
  gl_Position = u_proj * (u_view * w);
  v_obj = a_position;
  v_N = normalize(u_normalMat * a_normal);
  v_world = w.xyz;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec3 v_obj; in vec3 v_N; in vec3 v_world;
uniform vec3 u_base; uniform float u_metal; uniform float u_emissive; uniform float u_panels;
uniform vec3 u_rim;
uniform vec3 u_lightDir, u_lightColor, u_ambient; uniform float u_ambientStr; uniform vec3 u_cam;
out vec4 frag;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  vec3 N = normalize(v_N), L = normalize(-u_lightDir), V = normalize(u_cam - v_world), H = normalize(L + V);
  vec3 albedo = u_base;
  if (u_panels > 0.5) {
    vec3 g = abs(fract(v_obj * 2.6) - 0.5);
    float line = min(min(g.x, g.y), g.z);
    albedo *= mix(0.68, 1.0, smoothstep(0.0, 0.045, line));  // ranuras de panel
    albedo *= 0.90 + 0.14 * hash(floor(v_obj * 9.0));        // desgaste
  }
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), mix(16.0, 90.0, u_metal)) * mix(0.15, 0.9, u_metal);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = albedo * (u_ambientStr * u_ambient + diff * u_lightColor) + u_lightColor * spec;
  col += u_rim * fres * 0.5;
  col = mix(col, albedo * 1.9 + 0.15, clamp(u_emissive, 0.0, 1.0));
  frag = vec4(col, 1.0);
}`;

interface GpuPart { part: ShipPart; vao: WebGLVertexArrayObject | null; count: number; }

const CYAN: [number, number, number] = [0.40, 0.85, 1.0];
const HOT: [number, number, number] = [0.85, 0.96, 1.0];
const RED: [number, number, number] = [1.0, 0.30, 0.12];
const NOSE_PIVOT_Z = 0.5;
const FOLD_MAX = 1.45; // rad (~83°)

export class ShipRenderer {
  private program: WebGLProgram | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private gpu: GpuPart[] = [];
  private readonly model = mat4.create();
  private readonly local = mat4.create();
  private readonly nrm = mat3.create();

  constructor(private gl: WebGL2RenderingContext) {
    this.program = this.build();
    if (!this.program) return;
    for (const nm of ['u_model', 'u_view', 'u_proj', 'u_normalMat', 'u_base', 'u_metal', 'u_emissive',
      'u_panels', 'u_rim', 'u_lightDir', 'u_lightColor', 'u_ambient', 'u_ambientStr', 'u_cam']) {
      this.u[nm] = gl.getUniformLocation(this.program, nm);
    }
    const aPos = gl.getAttribLocation(this.program, 'a_position');
    const aNrm = gl.getAttribLocation(this.program, 'a_normal');
    for (const part of buildVastago()) this.gpu.push(this.upload(part, aPos, aNrm));
  }

  /**
   * Reconstruye la malla con otra configuración de casco (mejora de motor, arma instalada).
   * Es una operación FRÍA: sólo se llama al cambiar el equipamiento, nunca por frame.
   */
  public rebuild(config: ShipGeometryConfig): void {
    const gl = this.gl;
    if (!this.program) return;
    for (const g of this.gpu) {
      if (g.vao) gl.deleteVertexArray(g.vao);
    }
    this.gpu = [];
    const aPos = gl.getAttribLocation(this.program, 'a_position');
    const aNrm = gl.getAttribLocation(this.program, 'a_normal');
    for (const part of buildVastago(config)) this.gpu.push(this.upload(part, aPos, aNrm));
    GameLogger.info(LogCategory.RENDER, 'Malla de la nave reconstruida', {
      engineTier: config.engineTier,
      hardpoints: config.occupiedHardpoints.length,
      parts: this.gpu.length,
    });
  }

  public render(
    ship: Spaceship, camera: Camera,
    lightDir: Float32Array, lightColor: Float32Array,
    ambientColor: Float32Array, ambientStrength: number, timeSec: number
  ): void {
    const gl = this.gl;
    if (!this.program) return;
    ship.updateModelMatrix();
    const shipModel = ship.modelMatrix as unknown as mat4;
    const cockpit = camera.getCurrentMode() === CameraMode.COCKPIT;
    const fold = FOLD_MAX * clamp01(ship.getWingDeploymentProgress?.() ?? 0);
    const anchor = clamp01(ship.getNoseAnchorProgress?.() ?? 0);
    const exhaustColor = this.thrusterColor(ship);
    const speedRatio = clamp01(ship.currentSpeed / Math.max(1e-6, ship.maxSpeed));
    const exhaustLen = 1 + speedRatio * 1.6;
    const exhaustRad = ship.thrusterScaleFactor || 1;

    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.u['u_view'], false, camera.viewMatrix);
    gl.uniformMatrix4fv(this.u['u_proj'], false, camera.projectionMatrix);
    gl.uniform3fv(this.u['u_lightDir'], lightDir);
    gl.uniform3fv(this.u['u_lightColor'], lightColor);
    gl.uniform3fv(this.u['u_ambient'], ambientColor);
    gl.uniform1f(this.u['u_ambientStr'], ambientStrength);
    gl.uniform3f(this.u['u_cam'], camera.position.x, camera.position.y, camera.position.z);

    for (const g of this.gpu) {
      const p = g.part;
      if (p.hideInCockpit && cockpit) continue;

      mat4.identity(this.local);
      if (p.dyn === 'nose' && anchor > 0) {
        mat4.translate(this.local, this.local, [0, 0, NOSE_PIVOT_Z]);
        mat4.rotateX(this.local, this.local, (18 * Math.PI / 180) * anchor);
        mat4.translate(this.local, this.local, [0, 0, -NOSE_PIVOT_Z]);
        mat4.translate(this.local, this.local, [0, 0.06 * anchor, 0.03 * anchor]);
      } else if ((p.dyn === 'wingL' || p.dyn === 'wingR') && fold > 0 && p.hinge) {
        const sign = p.dyn === 'wingL' ? -1 : 1;
        mat4.translate(this.local, this.local, p.hinge);
        mat4.rotateZ(this.local, this.local, sign * fold);
        mat4.translate(this.local, this.local, [-p.hinge[0], -p.hinge[1], -p.hinge[2]]);
      } else if (p.dyn === 'exhaust' && p.hinge) {
        mat4.translate(this.local, this.local, p.hinge);
        mat4.scale(this.local, this.local, [exhaustRad, exhaustRad, exhaustLen]);
      }
      mat4.multiply(this.model, shipModel, this.local);
      mat3.normalFromMat4(this.nrm, this.model);

      gl.uniformMatrix4fv(this.u['u_model'], false, this.model);
      gl.uniformMatrix3fv(this.u['u_normalMat'], false, this.nrm);
      const base = p.dyn === 'exhaust' ? exhaustColor : p.material.color;
      gl.uniform3fv(this.u['u_base'], base);
      gl.uniform3fv(this.u['u_rim'], p.material.rim);
      gl.uniform1f(this.u['u_metal'], p.material.metal);
      gl.uniform1f(this.u['u_emissive'], p.material.emissive);
      gl.uniform1f(this.u['u_panels'], p.material.panels);

      gl.bindVertexArray(g.vao);
      gl.drawArrays(gl.TRIANGLES, 0, g.count);
    }
    gl.bindVertexArray(null);
  }

  private thrusterColor(ship: Spaceship): [number, number, number] {
    const r = clamp01(ship.currentSpeed / Math.max(1e-6, ship.maxSpeed));
    switch (ship.thrusterState) {
      case ThrusterState.BRAKING: return [RED[0] * 1.2, RED[1] * 1.2, RED[2] * 1.2];
      case ThrusterState.IDLE: return [CYAN[0] * 0.55, CYAN[1] * 0.55, CYAN[2] * 0.6];
      case ThrusterState.ACCELERATING:
      case ThrusterState.CRUISING:
      default: {
        const b = 1.0 + r * 0.6;
        return [lerp(CYAN[0], HOT[0], r) * b, lerp(CYAN[1], HOT[1], r) * b, lerp(CYAN[2], HOT[2], r) * b];
      }
    }
  }

  private upload(part: ShipPart, aPos: number, aNrm: number): GpuPart {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const pb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, part.positions, gl.STATIC_DRAW);
    if (aPos >= 0) { gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0); }
    const nb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nb);
    gl.bufferData(gl.ARRAY_BUFFER, part.normals, gl.STATIC_DRAW);
    if (aNrm >= 0) { gl.enableVertexAttribArray(aNrm); gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0); }
    gl.bindVertexArray(null);
    return { part, vao, count: part.positions.length / 3 };
  }

  private build(): WebGLProgram | null {
    const gl = this.gl;
    const vs = this.compile(gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      try { GameLogger.error(LogCategory.SHADERS, 'ShipRenderer link error', { info: gl.getProgramInfoLog(prog) }); } catch {}
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  private compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl;
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      try { GameLogger.error(LogCategory.SHADERS, 'ShipRenderer compile error', { info: gl.getShaderInfoLog(sh) }); } catch {}
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  public cleanup(): void {
    const gl = this.gl;
    for (const g of this.gpu) { if (g.vao) gl.deleteVertexArray(g.vao); }
    this.gpu = [];
    if (this.program) { gl.deleteProgram(this.program); this.program = null; }
  }
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
