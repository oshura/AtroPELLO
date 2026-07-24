import { Planet, PlanetType, PlanetColorName } from '../game-objects/Planet';
import { GameLogger } from '../utils/GameLogger';
import { LogCategory } from '../../services/logging.service';

/**
 * PlanetSurfaceRenderer — superficie planetaria 100% procedural (fbm 3D sobre la esfera),
 * sustituto de los tiers texturizado/lit/basic + sprite billboard. Ver docs/ARQUITECTURA.md §10.
 *
 * El look se dirige por DATO (`planetType` + `baseColorName`, nunca por id, regla §7.3) + una semilla
 * derivada de `planetId`. NO gestiona el Sol ni la Tierra partida (conservan su render especial).
 */
export type PlanetSurfaceType = 0 | 1 | 2 | 3; // 0 rocky, 1 terrestrial, 2 gaseous, 3 ice

export interface PlanetStyle {
  type: PlanetSurfaceType;
  colorLow: [number, number, number];
  colorHigh: [number, number, number];
  colorAtmo: [number, number, number];
  hasAtmosphere: boolean;
  seed: number;
}

const VERTEX_SRC = `#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat4 u_normalMatrix;
out vec3 v_objPos;
out vec3 v_worldNormal;
out vec3 v_worldPos;
void main(){
  vec4 world = u_modelMatrix * vec4(a_position, 1.0);
  gl_Position = u_projectionMatrix * (u_viewMatrix * world);
  v_objPos = normalize(a_position);
  vec3 inN = length(a_normal) < 0.0001 ? a_position : a_normal;
  v_worldNormal = normalize((u_normalMatrix * vec4(inN, 0.0)).xyz);
  v_worldPos = world.xyz;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec3 v_objPos;
in vec3 v_worldNormal;
in vec3 v_worldPos;
out vec4 fragColor;

uniform float u_surfaceType;   // 0 rocky, 1 terrestrial, 2 gaseous, 3 ice
uniform float u_seed;
uniform float u_hasAtmosphere;
uniform vec3  u_colorLow;
uniform vec3  u_colorHigh;
uniform vec3  u_colorAtmo;
uniform vec3  u_lightDir;      // dirección que viaja la luz (sol -> planeta)
uniform vec3  u_lightColor;
uniform vec3  u_ambientColor;
uniform float u_ambientStrength;
uniform vec3  u_cameraPos;
uniform float u_time;

// Value noise 3D (sin costura ni pinchazo polar) + fbm
float hash(vec3 p){
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main(){
  vec3 n = normalize(v_objPos);
  vec3 so = vec3(u_seed * 11.7, u_seed * 57.3, u_seed * 29.1);
  vec3 N = normalize(v_worldNormal);
  vec3 L = normalize(-u_lightDir);
  float ndl = dot(N, L);
  float day = smoothstep(-0.08, 0.30, ndl);   // terminador suave

  if (u_surfaceType > 3.5) {
    // SUN: superficie auto-iluminada (granulación + manchas + oscurecimiento del limbo)
    vec3 V = normalize(u_cameraPos - v_worldPos);
    float mu = max(dot(N, V), 0.0);
    float cells = fbm(n * 6.0 + so + vec3(u_time * 0.05)) * 0.6
                + fbm(n * 15.0 + so - vec3(u_time * 0.08)) * 0.4;
    vec3 hot = mix(u_colorLow, u_colorHigh, cells);
    float spot = smoothstep(0.72, 0.82, fbm(n * 3.0 + so + vec3(u_time * 0.02)));
    hot = mix(hot, u_colorLow * 0.45, spot * 0.5);
    float limb = pow(mu, 0.45);
    hot *= 0.55 + 0.5 * limb;
    hot += u_colorHigh * pow(1.0 - mu, 3.0) * 0.15;   // fulgor tenue en el borde
    fragColor = vec4(hot, 1.0);
    return;
  }

  vec3 albedo;
  float specMask = 0.0;

  if (u_surfaceType < 0.5) {
    // ROCKY: sin atmósfera, cráteres + grano
    float base = fbm(n * 2.5 + so);
    float craters = fbm(n * 8.0 + so * 1.7);
    float pit = smoothstep(0.55, 0.62, craters) - smoothstep(0.62, 0.72, craters);
    albedo = mix(u_colorLow, u_colorHigh, base);
    albedo *= 1.0 - pit * 0.55;
    albedo *= 0.90 + 0.18 * fbm(n * 22.0 + so);
  } else if (u_surfaceType < 1.5) {
    // TERRESTRIAL: océano + tierra + casquetes + nubes + specular de agua
    float h = fbm(n * 3.0 + so);
    float sea = 0.5;
    float land = smoothstep(sea, sea + 0.045, h);
    vec3 landCol = mix(u_colorHigh * 0.75, u_colorHigh, smoothstep(sea, 1.0, h));
    albedo = mix(u_colorLow, landCol, land);
    float ice = smoothstep(0.72, 0.86, abs(n.y)) * (0.5 + 0.5 * fbm(n * 4.0 + so));
    albedo = mix(albedo, vec3(0.95, 0.97, 1.0), clamp(ice, 0.0, 1.0));
    float clouds = smoothstep(0.55, 0.78, fbm(n * 2.2 + vec3(u_time * 0.010, 0.0, -u_time * 0.006) + so));
    albedo = mix(albedo, vec3(1.0), clouds * 0.6);
    specMask = (1.0 - land) * (1.0 - clamp(ice, 0.0, 1.0));
  } else if (u_surfaceType < 2.5) {
    // GASEOUS: bandas horizontales con warp + tormenta
    float warp = fbm(n * 3.0 + so) * 0.35;
    float bands = sin((n.y * 8.0 + warp * 6.0) * 3.14159265);
    albedo = mix(u_colorLow, u_colorHigh, 0.5 + 0.5 * bands);
    float storm = smoothstep(0.72, 0.95, fbm(n * 4.0 + vec3(u_time * 0.012, 0.0, 0.0) + so));
    albedo = mix(albedo, u_colorHigh * 1.2, storm * 0.5);
  } else {
    // ICE: alta reflectancia + grietas
    float cr = fbm(n * 5.0 + so);
    float ridges = abs(fbm(n * 9.0 + so) - 0.5) * 2.0;
    albedo = mix(u_colorLow, u_colorHigh, smoothstep(0.3, 0.7, cr));
    albedo *= 0.85 + 0.30 * ridges;
    specMask = 0.4;
  }

  vec3 ambient = u_ambientStrength * u_ambientColor;
  vec3 color = albedo * (ambient + day * u_lightColor);

  if (specMask > 0.001) {
    vec3 V = normalize(u_cameraPos - v_worldPos);
    vec3 H = normalize(L + V);
    float s = pow(max(dot(N, H), 0.0), 60.0) * specMask * day;
    color += u_lightColor * s * 0.8;
  }

  // Lado nocturno: no del todo negro
  color = max(color, albedo * 0.04);

  // Rim de atmósfera (fresnel) sobre la propia esfera
  if (u_hasAtmosphere > 0.5) {
    vec3 V = normalize(u_cameraPos - v_worldPos);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float lit = smoothstep(-0.35, 0.5, ndl);
    color += u_colorAtmo * fres * (0.35 + 0.9 * lit);
  }

  fragColor = vec4(color, 1.0);
}`;

