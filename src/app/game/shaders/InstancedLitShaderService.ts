import { WebGLService } from '../../services/webgl.service';
import { GameLogger } from '../utils/GameLogger';
import { LogCategory } from '../../services/logging.service';

/**
 * Service that owns the instanced-lit shader program and its locations.
 * Provides a small API to bind and set uniforms without leaking details.
 */
export class InstancedLitShaderService {
  private gl: WebGL2RenderingContext | null = null;
  public program: WebGLProgram | null = null;
  public attributes: { [key: string]: number } = {};
  public uniforms: { [key: string]: WebGLUniformLocation | null } = {};

  constructor(private webglService: WebGLService) {}

  initialize(): void {
    this.gl = this.webglService.getContext() as WebGL2RenderingContext | null;
    if (!this.gl) return;

    const vs = this.compileShader(this.gl.VERTEX_SHADER, this.getVertexSource());
    const fs = this.compileShader(this.gl.FRAGMENT_SHADER, this.getFragmentSource());
    if (!vs || !fs) return;

    const prog = this.gl.createProgram();
    if (!prog) return;
    this.gl.attachShader(prog, vs);
    this.gl.attachShader(prog, fs);
    this.gl.linkProgram(prog);
    if (!this.gl.getProgramParameter(prog, this.gl.LINK_STATUS)) {
      try { GameLogger.error(LogCategory.SHADERS, 'InstancedLitShaderService link error', { info: this.gl.getProgramInfoLog(prog) }); } catch {}
      this.gl.deleteProgram(prog);
      return;
    }
    this.gl.deleteShader(vs);
    this.gl.deleteShader(fs);
    this.program = prog;

    // Locations
    this.attributes['position'] = this.gl.getAttribLocation(prog, 'a_position');
    this.attributes['normal'] = this.gl.getAttribLocation(prog, 'a_normal');
    this.attributes['i_model0'] = this.gl.getAttribLocation(prog, 'i_model0');
    this.attributes['i_model1'] = this.gl.getAttribLocation(prog, 'i_model1');
    this.attributes['i_model2'] = this.gl.getAttribLocation(prog, 'i_model2');
    this.attributes['i_model3'] = this.gl.getAttribLocation(prog, 'i_model3');
  this.attributes['i_opacity'] = this.gl.getAttribLocation(prog, 'i_opacity');

    this.uniforms['viewMatrix'] = this.gl.getUniformLocation(prog, 'u_viewMatrix');
    this.uniforms['projectionMatrix'] = this.gl.getUniformLocation(prog, 'u_projectionMatrix');
    this.uniforms['lightDirection'] = this.gl.getUniformLocation(prog, 'u_lightDirection');
    this.uniforms['lightColor'] = this.gl.getUniformLocation(prog, 'u_lightColor');
    this.uniforms['ambientColor'] = this.gl.getUniformLocation(prog, 'u_ambientColor');
    this.uniforms['ambientStrength'] = this.gl.getUniformLocation(prog, 'u_ambientStrength');
    this.uniforms['baseColor'] = this.gl.getUniformLocation(prog, 'u_baseColor');
  }

  useProgram(): void {
    if (!this.gl || !this.program) return;
    this.gl.useProgram(this.program);
  }

  setMatrices(viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    if (!this.gl || !this.program) return;
    this.gl.uniformMatrix4fv(this.uniforms['viewMatrix'], false, viewMatrix);
    this.gl.uniformMatrix4fv(this.uniforms['projectionMatrix'], false, projectionMatrix);
  }

  setLighting(lightDirection: Float32Array, lightColor: Float32Array, ambientColor: Float32Array, ambientStrength: number): void {
    if (!this.gl || !this.program) return;
    this.gl.uniform3fv(this.uniforms['lightDirection'], lightDirection);
    this.gl.uniform3fv(this.uniforms['lightColor'], lightColor);
    this.gl.uniform3fv(this.uniforms['ambientColor'], ambientColor);
    this.gl.uniform1f(this.uniforms['ambientStrength'], ambientStrength);
  }

  setBaseColor(color: Float32Array): void {
    if (!this.gl || !this.program) return;
    this.gl.uniform3fv(this.uniforms['baseColor'], color);
  }

  cleanup(): void {
    if (!this.gl) return;
    if (this.program) this.gl.deleteProgram(this.program);
    this.program = null;
    this.attributes = {};
    this.uniforms = {};
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type);
    if (!shader) return null;
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      try { GameLogger.error(LogCategory.SHADERS, 'InstancedLitShaderService compile error', { info: this.gl.getShaderInfoLog(shader) }); } catch {}
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private getVertexSource(): string {
    return `#version 300 es
    precision highp float;

    in vec3 a_position;
    in vec3 a_normal;

    in vec4 i_model0;
    in vec4 i_model1;
    in vec4 i_model2;
    in vec4 i_model3;
  in float i_opacity;

    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform vec3 u_lightDirection;

  out vec3 v_color;
  out float v_opacity;
    out vec3 v_normal;
    out vec3 v_lightDirection;
    out float v_lightIntensity;

    void main() {
      mat4 u_modelMatrix = mat4(i_model0, i_model1, i_model2, i_model3);
      vec4 worldPosition = u_modelMatrix * vec4(a_position, 1.0);
      vec4 viewPosition = u_viewMatrix * worldPosition;
      gl_Position = u_projectionMatrix * viewPosition;

      mat3 model3 = mat3(u_modelMatrix);
      vec3 worldNormal = normalize(model3 * a_normal);
      float lightDot = max(dot(worldNormal, -u_lightDirection), 0.0);
      v_lightIntensity = lightDot;
      v_normal = worldNormal;
      v_lightDirection = u_lightDirection;
      v_color = vec3(1.0);
      v_opacity = i_opacity;
    }`;
  }

  private getFragmentSource(): string {
    // Same as lit fragment in ShaderManager
    return `#version 300 es
    precision highp float;

  in vec3 v_color;
  in float v_opacity;
    in vec3 v_normal;
    in vec3 v_lightDirection;
    in float v_lightIntensity;

    uniform vec3 u_lightColor;
    uniform vec3 u_ambientColor;
    uniform float u_ambientStrength;
    uniform vec3 u_baseColor;

    out vec4 fragColor;

    void main() {
      vec3 ambient = u_ambientStrength * u_ambientColor;
      vec3 diffuse = v_lightIntensity * u_lightColor;
      vec3 base = u_baseColor;
      vec3 finalColor = base * (ambient + diffuse);
      finalColor = max(finalColor, base * 0.2);
  // Dark-to-normal brightness during fade to avoid washing out background
  // More aggressive darkening: keep very dark for low opacity
  float opacity = clamp(v_opacity, 0.0, 1.0);
  float brightness = max(0.05, pow(opacity, 2.2));
  finalColor *= brightness;
  // Color-only fade: keep alpha at 1.0 to avoid brightening the background
  fragColor = vec4(finalColor, 1.0);
    }`;
  }
}
