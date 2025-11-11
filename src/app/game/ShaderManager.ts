import { WebGLService } from '../services/webgl.service';
import { GameLogger } from './utils/GameLogger';
import { LogCategory } from '../services/logging.service';
import { InstancedLitShaderService } from './shaders/InstancedLitShaderService';
import { HudShaderService } from './shaders/HudShaderService';
import { ReticleShaderService } from './shaders/ReticleShaderService';
import { OutlineShaderService } from './shaders/OutlineShaderService';

/**
 * Shader programs para renderizado 3D
 */
export class ShaderManager {
  private gl: WebGL2RenderingContext | null = null;
  
  // Programas de shader
  public basicProgram: WebGLProgram | null = null;
  public litProgram: WebGLProgram | null = null;
  public texturedProgram: WebGLProgram | null = null;
  public glowProgram: WebGLProgram | null = null;
  public unlitTexProgram: WebGLProgram | null = null;
  public stormShellProgram: WebGLProgram | null = null;
  public portalProgram: WebGLProgram | null = null;
  public eyeProgram: WebGLProgram | null = null; // 3D eye sphere shader
  public flameProgram: WebGLProgram | null = null; // upward flame billboard shader
  // Modular services own these programs, we expose getters for back-compat
  private hudSvc: HudShaderService | null = null;
  private reticleSvc: ReticleShaderService | null = null;
  private outlineSvc: OutlineShaderService | null = null;
  // Instanced-lit handled by a dedicated service
  private instancedLitSvc: InstancedLitShaderService | null = null;
  
  // Ubicaciones de uniformes para el programa básico
  public basicUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  
  // Ubicaciones de uniformes para el programa con iluminación
  public litUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  
  // Ubicaciones de uniformes para el programa texturizado
  public texturedUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  
  // Ubicaciones de uniformes para el programa HUD
  public hudUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  
  // Ubicaciones de uniformes para el programa retícula
  public reticleUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  
  // Ubicaciones de uniformes para el programa outline
  public outlineUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  
  // Ubicaciones de atributos
  public basicAttributes: { [key: string]: number } = {};
  public litAttributes: { [key: string]: number } = {};
  public texturedAttributes: { [key: string]: number } = {};
  public hudAttributes: { [key: string]: number } = {};
  public reticleAttributes: { [key: string]: number } = {};
  public outlineAttributes: { [key: string]: number } = {};
  public glowAttributes: { [key: string]: number } = {};
  public unlitTexAttributes: { [key: string]: number } = {};
  public stormShellAttributes: { [key: string]: number } = {};
  public stormShellUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  public portalAttributes: { [key: string]: number } = {};
  public portalUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  public eyeAttributes: { [key: string]: number } = {};
  public eyeUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  public flameAttributes: { [key: string]: number } = {};
  public flameUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  // Attributes for instanced-lit are exposed via helper getters

  constructor(private webglService: WebGLService) {
    const context = webglService.getContext();
    this.gl = context as WebGL2RenderingContext | null;
    if (this.gl) {
      this.initializeShaders();
    }
    // Exponer referencia global opcional para renderizados especializados
    try { (window as any).shaderManagerInstance = this; } catch {}
  }

  /**
   * Inicializa todos los programas de shader
   */
  private initializeShaders(): void {
    if (!this.gl) return;

    // Crear programa básico (sin iluminación)
    this.basicProgram = this.createProgram(
      this.getBasicVertexShader(),
      this.getBasicFragmentShader()
    );

    // Crear programa con iluminación
    this.litProgram = this.createProgram(
      this.getLitVertexShader(),
      this.getLitFragmentShader()
    );

    // Crear programa texturizado
    this.texturedProgram = this.createProgram(
      this.getTexturedVertexShader(),
      this.getTexturedFragmentShader()
    );

    // Programa para glows con caída radial (color con alpha)
    this.glowProgram = this.createProgram(
      this.getGlowVertexShader(),
      this.getGlowFragmentShader()
    );

    // Programa texturizado sin iluminación (para magma del Sol)
    this.unlitTexProgram = this.createProgram(
      this.getUnlitTexVertexShader(),
      this.getUnlitTexFragmentShader()
    );

    // Programa de cúpula de tormenta (procedural sobre esfera)
    this.stormShellProgram = this.createProgram(
      this.getStormShellVertexShader(),
      this.getStormShellFragmentShader()
    );

    // Programa del Portal (runas + ojo central)
    this.portalProgram = this.createProgram(
      this.getPortalVertexShader(),
      this.getPortalFragmentShader()
    );

    // Programa del ojo 3D (esfera + pupila)
    this.eyeProgram = this.createProgram(
      this.getEyeVertexShader(),
      this.getEyeFragmentShader()
    );

    // Programa de la llama vertical desde la pupila
    this.flameProgram = this.createProgram(
      this.getFlameVertexShader(),
      this.getFlameFragmentShader()
    );

    // Servicios modulares
    this.hudSvc = new HudShaderService(this.webglService); this.hudSvc.initialize();
    this.reticleSvc = new ReticleShaderService(this.webglService); this.reticleSvc.initialize();
    this.outlineSvc = new OutlineShaderService(this.webglService); this.outlineSvc.initialize();

    // Inicializar servicio de instanced-lit
    this.instancedLitSvc = new InstancedLitShaderService(this.webglService);
    this.instancedLitSvc.initialize();

    // Obtener ubicaciones de uniformes y atributos
    if (this.basicProgram) {
      this.getBasicProgramLocations();
    }
    
    if (this.litProgram) {
      this.getLitProgramLocations();
    }

    if (this.texturedProgram) {
      this.getTexturedProgramLocations();
    }

    if (this.hudProgram) this.getHUDProgramLocations();
    if (this.reticleProgram) this.getReticleProgramLocations();
    if (this.outlineProgram) this.getOutlineProgramLocations();
  if (this.glowProgram) this.getGlowProgramLocations();
  if (this.unlitTexProgram) this.getUnlitTexProgramLocations();
  if (this.stormShellProgram) this.getStormShellProgramLocations();
  if (this.portalProgram) this.getPortalProgramLocations();
  if (this.eyeProgram) this.getEyeProgramLocations();
  if (this.flameProgram) this.getFlameProgramLocations();

    // Locations for instanced program are held inside the service
  }

  private getGlowVertexShader(): string {
    return `#version 300 es
    precision highp float;
    in vec3 a_position;
    in vec2 a_uv;
    in vec4 a_color;
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    out vec4 v_color;
    out vec2 v_uv;
    void main(){
      vec4 world = u_modelMatrix * vec4(a_position,1.0);
      vec4 view = u_viewMatrix * world;
      gl_Position = u_projectionMatrix * view;
      v_color = a_color;
      v_uv = a_uv;
    }`;
  }

  private getGlowFragmentShader(): string {
    return `#version 300 es
    precision highp float;
    in vec4 v_color;
    in vec2 v_uv;
    out vec4 fragColor;
    void main(){
      // v_uv in [-1,1]x[-1,1]; use radial falloff to make billboard look circular
      float r = length(v_uv);
      // Outer edge fade from r ~ 0.7 -> 1.0
      float edge = 1.0 - smoothstep(0.7, 1.0, r);
      // Cut out the inner core so glow doesn't overlay the Sun disk
      float coreMask = smoothstep(0.25, 0.35, r);
      float alpha = v_color.a * edge * coreMask;
      fragColor = vec4(v_color.rgb, alpha);
    }`;
  }

  private getGlowProgramLocations(): void {
    if (!this.gl || !this.glowProgram) return;
    const gl = this.gl;
    this.glowAttributes['position'] = gl.getAttribLocation(this.glowProgram, 'a_position');
    this.glowAttributes['uv'] = gl.getAttribLocation(this.glowProgram, 'a_uv');
    this.glowAttributes['color'] = gl.getAttribLocation(this.glowProgram, 'a_color');
  }

