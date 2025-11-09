import { WebGLService } from '../../services/webgl.service';
import { GameLogger } from '../utils/GameLogger';
import { LogCategory } from '../../services/logging.service';

export class ReticleShaderService {
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
      try { GameLogger.error(LogCategory.SHADERS, 'Reticle shader link error', { info: this.gl.getProgramInfoLog(prog) }); } catch {}
      this.gl.deleteProgram(prog);
      return;
    }
    this.gl.deleteShader(vs);
    this.gl.deleteShader(fs);
    this.program = prog;

    this.attributes['position'] = this.gl.getAttribLocation(prog, 'a_position');
    this.uniforms['modelMatrix'] = this.gl.getUniformLocation(prog, 'u_modelMatrix');
    this.uniforms['viewMatrix'] = this.gl.getUniformLocation(prog, 'u_viewMatrix');
    this.uniforms['projectionMatrix'] = this.gl.getUniformLocation(prog, 'u_projectionMatrix');
    this.uniforms['color'] = this.gl.getUniformLocation(prog, 'u_color');
    this.uniforms['opacity'] = this.gl.getUniformLocation(prog, 'u_opacity');
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
      try { GameLogger.error(LogCategory.SHADERS, 'Reticle shader compile error', { info: this.gl.getShaderInfoLog(shader) }); } catch {}
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private getVertexSource(): string {
    return `#version 300 es
    precision highp float;
    in vec3 a_position;
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    void main(){
      vec4 world = u_modelMatrix * vec4(a_position, 1.0);
      vec4 view = u_viewMatrix * world;
      gl_Position = u_projectionMatrix * view;
    }`;
  }

  private getFragmentSource(): string {
    return `#version 300 es
    precision highp float;
    uniform vec4 u_color;
    uniform float u_opacity;
    out vec4 fragColor;
    void main(){
      fragColor = vec4(u_color.rgb, u_color.a * u_opacity);
    }`;
  }
}