const GASEOUS_KINDS = new Set<PlanetType>([PlanetType.Gaseous, PlanetType.Giant, PlanetType.Ringed]);

/** Hash estable de un string → float en [0, 1000) (semilla determinista por planeta). */
function hashSeed(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 1000000) / 997;
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
function scaleColor(c: { r: number; g: number; b: number }, k: number): [number, number, number] {
  return [clamp01(c.r * k), clamp01(c.g * k), clamp01(c.b * k)];
}
function mixWhite(c: { r: number; g: number; b: number }, t: number): [number, number, number] {
  return [clamp01(c.r + (1 - c.r) * t), clamp01(c.g + (1 - c.g) * t), clamp01(c.b + (1 - c.b) * t)];
}

export class PlanetSurfaceRenderer {
  private program: WebGLProgram | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(private gl: WebGL2RenderingContext) {
    this.program = this.build();
    if (this.program) {
      const names = [
        'u_modelMatrix', 'u_viewMatrix', 'u_projectionMatrix', 'u_normalMatrix',
        'u_surfaceType', 'u_seed', 'u_hasAtmosphere', 'u_colorLow', 'u_colorHigh', 'u_colorAtmo',
        'u_lightDir', 'u_lightColor', 'u_ambientColor', 'u_ambientStrength', 'u_cameraPos', 'u_time'
      ];
      for (const nm of names) this.uniforms[nm] = gl.getUniformLocation(this.program, nm);
    }
  }