  // ===== Unlit textured (diffuse-only) for Sun magma =====
  private getUnlitTexVertexShader(): string {
    return `#version 300 es
    precision highp float;
    in vec3 a_position;
    in vec2 a_uv;
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    out vec2 v_uv;
    void main(){
      vec4 world = u_modelMatrix * vec4(a_position,1.0);
      vec4 view = u_viewMatrix * world;
      gl_Position = u_projectionMatrix * view;
      v_uv = a_uv;
    }`;
  }
  private getUnlitTexFragmentShader(): string {
    return `#version 300 es
    precision highp float;
    in vec2 v_uv;
    uniform sampler2D u_diffuse;
    out vec4 fragColor;
    void main(){
      vec4 c = texture(u_diffuse, v_uv);
      fragColor = c;
    }`;
  }
  private getUnlitTexProgramLocations(): void {
    if (!this.gl || !this.unlitTexProgram) return;
    const gl = this.gl;
    this.unlitTexAttributes['position'] = gl.getAttribLocation(this.unlitTexProgram, 'a_position');
    this.unlitTexAttributes['uv'] = gl.getAttribLocation(this.unlitTexProgram, 'a_uv');
  }
  public useUnlitTexProgram(): void { if (this.gl && this.unlitTexProgram) this.gl.useProgram(this.unlitTexProgram); }
  public setUnlitTexMatrices(model: Float32Array, view: Float32Array, proj: Float32Array): void {
    if (!this.gl || !this.unlitTexProgram) return;
    const gl = this.gl;
    const uModel = gl.getUniformLocation(this.unlitTexProgram, 'u_modelMatrix');
    const uView = gl.getUniformLocation(this.unlitTexProgram, 'u_viewMatrix');
    const uProj = gl.getUniformLocation(this.unlitTexProgram, 'u_projectionMatrix');
    if (uModel) gl.uniformMatrix4fv(uModel, false, model);
    if (uView) gl.uniformMatrix4fv(uView, false, view);
    if (uProj) gl.uniformMatrix4fv(uProj, false, proj);
  }
  public setUnlitDiffuseTexture(tex: WebGLTexture): void {
    if (!this.gl || !this.unlitTexProgram) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const loc = gl.getUniformLocation(this.unlitTexProgram, 'u_diffuse');
    if (loc) gl.uniform1i(loc, 0);
  }

  public useGlowProgram(): void { if (this.gl && this.glowProgram) this.gl.useProgram(this.glowProgram); }
  public setGlowMatrices(model: Float32Array, view: Float32Array, proj: Float32Array): void {
    if (!this.gl || !this.glowProgram) return;
    const gl = this.gl;
    const uModel = gl.getUniformLocation(this.glowProgram, 'u_modelMatrix');
    const uView = gl.getUniformLocation(this.glowProgram, 'u_viewMatrix');
    const uProj = gl.getUniformLocation(this.glowProgram, 'u_projectionMatrix');
    if (uModel) gl.uniformMatrix4fv(uModel, false, model);
    if (uView) gl.uniformMatrix4fv(uView, false, view);
    if (uProj) gl.uniformMatrix4fv(uProj, false, proj);
  }

  // ===== Storm shell program (procedural veins over sphere) =====
  private getStormShellVertexShader(): string {
    return `#version 300 es
    precision highp float;
    in vec3 a_position;
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform float u_shellScale;
    out vec3 v_normalObj;
    void main(){
      vec3 pos = a_position * u_shellScale;
      v_normalObj = normalize(a_position);
      vec4 world = u_modelMatrix * vec4(pos, 1.0);
      gl_Position = u_projectionMatrix * (u_viewMatrix * world);
    }`;
  }
  private getStormShellFragmentShader(): string {
    return `#version 300 es
    precision highp float;
    in vec3 v_normalObj;
    out vec4 fragColor;
    uniform float u_time;
    uniform float u_intensity; // base intensity multiplier
    uniform float u_flash;     // 0..1 extra boost
    uniform vec3 u_colorBase;  // faint lava color
    uniform vec3 u_colorVein;  // bright vein color

    // Tiny hash/noise helpers (cheap, not perfect but adequate for stylized effect)
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
    float noise(vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f*f*(3.0-2.0*f);
      return mix(a, b, u.x) + (c - a)*u.y*(1.0 - u.x) + (d - b)*u.x*u.y;
    }
    float fbm(vec2 p){
      float v = 0.0;
      float a = 0.5;
      for(int i=0;i<4;i++){
        v += a * noise(p);
        p *= 2.03;
        a *= 0.5;
      }
      return v;
    }

    void main(){
      // Spherical coords from object normal
      vec3 n = normalize(v_normalObj);
      float lon = atan(n.z, n.x);           // [-pi, pi]
      float lat = asin(clamp(n.y, -1.0, 1.0)); // [-pi/2, pi/2]
      vec2 uv = vec2(lon / (6.28318530718) + 0.5, lat / 3.14159265359 + 0.5);

      float t = u_time * 0.35; // slow drift
      // Vein field: stripes + noise warping
      vec2 q = uv * vec2(12.0, 6.0);
      float w = fbm(q + vec2(t*0.6, -t*0.4));
      float stripes = abs(sin((q.x + w*1.8) * 3.14159265));
      float veins = smoothstep(0.82, 0.96, 1.0 - stripes);
      // Secondary cross-stripes to create branching
      float stripes2 = abs(sin((q.y + w*1.3 + uv.x*2.0) * 3.14159265));
      veins = max(veins, smoothstep(0.86, 0.97, 1.0 - stripes2));

      // Animate crack flicker
      float flicker = 0.85 + 0.3 * noise(uv*20.0 + t*3.0);
      float flash = u_flash; // external flash pulse

      // Base faint lava + bright veins
      vec3 baseCol = u_colorBase * (0.35 * u_intensity);
      vec3 veinCol = u_colorVein * (0.8 + 0.6*flicker + 1.2*flash);
      vec3 col = baseCol + veinCol * veins;
      // Alpha small; additive blending will accumulate
      float alpha = clamp(0.08 * u_intensity + veins * (0.25 + 0.35*flash), 0.0, 0.65);
      fragColor = vec4(col, alpha);
    }`;
  }
  private getStormShellProgramLocations(): void {
    if (!this.gl || !this.stormShellProgram) return;
    const gl = this.gl;
    this.stormShellAttributes['position'] = gl.getAttribLocation(this.stormShellProgram, 'a_position');
    this.stormShellUniforms['modelMatrix'] = gl.getUniformLocation(this.stormShellProgram, 'u_modelMatrix');
    this.stormShellUniforms['viewMatrix'] = gl.getUniformLocation(this.stormShellProgram, 'u_viewMatrix');
    this.stormShellUniforms['projectionMatrix'] = gl.getUniformLocation(this.stormShellProgram, 'u_projectionMatrix');
    this.stormShellUniforms['shellScale'] = gl.getUniformLocation(this.stormShellProgram, 'u_shellScale');
    this.stormShellUniforms['time'] = gl.getUniformLocation(this.stormShellProgram, 'u_time');
    this.stormShellUniforms['intensity'] = gl.getUniformLocation(this.stormShellProgram, 'u_intensity');
    this.stormShellUniforms['flash'] = gl.getUniformLocation(this.stormShellProgram, 'u_flash');
    this.stormShellUniforms['colorBase'] = gl.getUniformLocation(this.stormShellProgram, 'u_colorBase');
    this.stormShellUniforms['colorVein'] = gl.getUniformLocation(this.stormShellProgram, 'u_colorVein');
  }
  public useStormShellProgram(): void { if (this.gl && this.stormShellProgram) this.gl.useProgram(this.stormShellProgram); }
  public setStormShellMatrices(model: Float32Array, view: Float32Array, proj: Float32Array): void {
    if (!this.gl || !this.stormShellProgram) return;
    const gl = this.gl;
    if (this.stormShellUniforms['modelMatrix']) gl.uniformMatrix4fv(this.stormShellUniforms['modelMatrix'], false, model);
    if (this.stormShellUniforms['viewMatrix']) gl.uniformMatrix4fv(this.stormShellUniforms['viewMatrix'], false, view);
    if (this.stormShellUniforms['projectionMatrix']) gl.uniformMatrix4fv(this.stormShellUniforms['projectionMatrix'], false, proj);
  }
  public setStormShellParams(time: number, intensity: number, flash: number, shellScale: number, colorBase: Float32Array, colorVein: Float32Array): void {
    if (!this.gl || !this.stormShellProgram) return;
    const gl = this.gl;
    if (this.stormShellUniforms['time']) gl.uniform1f(this.stormShellUniforms['time'], time);
    if (this.stormShellUniforms['intensity']) gl.uniform1f(this.stormShellUniforms['intensity'], intensity);
    if (this.stormShellUniforms['flash']) gl.uniform1f(this.stormShellUniforms['flash'], flash);
    if (this.stormShellUniforms['shellScale']) gl.uniform1f(this.stormShellUniforms['shellScale'], shellScale);
    if (this.stormShellUniforms['colorBase']) gl.uniform3fv(this.stormShellUniforms['colorBase'], colorBase);
    if (this.stormShellUniforms['colorVein']) gl.uniform3fv(this.stormShellUniforms['colorVein'], colorVein);
  }

