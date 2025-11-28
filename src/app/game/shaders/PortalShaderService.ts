import { WebGLService } from '../../services/webgl.service';
import { ShaderManager } from '../ShaderManager';
import { Portal } from '../game-objects/Portal';

/**
 * PortalShaderService
 * Encapsula el uso de los shaders relacionados con el Portal (halo/runas, ojo, llama),
 * delegando la compilación/ubicaciones en ShaderManager y exponiendo una API clara.
 */
export class PortalShaderService {
  private gl: WebGL2RenderingContext | null = null;
  // Programa simple para pentáculo (líneas)
  private pentacleProgram: WebGLProgram | null = null;
  private pentacleAttribs: { [k: string]: number } = {};
  private pentacleUniforms: { [k: string]: WebGLUniformLocation | null } = {};
  // Círculo circunscrito (buffer estático)
  private circleVBO: WebGLBuffer | null = null;
  private circleCount: number = 0;
  // Círculo grueso (anillo) como TRIANGLE_STRIP
  private circleRingVBO: WebGLBuffer | null = null;
  private circleRingCount: number = 0;
  // Pentáculo grueso como TRIANGLES
  private pentacleThickVBO: WebGLBuffer | null = null;
  private pentacleThickCount: number = 0;
  // Pentágono interior (textura de galaxia)
  private innerPentagonVBO: WebGLBuffer | null = null;
  private innerPentagonUVBO: WebGLBuffer | null = null;
  private innerPentagonCount: number = 0;
  // Programa para pentágono con shader procedural de galaxia
  private galaxyProgram: WebGLProgram | null = null;
  private galaxyAttribs: { [k: string]: number } = {};
  private galaxyUniforms: { [k: string]: WebGLUniformLocation | null } = {};
  constructor(private webgl: WebGLService, private shaders: ShaderManager) {
    this.gl = this.webgl.getContext() as WebGL2RenderingContext | null;
  }

  /** Inicializa recursos auxiliares (pentáculo) */
  public initialize(): void {
    const gl = this.gl;
    if (!gl) return;
    // Compilar shader para líneas del pentáculo (color + pulsación)
    const vsSrc = `#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 a_pos;\nuniform mat4 u_modelMatrix;\nuniform mat4 u_viewMatrix;\nuniform mat4 u_projectionMatrix;\nvoid main(){\n  vec4 world = u_modelMatrix * vec4(a_pos,1.0);\n  gl_Position = u_projectionMatrix * (u_viewMatrix * world);\n}`;
    const fsSrc = `#version 300 es\nprecision highp float;\nout vec4 fragColor;\nuniform float u_time;\nuniform vec3 u_color;\nvoid main(){\n  float pulse = 0.55 + 0.45 * (0.5 + 0.5 * sin(u_time * 3.2));\n  fragColor = vec4(u_color * pulse, 1.0);\n}`;
    const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
    const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl.deleteProgram(prog); return; }
    this.pentacleProgram = prog;
    this.pentacleAttribs['position'] = gl.getAttribLocation(prog, 'a_pos');
    this.pentacleUniforms['modelMatrix'] = gl.getUniformLocation(prog, 'u_modelMatrix');
    this.pentacleUniforms['viewMatrix'] = gl.getUniformLocation(prog, 'u_viewMatrix');
    this.pentacleUniforms['projectionMatrix'] = gl.getUniformLocation(prog, 'u_projectionMatrix');
    this.pentacleUniforms['time'] = gl.getUniformLocation(prog, 'u_time');
    this.pentacleUniforms['color'] = gl.getUniformLocation(prog, 'u_color');

