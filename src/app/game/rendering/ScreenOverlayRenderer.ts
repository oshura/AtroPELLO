export class ScreenOverlayRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private uMode: WebGLUniformLocation | null = null;
  private uColor: WebGLUniformLocation | null = null;
  private uTex: WebGLUniformLocation | null = null;
  private uUvScale: WebGLUniformLocation | null = null;
  private uUvOffset: WebGLUniformLocation | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.init();
  }

  private init(): void {
    const gl = this.gl;
    const vs = `#version 300 es\n
    precision highp float;\n
    out vec2 v_uv;\n
    void main(){\n
      // Fullscreen triangle via gl_VertexID\n
      vec2 pos;\n
      if (gl_VertexID == 0) pos = vec2(-1.0, -1.0);\n
      else if (gl_VertexID == 1) pos = vec2(3.0, -1.0);\n
      else pos = vec2(-1.0, 3.0);\n
      v_uv = 0.5 * (pos + 1.0);\n
      gl_Position = vec4(pos, 0.0, 1.0);\n
    }`;
    const fs = `#version 300 es\n
    precision highp float;\n
    in vec2 v_uv;\n
    uniform int u_mode; // 0 = solid, 1 = texture\n
    uniform vec4 u_color; // rgb + alpha for solid; rgb tint for texture (alpha ignored)\n
    uniform sampler2D u_tex;\n
    uniform vec2 u_uvScale;\n
    uniform vec2 u_uvOffset;\n
    out vec4 fragColor;\n
    void main(){\n
      if (u_mode == 0) {\n
        fragColor = u_color;\n
      } else {\n
        vec2 uv = (v_uv - 0.5) * u_uvScale + 0.5 + u_uvOffset;\n
        vec4 c = texture(u_tex, uv);\n
        // Apply tint color's alpha as overall opacity, multiply RGB by tint.rgb\n
        vec3 rgb = c.rgb * u_color.rgb;\n
        float a = c.a * u_color.a;\n
        fragColor = vec4(rgb, a);\n
      }\n
    }`;
    const vsh = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vsh, vs); gl.compileShader(vsh);
    if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
      console.error('ScreenOverlayRenderer VS error:', gl.getShaderInfoLog(vsh));
    }
    const fsh = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fsh, fs); gl.compileShader(fsh);
    if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
      console.error('ScreenOverlayRenderer FS error:', gl.getShaderInfoLog(fsh));
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('ScreenOverlayRenderer link error:', gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vsh); gl.deleteShader(fsh);
    this.program = prog;
    this.uMode = gl.getUniformLocation(prog, 'u_mode');
    this.uColor = gl.getUniformLocation(prog, 'u_color');
    this.uTex = gl.getUniformLocation(prog, 'u_tex');
    this.uUvScale = gl.getUniformLocation(prog, 'u_uvScale');
    this.uUvOffset = gl.getUniformLocation(prog, 'u_uvOffset');
  }

  public drawSolid(color: [number, number, number], alpha: number): void {
    if (!this.program) return;
    const gl = this.gl;
    const wasDepth = gl.isEnabled(gl.DEPTH_TEST); if (wasDepth) gl.disable(gl.DEPTH_TEST);
    const wasCull = gl.isEnabled(gl.CULL_FACE); if (wasCull) gl.disable(gl.CULL_FACE);
    const wasBlend = gl.isEnabled(gl.BLEND); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.program);
    if (this.uMode) gl.uniform1i(this.uMode, 0);
    if (this.uColor) gl.uniform4f(this.uColor, color[0], color[1], color[2], alpha);
  if (this.uUvScale) gl.uniform2f(this.uUvScale, 1.0, 1.0);
  if (this.uUvOffset) gl.uniform2f(this.uUvOffset, 0.0, 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!wasBlend) gl.disable(gl.BLEND);
    if (wasCull) gl.enable(gl.CULL_FACE);
    if (wasDepth) gl.enable(gl.DEPTH_TEST);
  }

  public drawTexture(tex: WebGLTexture, tint: [number, number, number], alpha: number): void {
    if (!this.program) return;
    const gl = this.gl;
    const wasDepth = gl.isEnabled(gl.DEPTH_TEST); if (wasDepth) gl.disable(gl.DEPTH_TEST);
    const wasCull = gl.isEnabled(gl.CULL_FACE); if (wasCull) gl.disable(gl.CULL_FACE);
    const wasBlend = gl.isEnabled(gl.BLEND); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.program);
    if (this.uMode) gl.uniform1i(this.uMode, 1);
    if (this.uColor) gl.uniform4f(this.uColor, tint[0], tint[1], tint[2], alpha);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.uTex) gl.uniform1i(this.uTex, 0);
  if (this.uUvScale) gl.uniform2f(this.uUvScale, 1.0, 1.0);
  if (this.uUvOffset) gl.uniform2f(this.uUvOffset, 0.0, 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!wasBlend) gl.disable(gl.BLEND);
    if (wasCull) gl.enable(gl.CULL_FACE);
    if (wasDepth) gl.enable(gl.DEPTH_TEST);
  }

  /** Draw texture with cover scaling and additional zoom (>=1.0), centered */
  public drawTextureCover(tex: WebGLTexture, texW: number, texH: number, zoom: number, alpha: number): void {
    if (!this.program) return;
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const cw = canvas.width || 1;
    const ch = canvas.height || 1;
    const av = cw / ch;
    const at = Math.max(1e-6, texW / Math.max(1e-6, texH));
    let scaleX = 1.0, scaleY = 1.0;
    if (av > at) {
      // viewport wider -> crop vertically
      scaleY = at / av;
    } else {
      // viewport taller -> crop horizontally
      scaleX = av / at;
    }
    const z = Math.max(1.0, zoom || 1.0);
    scaleX /= z; scaleY /= z;

    const wasDepth = gl.isEnabled(gl.DEPTH_TEST); if (wasDepth) gl.disable(gl.DEPTH_TEST);
    const wasCull = gl.isEnabled(gl.CULL_FACE); if (wasCull) gl.disable(gl.CULL_FACE);
    const wasBlend = gl.isEnabled(gl.BLEND); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.program);
    if (this.uMode) gl.uniform1i(this.uMode, 1);
    if (this.uColor) gl.uniform4f(this.uColor, 1, 1, 1, alpha);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.uTex) gl.uniform1i(this.uTex, 0);
    if (this.uUvScale) gl.uniform2f(this.uUvScale, scaleX, scaleY);
    if (this.uUvOffset) gl.uniform2f(this.uUvOffset, 0.0, 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!wasBlend) gl.disable(gl.BLEND);
    if (wasCull) gl.enable(gl.CULL_FACE);
    if (wasDepth) gl.enable(gl.DEPTH_TEST);
  }
}