  // ===== Portal program =====
  private getPortalVertexShader(): string {
    return `#version 300 es
    precision highp float;
    in vec3 a_position;
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    out vec2 v_pos; // XY in portal plane
    void main(){
      vec4 world = u_modelMatrix * vec4(a_position, 1.0);
      gl_Position = u_projectionMatrix * (u_viewMatrix * world);
      v_pos = a_position.xy; // unit circle mesh scaled by model
    }`;
  }
  private getPortalFragmentShader(): string {
    return `#version 300 es
    precision highp float;
    in vec2 v_pos; // XY on plane (unit circle before model scale)
    out vec4 fragColor;
    uniform float u_time;
    uniform vec3 u_colorOuter; // outer glow color
    uniform vec3 u_colorInner; // inner glow color
    void main(){
      float r = length(v_pos);
      float glow = exp(-r*2.2);
      float edge = 1.0 - smoothstep(0.92, 1.05, r);
      vec3 col = mix(u_colorOuter, u_colorInner, glow);
      float alpha = glow * 0.22 * edge;
      fragColor = vec4(col, alpha);
    }`;
  }
  // ===== Eye sphere shader (3D) =====
  private getEyeVertexShader(): string {
    return `#version 300 es
    precision highp float;
    in vec3 a_position;
    in vec3 a_normal;
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    out vec3 v_normal;
    out vec3 v_posObj;
    void main(){
      vec4 world = u_modelMatrix * vec4(a_position,1.0);
      gl_Position = u_projectionMatrix * (u_viewMatrix * world);
      v_normal = a_normal;
      v_posObj = a_position;
    }`;
  }
  private getEyeFragmentShader(): string {
    return `#version 300 es
    precision highp float;
    in vec3 v_normal;
    in vec3 v_posObj;
    out vec4 fragColor;
    uniform vec3 u_eyeDir; // direction in object space (normalized)
    uniform float u_time;
    // Inner-eye Colors
    uniform vec3 u_irisColor;
    uniform vec3 u_pupilColor;
    uniform float u_pupilRadius; // 0..1
    // Eyelid shell controls
    uniform float u_shellFactor;   // 0 = inner-eye mode, 1 = eyelid shell mode
    uniform float u_eyelidOpen;    // 0..1 band half-height around equator grows with open
    uniform vec3  u_scleraColor;   // base color for outer shell
    uniform float u_bandEdge;      // edge softness
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i=floor(p); vec2 f=fract(p);
      float a=hash(i); float b=hash(i+vec2(1,0)); float c=hash(i+vec2(0,1)); float d=hash(i+vec2(1,1));
      vec2 u=f*f*(3.0-2.0*f);
      return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
    }
    void main(){
      vec3 N = normalize(v_normal);
      vec3 D = normalize(u_eyeDir);
      if (u_shellFactor > 0.5) {
        // Eyelid shell: opaque fuera de la banda de apertura; transparente en la banda ecuatorial
        float t = clamp(u_eyelidOpen, 0.0, 1.0);
        // Translate open (0..1) into half-band height on |N.y|
        float band = smoothstep(t, t + max(0.001, u_bandEdge), abs(N.y));
        float alpha = band; // 0 in opening, 1 on lids
        if (alpha < 0.01) discard;
        fragColor = vec4(u_scleraColor, alpha);
        return;
      }
      // Inner eye: iris + pupil rings
      float facing = dot(N, D); // 1 at pupil center
      float pupil = smoothstep(u_pupilRadius, u_pupilRadius*0.65, facing);
      vec2 uv = vec2(dot(normalize(v_posObj.xy), vec2(1.0,0.0)), dot(normalize(v_posObj.xy), vec2(0.0,1.0)));
      float n = noise(uv*14.0 + u_time*0.1);
      float ring = smoothstep(0.15, 0.85, abs(facing));
      vec3 iris = u_irisColor * (0.55 + 0.45*n) * (0.35 + 0.65*ring);
      vec3 col = mix(iris, u_pupilColor, pupil);
      float highlight = pow(max(dot(N, -D), 0.0), 4.0);
      col += vec3(1.0,0.9,0.4) * highlight * 0.35;
      fragColor = vec4(col, 1.0);
    }`;
  }
  private getEyeProgramLocations(): void {
    if (!this.gl || !this.eyeProgram) return; const gl = this.gl;
    this.eyeAttributes['position'] = gl.getAttribLocation(this.eyeProgram, 'a_position');
    this.eyeAttributes['normal'] = gl.getAttribLocation(this.eyeProgram, 'a_normal');
    this.eyeUniforms['modelMatrix'] = gl.getUniformLocation(this.eyeProgram, 'u_modelMatrix');
    this.eyeUniforms['viewMatrix'] = gl.getUniformLocation(this.eyeProgram, 'u_viewMatrix');
    this.eyeUniforms['projectionMatrix'] = gl.getUniformLocation(this.eyeProgram, 'u_projectionMatrix');
    this.eyeUniforms['eyeDir'] = gl.getUniformLocation(this.eyeProgram, 'u_eyeDir');
    this.eyeUniforms['time'] = gl.getUniformLocation(this.eyeProgram, 'u_time');
    this.eyeUniforms['irisColor'] = gl.getUniformLocation(this.eyeProgram, 'u_irisColor');
    this.eyeUniforms['pupilColor'] = gl.getUniformLocation(this.eyeProgram, 'u_pupilColor');
    this.eyeUniforms['pupilRadius'] = gl.getUniformLocation(this.eyeProgram, 'u_pupilRadius');
    this.eyeUniforms['shellFactor'] = gl.getUniformLocation(this.eyeProgram, 'u_shellFactor');
    this.eyeUniforms['eyelidOpen'] = gl.getUniformLocation(this.eyeProgram, 'u_eyelidOpen');
    this.eyeUniforms['scleraColor'] = gl.getUniformLocation(this.eyeProgram, 'u_scleraColor');
    this.eyeUniforms['bandEdge'] = gl.getUniformLocation(this.eyeProgram, 'u_bandEdge');
  }
  public useEyeProgram(): void { if (this.gl && this.eyeProgram) this.gl.useProgram(this.eyeProgram); }
  public setEyeMatrices(model: Float32Array, view: Float32Array, proj: Float32Array): void {
    if (!this.gl || !this.eyeProgram) return; const gl = this.gl;
    if (this.eyeUniforms['modelMatrix']) gl.uniformMatrix4fv(this.eyeUniforms['modelMatrix'], false, model);
    if (this.eyeUniforms['viewMatrix']) gl.uniformMatrix4fv(this.eyeUniforms['viewMatrix'], false, view);
    if (this.eyeUniforms['projectionMatrix']) gl.uniformMatrix4fv(this.eyeUniforms['projectionMatrix'], false, proj);
  }
  public setEyeParams(time:number, eyeDir: Float32Array, irisColor: Float32Array, pupilColor: Float32Array, pupilRadius:number, shellFactor:number, eyelidOpen:number, scleraColor: Float32Array, bandEdge:number): void {
    if (!this.gl || !this.eyeProgram) return; const gl = this.gl;
    if (this.eyeUniforms['time']) gl.uniform1f(this.eyeUniforms['time'], time);
    if (this.eyeUniforms['eyeDir']) gl.uniform3fv(this.eyeUniforms['eyeDir'], eyeDir);
    if (this.eyeUniforms['irisColor']) gl.uniform3fv(this.eyeUniforms['irisColor'], irisColor);
    if (this.eyeUniforms['pupilColor']) gl.uniform3fv(this.eyeUniforms['pupilColor'], pupilColor);
    if (this.eyeUniforms['pupilRadius']) gl.uniform1f(this.eyeUniforms['pupilRadius'], pupilRadius);
    if (this.eyeUniforms['shellFactor']) gl.uniform1f(this.eyeUniforms['shellFactor'], shellFactor);
    if (this.eyeUniforms['eyelidOpen']) gl.uniform1f(this.eyeUniforms['eyelidOpen'], eyelidOpen);
    if (this.eyeUniforms['scleraColor']) gl.uniform3fv(this.eyeUniforms['scleraColor'], scleraColor);
    if (this.eyeUniforms['bandEdge']) gl.uniform1f(this.eyeUniforms['bandEdge'], bandEdge);
  }