    // Compilar shader para pentágono interior con efecto procedural de galaxia
    const galaxyVS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
out vec2 v_uv;
void main(){
  vec4 world = u_modelMatrix * vec4(a_pos,1.0);
  gl_Position = u_projectionMatrix * (u_viewMatrix * world);
  v_uv = a_uv;
}`;
    const galaxyFS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform float u_time;

// Hash function para pseudo-random
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Noise simplex 2D básico
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f); // smoothstep
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// FBM (Fractal Brownian Motion)
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for(int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main(){
  vec2 uv = v_uv * 2.0 - 1.0; // centrar [-1,1]
  float dist = length(uv);
  
  // Fondo de nebulosa (usando FBM para textura orgánica)
  vec2 nebula_uv = v_uv * 3.0 + u_time * 0.05;
  float nebula = fbm(nebula_uv);
  
  // Estrellas (puntos brillantes aleatorios)
  vec2 star_uv = v_uv * 20.0;
  float stars = 0.0;
  for(int i = 0; i < 8; i++) {
    vec2 offset = vec2(float(i) * 123.45, float(i) * 678.9);
    float star = hash(floor(star_uv + offset));
    if(star > 0.98) {
      vec2 local = fract(star_uv + offset) - 0.5;
      float starDist = length(local);
      stars += smoothstep(0.1, 0.0, starDist) * 0.8;
    }
  }
  
  // Bandas de energía fluctuantes (onduladas)
  float band1 = sin(v_uv.y * 10.0 + u_time * 2.0) * 0.5 + 0.5;
  float band2 = sin(v_uv.x * 8.0 - u_time * 1.5 + nebula * 2.0) * 0.5 + 0.5;
  float bands = (band1 * 0.4 + band2 * 0.3) * smoothstep(0.8, 0.2, dist);
  
  // Paleta de colores fantásticos (púrpuras, azules, cian arcano)
  vec3 color1 = vec3(0.2, 0.05, 0.4); // púrpura oscuro
  vec3 color2 = vec3(0.05, 0.15, 0.6); // azul profundo
  vec3 color3 = vec3(0.1, 0.5, 0.8); // cian arcano
  vec3 bandColor = vec3(0.4, 0.8, 1.0); // cian brillante para bandas
  
  // Mezclar nebulosa con colores
  vec3 nebulaColor = mix(color1, color2, nebula);
  nebulaColor = mix(nebulaColor, color3, fbm(v_uv * 5.0 - u_time * 0.03));
  
  // Combinar todos los elementos
  vec3 finalColor = nebulaColor * 0.6 + stars + bands * bandColor;
  
  // Viñeta suave en los bordes
  float vignette = smoothstep(1.0, 0.5, dist);
  finalColor *= vignette;
  
  fragColor = vec4(finalColor, 1.0);
}`;
    const galaxyVS_shader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(galaxyVS_shader, galaxyVS);
    gl.compileShader(galaxyVS_shader);
    const galaxyFS_shader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(galaxyFS_shader, galaxyFS);
    gl.compileShader(galaxyFS_shader);
    const galaxyProg = gl.createProgram()!;
    gl.attachShader(galaxyProg, galaxyVS_shader);
    gl.attachShader(galaxyProg, galaxyFS_shader);
    gl.linkProgram(galaxyProg);
    gl.deleteShader(galaxyVS_shader);
    gl.deleteShader(galaxyFS_shader);
    if (!gl.getProgramParameter(galaxyProg, gl.LINK_STATUS)) {
      console.error('Galaxy shader link failed:', gl.getProgramInfoLog(galaxyProg));
      gl.deleteProgram(galaxyProg);
    } else {
      this.galaxyProgram = galaxyProg;
      this.galaxyAttribs['position'] = gl.getAttribLocation(galaxyProg, 'a_pos');
      this.galaxyAttribs['uv'] = gl.getAttribLocation(galaxyProg, 'a_uv');
      this.galaxyUniforms['modelMatrix'] = gl.getUniformLocation(galaxyProg, 'u_modelMatrix');
      this.galaxyUniforms['viewMatrix'] = gl.getUniformLocation(galaxyProg, 'u_viewMatrix');
      this.galaxyUniforms['projectionMatrix'] = gl.getUniformLocation(galaxyProg, 'u_projectionMatrix');
      this.galaxyUniforms['time'] = gl.getUniformLocation(galaxyProg, 'u_time');
    }

    // Crear buffer de círculo unitario en plano XY (línea fina – legacy)
    const seg = 96;
    const verts: number[] = [];
    for (let i=0;i<seg;i++) {
      const a = (i/seg) * Math.PI * 2;
      verts.push(Math.cos(a), Math.sin(a), 0);
    }
    this.circleVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.circleVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    this.circleCount = seg;