  /** true si este planeta debe renderizarse con el shader procedural (no Sol, no Tierra partida). */
  public handles(planet: Planet): boolean {
    const pt = planet.planetType;
    return pt !== PlanetType.Sun && pt !== PlanetType.Tierra;
  }

  /** Resuelve estilo por DATO: (planetType + baseColorName) → paleta + tipo de superficie. Puro/testable. */
  public resolveStyle(planet: Planet): PlanetStyle {
    const c = planet.color;
    const name = planet.baseColorName as PlanetColorName;
    const seed = hashSeed(planet.id);
    if (GASEOUS_KINDS.has(planet.planetType)) {
      return {
        type: 2, hasAtmosphere: true, seed,
        colorLow: scaleColor(c, 0.62), colorHigh: scaleColor(c, 1.28), colorAtmo: mixWhite(c, 0.55)
      };
    }
    if (name === 'azul_hielo') {
      return {
        type: 3, hasAtmosphere: true, seed,
        colorLow: [0.55, 0.68, 0.85], colorHigh: [0.95, 0.98, 1.0], colorAtmo: [0.70, 0.85, 1.0]
      };
    }
    if (name === 'verde' || name === 'azul_marino') {
      return {
        type: 1, hasAtmosphere: true, seed,
        colorLow: [0.03, 0.09, 0.24], colorHigh: scaleColor(c, 1.05), colorAtmo: [0.35, 0.60, 1.0]
      };
    }
    // rocky (marron/gris/rojo_carmesi/violeta_oscuro y por defecto): sin atmósfera
    return {
      type: 0, hasAtmosphere: false, seed,
      colorLow: scaleColor(c, 0.5), colorHigh: scaleColor(c, 1.18), colorAtmo: [0, 0, 0]
    };
  }