  // ===== Flame billboard shader =====
  private getFlameVertexShader(): string {
    return `#version 300 es
    precision highp float;
    in vec3 a_position;
    in vec2 a_uv;
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    out vec2 v_uv;
    void main(){
      vec4 world = u_modelMatrix * vec4(a_position,1.0);
      gl_Position = u_projectionMatrix * (u_viewMatrix * world);
      v_uv = a_uv;
    }`;
  }
  private getFlameFragmentShader(): string {
    return `#version 300 es
    precision highp float;
    in vec2 v_uv; // expect uv in [0,1]
    out vec4 fragColor;
    uniform float u_time;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3,289.1))) * 12541.534); }
    float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); float a=hash(i); float b=hash(i+vec2(1,0)); float c=hash(i+vec2(0,1)); float d=hash(i+vec2(1,1)); vec2 u=f*f*(3.0-2.0*f); return mix(a,b,u.x)+ (c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y; }
    float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.11; a*=0.55; } return v; }
    void main(){
      float t = u_time*1.8;
      // Remap UV for flame (y upward)
      float y = v_uv.y;
      float x = (v_uv.x - 0.5);
      // Turbulence
      float n = fbm(vec2(x*6.0, y*8.0 - t));
      float core = smoothstep(0.15, 0.02, abs(x) + (1.0-y)*0.3);
      float rise = smoothstep(0.0, 1.0, y) * (1.0 - smoothstep(0.6 + n*0.2, 0.95, y));
      float shape = core * rise;
      float flicker = 0.85 + 0.25*noise(vec2(t*0.3, y*5.0));
      vec3 base = mix(vec3(1.0,0.55,0.05), vec3(1.0,0.9,0.4), smoothstep(0.0,1.0,y));
      vec3 col = base * (0.4 + 0.6*flicker) * shape;
      float alpha = shape * 0.9;
      if(alpha < 0.02) discard;
      fragColor = vec4(col, alpha);
    }`;
  }
  private getFlameProgramLocations(): void {
    if (!this.gl || !this.flameProgram) return; const gl = this.gl;
    this.flameAttributes['position'] = gl.getAttribLocation(this.flameProgram, 'a_position');
    this.flameAttributes['uv'] = gl.getAttribLocation(this.flameProgram, 'a_uv');
    this.flameUniforms['modelMatrix'] = gl.getUniformLocation(this.flameProgram, 'u_modelMatrix');
    this.flameUniforms['viewMatrix'] = gl.getUniformLocation(this.flameProgram, 'u_viewMatrix');
    this.flameUniforms['projectionMatrix'] = gl.getUniformLocation(this.flameProgram, 'u_projectionMatrix');
    this.flameUniforms['time'] = gl.getUniformLocation(this.flameProgram, 'u_time');
  }
  public useFlameProgram(): void { if (this.gl && this.flameProgram) this.gl.useProgram(this.flameProgram); }
  public setFlameMatrices(model: Float32Array, view: Float32Array, proj: Float32Array): void {
    if (!this.gl || !this.flameProgram) return; const gl = this.gl;
    if (this.flameUniforms['modelMatrix']) gl.uniformMatrix4fv(this.flameUniforms['modelMatrix'], false, model);
    if (this.flameUniforms['viewMatrix']) gl.uniformMatrix4fv(this.flameUniforms['viewMatrix'], false, view);
    if (this.flameUniforms['projectionMatrix']) gl.uniformMatrix4fv(this.flameUniforms['projectionMatrix'], false, proj);
  }
  public setFlameParams(time:number): void { if (!this.gl || !this.flameProgram) return; const gl=this.gl; if (this.flameUniforms['time']) gl.uniform1f(this.flameUniforms['time'], time); }
  private getPortalProgramLocations(): void {
    if (!this.gl || !this.portalProgram) return;
    const gl = this.gl;
    this.portalAttributes['position'] = gl.getAttribLocation(this.portalProgram, 'a_position');
    this.portalUniforms['modelMatrix'] = gl.getUniformLocation(this.portalProgram, 'u_modelMatrix');
    this.portalUniforms['viewMatrix'] = gl.getUniformLocation(this.portalProgram, 'u_viewMatrix');
    this.portalUniforms['projectionMatrix'] = gl.getUniformLocation(this.portalProgram, 'u_projectionMatrix');
    this.portalUniforms['time'] = gl.getUniformLocation(this.portalProgram, 'u_time');
    this.portalUniforms['colorOuter'] = gl.getUniformLocation(this.portalProgram, 'u_colorOuter');
    this.portalUniforms['colorInner'] = gl.getUniformLocation(this.portalProgram, 'u_colorInner');
    this.portalUniforms['ringInner'] = gl.getUniformLocation(this.portalProgram, 'u_ringInner');
    this.portalUniforms['ringOuter'] = gl.getUniformLocation(this.portalProgram, 'u_ringOuter');
    this.portalUniforms['pentColor'] = gl.getUniformLocation(this.portalProgram, 'u_pentColor');
    this.portalUniforms['eyeDir'] = gl.getUniformLocation(this.portalProgram, 'u_eyeDir');
    this.portalUniforms['eyeRadius'] = gl.getUniformLocation(this.portalProgram, 'u_eyeRadius');
  }
  public usePortalProgram(): void { if (this.gl && this.portalProgram) this.gl.useProgram(this.portalProgram); }
  public setPortalMatrices(model: Float32Array, view: Float32Array, proj: Float32Array): void {
    if (!this.gl || !this.portalProgram) return; const gl = this.gl;
    if (this.portalUniforms['modelMatrix']) gl.uniformMatrix4fv(this.portalUniforms['modelMatrix'], false, model);
    if (this.portalUniforms['viewMatrix']) gl.uniformMatrix4fv(this.portalUniforms['viewMatrix'], false, view);
    if (this.portalUniforms['projectionMatrix']) gl.uniformMatrix4fv(this.portalUniforms['projectionMatrix'], false, proj);
  }
  public setPortalParams(time:number, colorOuter: Float32Array, colorInner: Float32Array, ringInner:number, ringOuter:number, pentColor: Float32Array, eyeDir: Float32Array, eyeRadius:number): void {
    if (!this.gl || !this.portalProgram) return; const gl = this.gl;
    if (this.portalUniforms['time']) gl.uniform1f(this.portalUniforms['time'], time);
    if (this.portalUniforms['colorOuter']) gl.uniform3fv(this.portalUniforms['colorOuter'], colorOuter);
    if (this.portalUniforms['colorInner']) gl.uniform3fv(this.portalUniforms['colorInner'], colorInner);
    if (this.portalUniforms['ringInner']) gl.uniform1f(this.portalUniforms['ringInner'], ringInner);
    if (this.portalUniforms['ringOuter']) gl.uniform1f(this.portalUniforms['ringOuter'], ringOuter);
    if (this.portalUniforms['pentColor']) gl.uniform3fv(this.portalUniforms['pentColor'], pentColor);
    if (this.portalUniforms['eyeDir']) gl.uniform3fv(this.portalUniforms['eyeDir'], eyeDir);
    if (this.portalUniforms['eyeRadius']) gl.uniform1f(this.portalUniforms['eyeRadius'], eyeRadius);
  }