    // Círculo grueso: anillo (outer R=1.0, inner R=1.0 - t)
  const t = 0.09; // grosor relativo del anillo (sin cambios respecto al diseño previo)
    const innerR = Math.max(0.0001, 1.0 - t);
    const ringVerts: number[] = [];
    for (let i=0;i<=seg;i++) { // <= para cerrar tira
      const a = (i/seg) * Math.PI * 2;
      const cx = Math.cos(a), sy = Math.sin(a);
      // Outer
      ringVerts.push(cx, sy, 0);
      // Inner
      ringVerts.push(cx * innerR, sy * innerR, 0);
    }
    this.circleRingVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.circleRingVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ringVerts), gl.STATIC_DRAW);
    this.circleRingCount = (seg + 1) * 2;

    // Pentáculo grueso: construir triángulos para cada segmento del orden 0-2-4-1-3-0
    const starR = 1.0;
    const starPts: Array<[number, number]> = [];
    for (let i=0;i<5;i++) {
      // Orientación corregida: una punta hacia ARRIBA en el espacio local del portal (Y+)
      const ang = (Math.PI/2) + i * 2*Math.PI/5;
      starPts.push([Math.cos(ang)*starR, Math.sin(ang)*starR]);
    }
    const order = [0,2,4,1,3,0];
  const halfW = 0.0175; // grosor relativo del trazo del pentáculo (mitad del valor previo)
    const triVerts: number[] = [];
    for (let i=0;i<order.length-1;i++) {
      const ia = order[i], ib = order[i+1];
      const ax = starPts[ia][0], ay = starPts[ia][1];
      const bx = starPts[ib][0], by = starPts[ib][1];
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy/len, ny = dx/len; // perpendicular
      const ox = nx * halfW, oy = ny * halfW;
      // Quad corners
      const a0x = ax - ox, a0y = ay - oy;
      const a1x = ax + ox, a1y = ay + oy;
      const b1x = bx + ox, b1y = by + oy;
      const b0x = bx - ox, b0y = by - oy;
      // Triangles (a0,a1,b1) and (a0,b1,b0)
      triVerts.push(a0x, a0y, 0,  a1x, a1y, 0,  b1x, b1y, 0);
      triVerts.push(a0x, a0y, 0,  b1x, b1y, 0,  b0x, b0y, 0);
    }
    this.pentacleThickVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pentacleThickVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(triVerts), gl.STATIC_DRAW);
    this.pentacleThickCount = triVerts.length / 3;

    // Pentágono interior: crear geometría rellena del pentágono central de la estrella
    // Usamos los puntos internos donde se cruzan las líneas de la estrella
    // El pentágono interior tiene un radio aproximado de 0.382 del radio de la estrella (golden ratio)
    // Reducido ligeramente para evitar overlap con el grosor de las líneas del pentáculo (halfW = 0.0175)
    const pentagonInnerR = 0.382 - 0.025; // radio ajustado para evitar flickering con las líneas
    const innerPentVerts: number[] = [];
    const innerPentUVs: number[] = [];
    const centerX = 0, centerY = 0;
    const pentZ = -0.001; // ligeramente detrás del pentáculo para evitar z-fighting
    // Generar los 5 vértices del pentágono interior
    const pentVerts: Array<[number, number]> = [];
    for (let i = 0; i < 5; i++) {
      // Flip vertical: restar PI para invertir la orientación
      const ang = (-Math.PI / 2) + i * 2 * Math.PI / 5;
      pentVerts.push([Math.cos(ang) * pentagonInnerR, Math.sin(ang) * pentagonInnerR]);
    }
    // Triangular desde el centro usando fan
    for (let i = 0; i < 5; i++) {
      const next = (i + 1) % 5;
      // Centro
      innerPentVerts.push(centerX, centerY, pentZ);
      innerPentUVs.push(0.5, 0.5); // UV centro
      // Vértice actual
      innerPentVerts.push(pentVerts[i][0], pentVerts[i][1], pentZ);
      innerPentUVs.push((pentVerts[i][0] / pentagonInnerR + 1.0) * 0.5, (pentVerts[i][1] / pentagonInnerR + 1.0) * 0.5);
      // Siguiente vértice
      innerPentVerts.push(pentVerts[next][0], pentVerts[next][1], pentZ);
      innerPentUVs.push((pentVerts[next][0] / pentagonInnerR + 1.0) * 0.5, (pentVerts[next][1] / pentagonInnerR + 1.0) * 0.5);
    }
    this.innerPentagonVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.innerPentagonVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(innerPentVerts), gl.STATIC_DRAW);
    this.innerPentagonUVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.innerPentagonUVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(innerPentUVs), gl.STATIC_DRAW);
    this.innerPentagonCount = innerPentVerts.length / 3;
  }

  /** Prepara el estado de mezcla/profundidad para efectos aditivos del portal. Devuelve estado previo. */
  public beginPortalBlend(): { blend: boolean; depth: boolean; depthMask: boolean; prevProgram: WebGLProgram | null } {
    const gl = this.gl!;
    const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const wasBlend = gl.isEnabled(gl.BLEND);
    const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    return { blend: wasBlend, depth: wasDepth, depthMask: prevDepthMask, prevProgram };
  }

  /** Restaura el estado de mezcla/profundidad anterior. */
  public endPortalBlend(state: { blend: boolean; depth: boolean; depthMask: boolean; prevProgram: WebGLProgram | null }): void {
    const gl = this.gl!;
    if (!state.blend) gl.disable(gl.BLEND);
    if (state.depth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    gl.depthMask(state.depthMask);
    if (state.prevProgram) gl.useProgram(state.prevProgram);
  }

  /** Configura y usa el shader de halo/runas del portal para un portal concreto. */
  // Halo desactivado: método conservado por compatibilidad pero sin dibujar.
  public useHaloShader(_portal: Portal, _view: Float32Array, _proj: Float32Array, _timeSec: number): void { /* halo removed */ }

  /** Dibuja el pentáculo grueso + círculo grueso en aditivo. */
  public renderPentacle(portal: Portal, view: Float32Array, proj: Float32Array, timeSec: number): void {
    const gl = this.gl;
    if (!gl || !this.pentacleProgram) return;

    // PRIMERO: Dibujar pentágono interior (fondo) si está manifestado
    if (portal.manifestTime >= 10.0 && this.innerPentagonVBO && this.innerPentagonCount > 0 && this.galaxyProgram) {
      // Fade-in suave durante 1s después de alcanzar manifestación completa
      const fadeTime = Math.min(1.0, portal.manifestTime - 10.0);
      const fadeAlpha = fadeTime; // 0 a 1 durante el primer segundo
      
      // Habilitar depth test para este elemento
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      
      // Cambiar a shader de galaxia
      gl.useProgram(this.galaxyProgram);
      const gUM = this.galaxyUniforms['modelMatrix'];
      if (gUM) gl.uniformMatrix4fv(gUM, false, portal.modelMatrix);
      const gUV = this.galaxyUniforms['viewMatrix'];
      if (gUV) gl.uniformMatrix4fv(gUV, false, view);
      const gUP = this.galaxyUniforms['projectionMatrix'];
      if (gUP) gl.uniformMatrix4fv(gUP, false, proj);
      const gUT = this.galaxyUniforms['time'];
      if (gUT) gl.uniform1f(gUT, timeSec);
      
      // Cambiar blend a opaco para el fondo
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      
      const gAPos = this.galaxyAttribs['position'];
      const gAUV = this.galaxyAttribs['uv'];
      if (gAPos >= 0 && gAUV >= 0) {
        // Bind position
        gl.bindBuffer(gl.ARRAY_BUFFER, this.innerPentagonVBO);
        gl.enableVertexAttribArray(gAPos);
        gl.vertexAttribPointer(gAPos, 3, gl.FLOAT, false, 0, 0);
        // Bind UV
        gl.bindBuffer(gl.ARRAY_BUFFER, this.innerPentagonUVBO);
        gl.enableVertexAttribArray(gAUV);
        gl.vertexAttribPointer(gAUV, 2, gl.FLOAT, false, 0, 0);
        
        gl.drawArrays(gl.TRIANGLES, 0, this.innerPentagonCount);
        
        gl.disableVertexAttribArray(gAPos);
        gl.disableVertexAttribArray(gAUV);
      }
      
      // Restaurar blend aditivo y desactivar depth para siguientes elementos
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
    }

    // SEGUNDO: Dibujar pentáculo y círculo encima con depth test
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    
    gl.useProgram(this.pentacleProgram);
    const uM = this.pentacleUniforms['modelMatrix']; if (uM) gl.uniformMatrix4fv(uM, false, portal.modelMatrix);
    const uV = this.pentacleUniforms['viewMatrix']; if (uV) gl.uniformMatrix4fv(uV, false, view);
    const uP = this.pentacleUniforms['projectionMatrix']; if (uP) gl.uniformMatrix4fv(uP, false, proj);
    const uT = this.pentacleUniforms['time']; if (uT) gl.uniform1f(uT, timeSec);
    // Mezclar color del pentáculo entre hostil (rojo) y concord (azul) según el sello
    let sealStrength = portal.getConcordSealStrength();
    if (!Number.isFinite(sealStrength)) {
      sealStrength = portal.concordSealActive ? 1 : 0;
    }
    sealStrength = Math.max(0, Math.min(1, sealStrength));
    const hostile = [0.75, 0.0, 0.18];
    const allied = [0.12, 0.58, 1.0];
    const mixColor: [number, number, number] = [
      hostile[0] + (allied[0] - hostile[0]) * sealStrength,
      hostile[1] + (allied[1] - hostile[1]) * sealStrength,
      hostile[2] + (allied[2] - hostile[2]) * sealStrength,
    ];
    const uC = this.pentacleUniforms['color']; if (uC) gl.uniform3fv(uC, new Float32Array(mixColor));
    const aPos = this.pentacleAttribs['position'];
    if (aPos < 0) return;
    // 1) Círculo grueso (anillo)
    if (this.circleRingVBO && this.circleRingCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.circleRingVBO);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.circleRingCount);
      gl.disableVertexAttribArray(aPos);
    }
    // 2) Pentáculo grueso (triángulos)
    if (this.pentacleThickVBO && this.pentacleThickCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pentacleThickVBO);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, this.pentacleThickCount);
      gl.disableVertexAttribArray(aPos);
    }
    
    // Restaurar estado (desactivar depth test)
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
  }

  /** Devuelve la localización del atributo de posición para el shader de halo. */
  public getHaloPositionAttribLocation(): number {
    return (this.shaders as any).portalAttributes['position'] ?? -1;
  }
}
