import { WebGLService } from '../../services/webgl.service';
import { GameLogger } from '../utils/GameLogger';
import { LogCategory } from '../../services/logging.service';

export class OutlineShaderService {
  private gl: WebGL2RenderingContext | null = null;
  public program: WebGLProgram | null = null;

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
      try { GameLogger.error(LogCategory.SHADERS, 'Outline post-process link error', { info: this.gl.getProgramInfoLog(prog) }); } catch {}
      this.gl.deleteProgram(prog);
      return;
    }
    this.gl.deleteShader(vs);
    this.gl.deleteShader(fs);
    this.program = prog;
  }

  cleanup(): void {
    if (!this.gl) return;
    if (this.program) this.gl.deleteProgram(this.program);
    this.program = null;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type);
    if (!shader) return null;
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      try { GameLogger.error(LogCategory.SHADERS, 'Outline post-process compile error', { info: this.gl.getShaderInfoLog(shader) }); } catch {}
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private getVertexSource(): string {
    return `#version 300 es
      precision highp float;
      layout(location = 0) in vec2 a_position;
      layout(location = 1) in vec2 a_uv;
      out vec2 v_uv;
      void main(){ v_uv = a_uv; gl_Position = vec4(a_position, 0.0, 1.0); }
    `;
  }

  private getFragmentSource(): string {
    return `#version 300 es
      precision highp float;
      in vec2 v_uv;
      out vec4 fragColor;
      uniform sampler2D u_colorTexture;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec4 u_outlineColor;
      void main(){
        vec2 texel = 1.0 / u_resolution;
        float aC = texture(u_colorTexture, v_uv).a;
        float aL = texture(u_colorTexture, v_uv + vec2(-texel.x, 0.0)).a;
        float aR = texture(u_colorTexture, v_uv + vec2( texel.x, 0.0)).a;
        float aT = texture(u_colorTexture, v_uv + vec2(0.0,  texel.y)).a;
        float aB = texture(u_colorTexture, v_uv + vec2(0.0, -texel.y)).a;
        float edge = 0.0;
        edge += float(aC != aL);
        edge += float(aC != aR);
        edge += float(aC != aT);
        edge += float(aC != aB);
        edge = clamp(edge, 0.0, 1.0);
        fragColor = edge > 0.0 ? u_outlineColor : vec4(0.0);
      }
    `;
  }
}