  /**
   * Vertex shader básico
   */
  private getBasicVertexShader(): string {
    return `#version 300 es
    precision highp float;

    // Atributos de entrada
    in vec3 a_position;
    in vec3 a_color;

    // Uniformes
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;

    // Salidas al fragment shader
    out vec3 v_color;

    void main() {
      // Transformar posición
      vec4 worldPosition = u_modelMatrix * vec4(a_position, 1.0);
      vec4 viewPosition = u_viewMatrix * worldPosition;
      gl_Position = u_projectionMatrix * viewPosition;

      // Pasar color al fragment shader
      v_color = a_color;
    }`;
  }

  /**
   * Fragment shader básico
   */
  private getBasicFragmentShader(): string {
    return `#version 300 es
    precision highp float;

    // Entradas del vertex shader
    in vec3 v_color;

    // Salida
    out vec4 fragColor;

    void main() {
      fragColor = vec4(v_color, 1.0);
    }`;
  }

  /**
   * Vertex shader con iluminación
   */
  private getLitVertexShader(): string {
    return `#version 300 es
    precision highp float;

    // Atributos de entrada
    in vec3 a_position;
    in vec3 a_normal;
    in vec3 a_color;

    // Uniformes de transformación
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform mat4 u_normalMatrix;

  // Uniformes de iluminación
    uniform vec3 u_lightDirection;
    uniform vec3 u_lightColor;
    uniform vec3 u_ambientColor;

    // Salidas al fragment shader
    out vec3 v_color;
    out vec3 v_normal;
    out vec3 v_lightDirection;
    out float v_lightIntensity;
  out vec3 v_worldPos;

    void main() {
  // Transformar posición
  vec4 worldPosition = u_modelMatrix * vec4(a_position, 1.0);
      vec4 viewPosition = u_viewMatrix * worldPosition;
      gl_Position = u_projectionMatrix * viewPosition;

      // Transformar normal con fallback si a_normal es (0,0,0) por atributos no vinculados
      vec3 inNormal = a_normal;
      if (length(inNormal) < 0.0001) {
        // Fallback: normal por defecto en espacio objeto
        inNormal = vec3(0.0, 0.0, 1.0);
      }
      vec3 worldNormal = normalize((u_normalMatrix * vec4(inNormal, 0.0)).xyz);

      // Calcular iluminación básica
      float lightDot = max(dot(worldNormal, -u_lightDirection), 0.0);
      v_lightIntensity = lightDot;

      // Pasar datos al fragment shader
      v_color = a_color;
      v_normal = worldNormal;
      v_lightDirection = u_lightDirection;
      v_worldPos = worldPosition.xyz;
    }`;
  }

  // Instanced-lit shaders are supplied by the service; no embedded sources here

  /**
   * Fragment shader con iluminación
   */
  private getLitFragmentShader(): string {
    return `#version 300 es
    precision highp float;

    // Entradas del vertex shader
    in vec3 v_color;
    in vec3 v_normal;
    in vec3 v_lightDirection;
    in float v_lightIntensity;
    in vec3 v_worldPos;

    // Uniformes
    uniform vec3 u_lightColor;
    uniform vec3 u_ambientColor;
    uniform float u_ambientStrength;
    uniform vec3 u_baseColor;
    uniform float u_opacity;
    uniform vec3 u_cameraPos;
    uniform float u_specularStrength;
    uniform float u_shininess;
    // Emissive point light (optional)
    uniform vec3 u_pointPos;
    uniform vec3 u_pointColor;
    uniform float u_pointIntensity;
    uniform float u_pointRadius;
    uniform float u_twoSidedLighting;

    // Salida
    out vec4 fragColor;

    void main() {
      // Componente ambiental
      vec3 ambient = u_ambientStrength * u_ambientColor;

  // Componente difusa
  vec3 diffuse = v_lightIntensity * u_lightColor;

      // Usar u_baseColor como color base
      vec3 baseColor = u_baseColor;

  // Especular (Blinn-Phong): N.H con H = normalize(L + V)
  vec3 N = normalize(v_normal);
  vec3 L = normalize(-v_lightDirection);
  vec3 V = normalize(u_cameraPos - v_worldPos);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), max(u_shininess, 1.0)) * u_specularStrength;
  vec3 specular = spec * u_lightColor;

  // Emissive point light contribution (attenuated)
  vec3 pointLit = vec3(0.0);
  if (u_pointIntensity > 0.0001 && u_pointRadius > 0.0) {
    vec3 toL = u_pointPos - v_worldPos;
    float d = length(toL);
    float atten = 1.0 - smoothstep(0.0, u_pointRadius, d);
    vec3 Lp = normalize(toL);
    float ndl = u_twoSidedLighting > 0.5 ? abs(dot(N, Lp)) : max(dot(N, Lp), 0.0);
    pointLit = u_pointColor * (u_pointIntensity * atten) * ndl;
  }

  // Color final
  vec3 finalColor = baseColor * (ambient + diffuse) + specular + pointLit;

      // Asegurar que el color no sea demasiado oscuro
      finalColor = max(finalColor, baseColor * 0.2);

  // Dark-to-normal during fade: when opacity < 1, reduce brightness strongly to avoid washing background
  float opacity = clamp(u_opacity, 0.0, 1.0);
  float brightness = max(0.05, pow(opacity, 2.2));
      finalColor *= brightness;
      // Color-only fade: keep alpha at 1.0 to avoid background washout
      fragColor = vec4(finalColor, 1.0);
    }`;
  }

  /**
   * Vertex shader texturizado con iluminación
   */
  private getTexturedVertexShader(): string {
    return `#version 300 es
    precision highp float;

    // Atributos de entrada
    in vec3 a_position;
    in vec3 a_normal;
    in vec2 a_uv;

    // Uniformes de transformación
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform mat4 u_normalMatrix;

    // Uniformes de iluminación
    uniform vec3 u_lightDirection;
    uniform vec3 u_lightColor;
    uniform vec3 u_ambientColor;
    uniform vec3 u_baseColor;

    // Salidas al fragment shader
    out vec2 v_uv;
    out vec3 v_normal;
    out vec3 v_worldPos;
    out float v_lightIntensity;

    void main() {
      // Transformar posición
      vec4 worldPosition = u_modelMatrix * vec4(a_position, 1.0);
      vec4 viewPosition = u_viewMatrix * worldPosition;
      gl_Position = u_projectionMatrix * viewPosition;

      // Transformar normal
      vec3 worldNormal = normalize((u_normalMatrix * vec4(a_normal, 0.0)).xyz);

      // Calcular iluminación básica
      float lightDot = max(dot(worldNormal, -u_lightDirection), 0.0);
      v_lightIntensity = lightDot;

      // Pasar datos al fragment shader
      v_uv = a_uv;
      v_normal = worldNormal;
      v_worldPos = worldPosition.xyz;
    }`;
  }