  /**
   * Dibuja la esfera del planeta con superficie procedural. `normalMatrix` la calcula el motor
   * (evita duplicar matemática). `lightDir` = dirección sol→planeta (misma convención que el lit shader).
   */
  public renderPlanet(
    planet: Planet,
    modelMatrix: Float32Array,
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array,
    normalMatrix: Float32Array,
    cameraPos: Float32Array,
    lightDir: Float32Array,
    lightColor: Float32Array,
    ambientColor: Float32Array,
    ambientStrength: number,
    timeSec: number
  ): void {
    const gl = this.gl;
    if (!this.program) return;
    const style = this.resolveStyle(planet);
    gl.useProgram(this.program);
    const u = this.uniforms;
    if (u['u_modelMatrix']) gl.uniformMatrix4fv(u['u_modelMatrix'], false, modelMatrix);
    if (u['u_viewMatrix']) gl.uniformMatrix4fv(u['u_viewMatrix'], false, viewMatrix);
    if (u['u_projectionMatrix']) gl.uniformMatrix4fv(u['u_projectionMatrix'], false, projectionMatrix);
    if (u['u_normalMatrix']) gl.uniformMatrix4fv(u['u_normalMatrix'], false, normalMatrix);
    if (u['u_surfaceType']) gl.uniform1f(u['u_surfaceType'], style.type);
    if (u['u_seed']) gl.uniform1f(u['u_seed'], style.seed);
    if (u['u_hasAtmosphere']) gl.uniform1f(u['u_hasAtmosphere'], style.hasAtmosphere ? 1 : 0);
    if (u['u_colorLow']) gl.uniform3fv(u['u_colorLow'], style.colorLow);
    if (u['u_colorHigh']) gl.uniform3fv(u['u_colorHigh'], style.colorHigh);
    if (u['u_colorAtmo']) gl.uniform3fv(u['u_colorAtmo'], style.colorAtmo);
    if (u['u_lightDir']) gl.uniform3fv(u['u_lightDir'], lightDir);
    if (u['u_lightColor']) gl.uniform3fv(u['u_lightColor'], lightColor);
    if (u['u_ambientColor']) gl.uniform3fv(u['u_ambientColor'], ambientColor);
    if (u['u_ambientStrength']) gl.uniform1f(u['u_ambientStrength'], ambientStrength);
    if (u['u_cameraPos']) gl.uniform3fv(u['u_cameraPos'], cameraPos);
    if (u['u_time']) gl.uniform1f(u['u_time'], timeSec);
    // GameObject.render bindea a_position/a_normal y dibuja (los u_* de nombres distintos son no-op).
    planet.render(gl, this.program, viewMatrix, projectionMatrix);
  }

  /** Sol procedural: granulación + manchas + oscurecimiento del limbo (auto-iluminado, sin terminador). */
  public renderSun(
    planet: Planet,
    modelMatrix: Float32Array,
    viewMatrix: Float32Array,
    projectionMatrix: Float32Array,
    normalMatrix: Float32Array,
    cameraPos: Float32Array,
    timeSec: number
  ): void {
    const gl = this.gl;
    if (!this.program) return;
    gl.useProgram(this.program);
    const u = this.uniforms;
    const c = planet.color;
    const low: [number, number, number] = [1.0, 0.42, 0.10];
    const high: [number, number, number] = mixWhite(c, 0.35);
    if (u['u_modelMatrix']) gl.uniformMatrix4fv(u['u_modelMatrix'], false, modelMatrix);
    if (u['u_viewMatrix']) gl.uniformMatrix4fv(u['u_viewMatrix'], false, viewMatrix);
    if (u['u_projectionMatrix']) gl.uniformMatrix4fv(u['u_projectionMatrix'], false, projectionMatrix);
    if (u['u_normalMatrix']) gl.uniformMatrix4fv(u['u_normalMatrix'], false, normalMatrix);
    if (u['u_surfaceType']) gl.uniform1f(u['u_surfaceType'], 4);
    if (u['u_seed']) gl.uniform1f(u['u_seed'], hashSeed(planet.id));
    if (u['u_hasAtmosphere']) gl.uniform1f(u['u_hasAtmosphere'], 0);
    if (u['u_colorLow']) gl.uniform3fv(u['u_colorLow'], low);
    if (u['u_colorHigh']) gl.uniform3fv(u['u_colorHigh'], high);
    if (u['u_cameraPos']) gl.uniform3fv(u['u_cameraPos'], cameraPos);
    if (u['u_time']) gl.uniform1f(u['u_time'], timeSec);
    planet.render(gl, this.program, viewMatrix, projectionMatrix);
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
      try { GameLogger.error(LogCategory.SHADERS, 'PlanetSurfaceRenderer link error', { info: gl.getProgramInfoLog(prog) }); } catch {}
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
      try { GameLogger.error(LogCategory.SHADERS, 'PlanetSurfaceRenderer compile error', { info: gl.getShaderInfoLog(sh) }); } catch {}
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  public cleanup(): void {
    if (this.program) { this.gl.deleteProgram(this.program); this.program = null; }
  }
}