  /**
   * Fragment shader texturizado con iluminación y gradiente vertical
   */
  private getTexturedFragmentShader(): string {
    return `#version 300 es
    precision highp float;

    // Entradas del vertex shader
    in vec2 v_uv;
    in vec3 v_normal;
    in vec3 v_worldPos;
    in float v_lightIntensity;

  // Uniformes
    uniform sampler2D u_metallicTexture;
    uniform sampler2D u_gradientTexture;
    uniform vec3 u_lightColor;
    uniform vec3 u_ambientColor;
    uniform float u_ambientStrength;
  uniform vec3 u_baseColor;
  // Emissive point light (optional)
  uniform vec3 u_pointPos;
  uniform vec3 u_pointColor;
  uniform float u_pointIntensity;
  uniform float u_pointRadius;
  uniform float u_twoSidedLighting;

    // Salida
    out vec4 fragColor;

    void main() {
      // Muestrear textura metálica
      vec3 metallicColor = texture(u_metallicTexture, v_uv).rgb;
      
      // Gradiente vertical basado en la normal Y
      float verticalGradient = (v_normal.y + 1.0) * 0.5;
      verticalGradient = pow(verticalGradient, 2.0);
      
      vec3 baseMetallic = u_baseColor * metallicColor;
      vec3 darkMetallic = baseMetallic * 0.4;
      vec3 lightMetallic = baseMetallic * 1.2;
      vec3 gradientColor = mix(darkMetallic, lightMetallic, verticalGradient);
      
      vec3 ambient = u_ambientStrength * u_ambientColor;
      vec3 diffuse = v_lightIntensity * u_lightColor * 1.5;
      float specular = pow(max(v_lightIntensity, 0.0), 32.0) * 0.8;
      
      // Emissive point light contribution
      vec3 N = normalize(v_normal);
      vec3 pointLit = vec3(0.0);
      if (u_pointIntensity > 0.0001 && u_pointRadius > 0.0) {
        vec3 toL = u_pointPos - v_worldPos;
        float d = length(toL);
        float atten = 1.0 - smoothstep(0.0, u_pointRadius, d);
        vec3 Lp = normalize(toL);
        float ndl = u_twoSidedLighting > 0.5 ? abs(dot(N, Lp)) : max(dot(N, Lp), 0.0);
        pointLit = u_pointColor * (u_pointIntensity * atten) * ndl;
      }
      
      vec3 finalColor = gradientColor * (ambient + diffuse) + vec3(specular) + pointLit;
      finalColor = clamp(finalColor, gradientColor * 0.3, gradientColor * 2.0);
      fragColor = vec4(finalColor, 1.0);
    }`;
  }

  // Adapter API expected by InstancedAsteroidRenderer
  public get instancedLitProgram(): WebGLProgram | null { return this.instancedLitSvc?.program ?? null; }
  public get instancedLitAttributes(): { [key: string]: number } { return this.instancedLitSvc?.attributes ?? {}; }
  public useInstancedLitProgram(): void { this.instancedLitSvc?.useProgram(); }
  public setInstancedMatrices(viewMatrix: Float32Array, projectionMatrix: Float32Array): void { this.instancedLitSvc?.setMatrices(viewMatrix, projectionMatrix); }
  public setInstancedLighting(lightDirection: Float32Array, lightColor: Float32Array, ambientColor: Float32Array, ambientStrength: number): void { this.instancedLitSvc?.setLighting(lightDirection, lightColor, ambientColor, ambientStrength); }
  public setInstancedBaseColor(color: Float32Array): void { this.instancedLitSvc?.setBaseColor(color); }

  /**
   * Crea un programa de shader
   */
  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
    if (!this.gl) return null;

    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentSource);

    if (!vertexShader || !fragmentShader) return null;

    const program = this.gl.createProgram();
    if (!program) return null;

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    // Verificar que el programa se vinculó correctamente
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
  GameLogger.error(LogCategory.SHADERS, 'Shader program link error', { info: this.gl.getProgramInfoLog(program) });
      this.gl.deleteProgram(program);
      return null;
    }

    // Limpiar shaders (ya no son necesarios)
    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);

    return program;
  }

  /**
   * Compila un shader
   */
  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;

    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    // Verificar que el shader se compiló correctamente
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
  GameLogger.error(LogCategory.SHADERS, 'Shader compilation error', { info: this.gl.getShaderInfoLog(shader) });
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Obtiene ubicaciones para el programa básico
   */
  private getBasicProgramLocations(): void {
    if (!this.gl || !this.basicProgram) return;

    // Atributos
    this.basicAttributes['position'] = this.gl.getAttribLocation(this.basicProgram, 'a_position');
    this.basicAttributes['color'] = this.gl.getAttribLocation(this.basicProgram, 'a_color');

    // Uniformes
    this.basicUniforms['modelMatrix'] = this.gl.getUniformLocation(this.basicProgram, 'u_modelMatrix');
    this.basicUniforms['viewMatrix'] = this.gl.getUniformLocation(this.basicProgram, 'u_viewMatrix');
    this.basicUniforms['projectionMatrix'] = this.gl.getUniformLocation(this.basicProgram, 'u_projectionMatrix');
  }

  /**
   * Obtiene ubicaciones para el programa con iluminación
   */
  private getLitProgramLocations(): void {
    if (!this.gl || !this.litProgram) return;

    // Atributos
    this.litAttributes['position'] = this.gl.getAttribLocation(this.litProgram, 'a_position');
    this.litAttributes['normal'] = this.gl.getAttribLocation(this.litProgram, 'a_normal');
    this.litAttributes['color'] = this.gl.getAttribLocation(this.litProgram, 'a_color');

    // Uniformes de transformación
    this.litUniforms['modelMatrix'] = this.gl.getUniformLocation(this.litProgram, 'u_modelMatrix');
    this.litUniforms['viewMatrix'] = this.gl.getUniformLocation(this.litProgram, 'u_viewMatrix');
    this.litUniforms['projectionMatrix'] = this.gl.getUniformLocation(this.litProgram, 'u_projectionMatrix');
    this.litUniforms['normalMatrix'] = this.gl.getUniformLocation(this.litProgram, 'u_normalMatrix');

    // Uniformes de iluminación
    this.litUniforms['lightDirection'] = this.gl.getUniformLocation(this.litProgram, 'u_lightDirection');
    this.litUniforms['lightColor'] = this.gl.getUniformLocation(this.litProgram, 'u_lightColor');
    this.litUniforms['ambientColor'] = this.gl.getUniformLocation(this.litProgram, 'u_ambientColor');
    this.litUniforms['ambientStrength'] = this.gl.getUniformLocation(this.litProgram, 'u_ambientStrength');
    this.litUniforms['baseColor'] = this.gl.getUniformLocation(this.litProgram, 'u_baseColor');
    this.litUniforms['opacity'] = this.gl.getUniformLocation(this.litProgram, 'u_opacity');
    this.litUniforms['cameraPos'] = this.gl.getUniformLocation(this.litProgram, 'u_cameraPos');
    this.litUniforms['specularStrength'] = this.gl.getUniformLocation(this.litProgram, 'u_specularStrength');
  this.litUniforms['shininess'] = this.gl.getUniformLocation(this.litProgram, 'u_shininess');
  // Point light uniforms
  this.litUniforms['pointPos'] = this.gl.getUniformLocation(this.litProgram, 'u_pointPos');
  this.litUniforms['pointColor'] = this.gl.getUniformLocation(this.litProgram, 'u_pointColor');
  this.litUniforms['pointIntensity'] = this.gl.getUniformLocation(this.litProgram, 'u_pointIntensity');
  this.litUniforms['pointRadius'] = this.gl.getUniformLocation(this.litProgram, 'u_pointRadius');
  this.litUniforms['twoSidedLighting'] = this.gl.getUniformLocation(this.litProgram, 'u_twoSidedLighting');
  }

  /**
   * Obtiene ubicaciones para el programa texturizado
   */
  private getTexturedProgramLocations(): void {
    if (!this.gl || !this.texturedProgram) return;

    // Atributos
    this.texturedAttributes['position'] = this.gl.getAttribLocation(this.texturedProgram, 'a_position');
    this.texturedAttributes['normal'] = this.gl.getAttribLocation(this.texturedProgram, 'a_normal');
    this.texturedAttributes['uv'] = this.gl.getAttribLocation(this.texturedProgram, 'a_uv');

    // Uniformes de transformación
    this.texturedUniforms['modelMatrix'] = this.gl.getUniformLocation(this.texturedProgram, 'u_modelMatrix');
    this.texturedUniforms['viewMatrix'] = this.gl.getUniformLocation(this.texturedProgram, 'u_viewMatrix');
    this.texturedUniforms['projectionMatrix'] = this.gl.getUniformLocation(this.texturedProgram, 'u_projectionMatrix');
    this.texturedUniforms['normalMatrix'] = this.gl.getUniformLocation(this.texturedProgram, 'u_normalMatrix');

    // Uniformes de iluminación
    this.texturedUniforms['lightDirection'] = this.gl.getUniformLocation(this.texturedProgram, 'u_lightDirection');
    this.texturedUniforms['lightColor'] = this.gl.getUniformLocation(this.texturedProgram, 'u_lightColor');
    this.texturedUniforms['ambientColor'] = this.gl.getUniformLocation(this.texturedProgram, 'u_ambientColor');
    this.texturedUniforms['ambientStrength'] = this.gl.getUniformLocation(this.texturedProgram, 'u_ambientStrength');
  this.texturedUniforms['baseColor'] = this.gl.getUniformLocation(this.texturedProgram, 'u_baseColor');
  // Point light uniforms
  this.texturedUniforms['pointPos'] = this.gl.getUniformLocation(this.texturedProgram, 'u_pointPos');
  this.texturedUniforms['pointColor'] = this.gl.getUniformLocation(this.texturedProgram, 'u_pointColor');
  this.texturedUniforms['pointIntensity'] = this.gl.getUniformLocation(this.texturedProgram, 'u_pointIntensity');
  this.texturedUniforms['pointRadius'] = this.gl.getUniformLocation(this.texturedProgram, 'u_pointRadius');
  this.texturedUniforms['twoSidedLighting'] = this.gl.getUniformLocation(this.texturedProgram, 'u_twoSidedLighting');

    // Uniformes de textura
    this.texturedUniforms['metallicTexture'] = this.gl.getUniformLocation(this.texturedProgram, 'u_metallicTexture');
    this.texturedUniforms['gradientTexture'] = this.gl.getUniformLocation(this.texturedProgram, 'u_gradientTexture');
  }

  /**
   * Usa el programa básico
   */
  public useBasicProgram(): void {
    if (!this.gl || !this.basicProgram) return;
    this.gl.useProgram(this.basicProgram);
  }

  /**
   * Usa el programa con iluminación
   */
  public useLitProgram(): void {
    if (!this.gl || !this.litProgram) return;
    this.gl.useProgram(this.litProgram);
    // Asegurar opacidad por defecto a 1.0
    const loc = this.litUniforms['opacity'];
    if (loc) this.gl.uniform1f(loc, 1.0);
  }

  /**
   * Establece las matrices para el programa básico
   */
  public setBasicMatrices(modelMatrix: Float32Array, viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    if (!this.gl || !this.basicProgram) return;

    this.gl.uniformMatrix4fv(this.basicUniforms['modelMatrix'], false, modelMatrix);
    this.gl.uniformMatrix4fv(this.basicUniforms['viewMatrix'], false, viewMatrix);
    this.gl.uniformMatrix4fv(this.basicUniforms['projectionMatrix'], false, projectionMatrix);
  }

  /**
   * Establece las matrices para el programa con iluminación
   */
  public setLitMatrices(
    modelMatrix: Float32Array, 
    viewMatrix: Float32Array, 
    projectionMatrix: Float32Array, 
    normalMatrix: Float32Array
  ): void {
    if (!this.gl || !this.litProgram) return;

    this.gl.uniformMatrix4fv(this.litUniforms['modelMatrix'], false, modelMatrix);
    this.gl.uniformMatrix4fv(this.litUniforms['viewMatrix'], false, viewMatrix);
    this.gl.uniformMatrix4fv(this.litUniforms['projectionMatrix'], false, projectionMatrix);
    this.gl.uniformMatrix4fv(this.litUniforms['normalMatrix'], false, normalMatrix);
  }

  /**
   * Establece la configuración de iluminación
   */
  public setLighting(
    lightDirection: Float32Array, 
    lightColor: Float32Array, 
    ambientColor: Float32Array, 
    ambientStrength: number
  ): void {
    if (!this.gl || !this.litProgram) return;

    this.gl.uniform3fv(this.litUniforms['lightDirection'], lightDirection);
    this.gl.uniform3fv(this.litUniforms['lightColor'], lightColor);
    this.gl.uniform3fv(this.litUniforms['ambientColor'], ambientColor);
    this.gl.uniform1f(this.litUniforms['ambientStrength'], ambientStrength);
  }

  /** Establece parámetros especulares y cámara para el shader lit */
  public setSpecular(cameraPos: Float32Array, specularStrength: number, shininess: number): void {
    if (!this.gl || !this.litProgram) return;
    this.gl.uniform3fv(this.litUniforms['cameraPos'], cameraPos);
    this.gl.uniform1f(this.litUniforms['specularStrength'], specularStrength);
    this.gl.uniform1f(this.litUniforms['shininess'], shininess);
  }

  /** Configura una luz puntual emisiva opcional para el shader lit */
  public setPointLightLit(pos: Float32Array, color: Float32Array, intensity: number, radius: number, twoSided: boolean): void {
    if (!this.gl || !this.litProgram) return;
    if (this.litUniforms['pointPos']) this.gl.uniform3fv(this.litUniforms['pointPos'], pos);
    if (this.litUniforms['pointColor']) this.gl.uniform3fv(this.litUniforms['pointColor'], color);
    if (this.litUniforms['pointIntensity']) this.gl.uniform1f(this.litUniforms['pointIntensity'], intensity);
    if (this.litUniforms['pointRadius']) this.gl.uniform1f(this.litUniforms['pointRadius'], radius);
    if (this.litUniforms['twoSidedLighting']) this.gl.uniform1f(this.litUniforms['twoSidedLighting'], twoSided ? 1.0 : 0.0);
  }

  /**
   * Establece el color base para el shader lit
   */
  public setLitColor(color: Float32Array): void {
    if (!this.gl || !this.litProgram) return;
    this.gl.uniform3fv(this.litUniforms['baseColor'], color);
  }

  /**
   * Establece la opacidad para el shader lit (no instanciado)
   */
  public setLitOpacity(alpha: number): void {
    if (!this.gl || !this.litProgram) return;
    const loc = this.litUniforms['opacity'];
    if (loc) this.gl.uniform1f(loc, alpha);
  }

  /**
   * Usa el programa texturizado
   */
  public useTexturedProgram(): void {
    if (!this.gl || !this.texturedProgram) return;
    this.gl.useProgram(this.texturedProgram);
  }

  /**
   * Establece las matrices para el programa texturizado
   */
  public setTexturedMatrices(
    modelMatrix: Float32Array, 
    viewMatrix: Float32Array, 
    projectionMatrix: Float32Array, 
    normalMatrix: Float32Array
  ): void {
    if (!this.gl || !this.texturedProgram) return;

    this.gl.uniformMatrix4fv(this.texturedUniforms['modelMatrix'], false, modelMatrix);
    this.gl.uniformMatrix4fv(this.texturedUniforms['viewMatrix'], false, viewMatrix);
    this.gl.uniformMatrix4fv(this.texturedUniforms['projectionMatrix'], false, projectionMatrix);
    this.gl.uniformMatrix4fv(this.texturedUniforms['normalMatrix'], false, normalMatrix);
  }

  /**
   * Establece la configuración de iluminación para programa texturizado
   */
  public setTexturedLighting(
    lightDirection: Float32Array, 
    lightColor: Float32Array, 
    ambientColor: Float32Array, 
    ambientStrength: number,
    baseColor: Float32Array
  ): void {
    if (!this.gl || !this.texturedProgram) return;

    this.gl.uniform3fv(this.texturedUniforms['lightDirection'], lightDirection);
    this.gl.uniform3fv(this.texturedUniforms['lightColor'], lightColor);
    this.gl.uniform3fv(this.texturedUniforms['ambientColor'], ambientColor);
    this.gl.uniform1f(this.texturedUniforms['ambientStrength'], ambientStrength);
    this.gl.uniform3fv(this.texturedUniforms['baseColor'], baseColor);
  }

  /** Configura una luz puntual emisiva opcional para el shader texturizado */
  public setPointLightTextured(pos: Float32Array, color: Float32Array, intensity: number, radius: number, twoSided: boolean): void {
    if (!this.gl || !this.texturedProgram) return;
    if (this.texturedUniforms['pointPos']) this.gl.uniform3fv(this.texturedUniforms['pointPos'], pos);
    if (this.texturedUniforms['pointColor']) this.gl.uniform3fv(this.texturedUniforms['pointColor'], color);
    if (this.texturedUniforms['pointIntensity']) this.gl.uniform1f(this.texturedUniforms['pointIntensity'], intensity);
    if (this.texturedUniforms['pointRadius']) this.gl.uniform1f(this.texturedUniforms['pointRadius'], radius);
    if (this.texturedUniforms['twoSidedLighting']) this.gl.uniform1f(this.texturedUniforms['twoSidedLighting'], twoSided ? 1.0 : 0.0);
  }

  /**
   * Configura las texturas para el programa texturizado
   */
  public setTexturedTextures(metallicTexture: WebGLTexture, gradientTexture: WebGLTexture): void {
    if (!this.gl || !this.texturedProgram) return;

    // Activar y vincular textura metálica en slot 0
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, metallicTexture);
    this.gl.uniform1i(this.texturedUniforms['metallicTexture'], 0);

    // Activar y vincular textura de gradiente en slot 1
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, gradientTexture);
    this.gl.uniform1i(this.texturedUniforms['gradientTexture'], 1);
  }

  /**
   * Verifica si los shaders están listos
   */
  public isReady(): boolean {
    return this.basicProgram !== null && this.litProgram !== null && this.texturedProgram !== null && !!this.hudProgram;
  }

  /**
   * Limpia recursos
   */
  public cleanup(): void {
    if (!this.gl) return;

    if (this.basicProgram) {
      this.gl.deleteProgram(this.basicProgram);
      this.basicProgram = null;
    }

    if (this.litProgram) {
      this.gl.deleteProgram(this.litProgram);
      this.litProgram = null;
    }

    if (this.texturedProgram) {
      this.gl.deleteProgram(this.texturedProgram);
      this.texturedProgram = null;
    }

    // Modular services cleanup
    this.hudSvc?.cleanup(); this.hudSvc = null;
    this.reticleSvc?.cleanup(); this.reticleSvc = null;
    this.outlineSvc?.cleanup(); this.outlineSvc = null;
  }

  /**
   * Obtener ubicaciones de uniformes y atributos para programa HUD
   */
  private getHUDProgramLocations(): void {
    if (!this.gl || !this.hudProgram) return;

    // Atributos
    this.hudAttributes['position'] = this.gl.getAttribLocation(this.hudProgram, 'a_position');
    this.hudAttributes['uv'] = this.gl.getAttribLocation(this.hudProgram, 'a_uv');

    // Uniformes de matrices
    this.hudUniforms['modelMatrix'] = this.gl.getUniformLocation(this.hudProgram, 'u_modelMatrix');
    this.hudUniforms['viewMatrix'] = this.gl.getUniformLocation(this.hudProgram, 'u_viewMatrix');
    this.hudUniforms['projectionMatrix'] = this.gl.getUniformLocation(this.hudProgram, 'u_projectionMatrix');
    
    // Uniformes de textura
    this.hudUniforms['texture'] = this.gl.getUniformLocation(this.hudProgram, 'u_texture');
    this.hudUniforms['opacity'] = this.gl.getUniformLocation(this.hudProgram, 'u_opacity');

    GameLogger.info(LogCategory.SHADERS, 'HUD shader initialized', {
      attributes: Object.keys(this.hudAttributes).length,
      uniforms: Object.keys(this.hudUniforms).length
    });
  }

  /**
   * Obtener ubicaciones de uniformes y atributos para programa retícula
   */
  private getReticleProgramLocations(): void {
    if (!this.gl || !this.reticleProgram) return;

    // Atributos
    this.reticleAttributes['position'] = this.gl.getAttribLocation(this.reticleProgram, 'a_position');

    // Uniformes de matrices
    this.reticleUniforms['modelMatrix'] = this.gl.getUniformLocation(this.reticleProgram, 'u_modelMatrix');
    this.reticleUniforms['viewMatrix'] = this.gl.getUniformLocation(this.reticleProgram, 'u_viewMatrix');
    this.reticleUniforms['projectionMatrix'] = this.gl.getUniformLocation(this.reticleProgram, 'u_projectionMatrix');
    
    // Uniformes de color
    this.reticleUniforms['color'] = this.gl.getUniformLocation(this.reticleProgram, 'u_color');
    this.reticleUniforms['opacity'] = this.gl.getUniformLocation(this.reticleProgram, 'u_opacity');

    GameLogger.info(LogCategory.SHADERS, 'Reticle shader initialized', {
      attributes: Object.keys(this.reticleAttributes).length,
      uniforms: Object.keys(this.reticleUniforms).length
    });
  }

  /**
   * Obtener ubicaciones de uniformes y atributos para programa outline
   */
  private getOutlineProgramLocations(): void {
    if (!this.gl || !this.outlineProgram) return;

    // Atributos
    this.outlineAttributes['position'] = this.gl.getAttribLocation(this.outlineProgram, 'a_position');
    this.outlineAttributes['uv'] = this.gl.getAttribLocation(this.outlineProgram, 'a_uv');

    // Uniformes
  this.outlineUniforms['colorTexture'] = this.gl.getUniformLocation(this.outlineProgram, 'u_colorTexture');
  this.outlineUniforms['resolution'] = this.gl.getUniformLocation(this.outlineProgram, 'u_resolution');
  this.outlineUniforms['time'] = this.gl.getUniformLocation(this.outlineProgram, 'u_time');
  // Symmetry: expose outline color uniform too
  this.outlineUniforms['outlineColor'] = this.gl.getUniformLocation(this.outlineProgram, 'u_outlineColor');

    GameLogger.info(LogCategory.SHADERS, 'Outline shader initialized', {
      attributes: Object.keys(this.outlineAttributes).length,
      uniforms: Object.keys(this.outlineUniforms).length
    });
  }

  // Back-compat getters to keep existing consumers working
  public get hudProgram(): WebGLProgram | null { return this.hudSvc?.program ?? null; }
  public get reticleProgram(): WebGLProgram | null { return this.reticleSvc?.program ?? null; }
  public get outlineProgram(): WebGLProgram | null { return this.outlineSvc?.program ?? null; }
}